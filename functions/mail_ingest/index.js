'use strict';
console.log('Starting...');

const fetch = require('node-fetch');
const co = require('co');
const AWS = require('aws-sdk');
const s3 = new AWS.S3({params: {Bucket: 'sentimentality-ft-content'}, region:'eu-west-1'});
const db = new AWS.DynamoDB.DocumentClient();
const cheerio = require('cheerio');

const DB_TABLE = 'mail_content';

function fetchError(response){
	let err = new Error(`Fetch Error: ${response.status} ${response.statusText}`);
	err.type = 'FETCH_ERROR';
	err.status = response.status;
	return response.text().then(text => {
		try{
			let obj = JSON.parse(text);
			err.data = obj.query.errors || obj;
		}catch(e){
			err.data = text;
		}

		throw err;
	});
}

function getContent(uid){
	return fetch(uid)
		.then(response => {
			if(!response.ok){
				fetchError(response);
			}

			return response.text();
		})
		.then(html => {
			let $ = cheerio.load(html);
			
			return {
				headline: $('.article-text h1').text(),
				body: '',
				date: '',
				section : 'immigration'
			}
		})
}

function saveContent(uid, content){
	console.log('S3 UPLOAD', uid);
	return new Promise((resolve, reject) => {
		s3.upload({
			Key: uid,
			Body: content,
			ACL: 'authenticated-read',
			ContentType: 'application/json',
			ContentEncoding: 'utf8'
		}, (err) => {
			if(err){
				return reject(err);
			}

			resolve({success:true});
		})
	});
}

function getUids(){
	let params = {
		TableName : DB_TABLE,
		FilterExpression : 'ingested = :no',
		ExpressionAttributeValues : {':no' : 0}
	};

	return new Promise((resolve, reject) => {
		db.scan(params, (err, data) => {
			if(err){
				return reject(err);
			}

			resolve(data.Items.map(i => i.uid));
		})
	})
}

function updateDB(uid){
	return new Promise((resolve, reject) =>
	{
		let params = {
			TableName: DB_TABLE,
			Key: {
				"uid": uid
			},
			UpdateExpression: 'SET ingested = :ingested, ingested_date = :ingested_date',
			ExpressionAttributeValues: {
				":ingested" : 1,
				":ingested_date": new Date().toString()
			},
			ReturnValues:'UPDATED_NEW'
		};
		console.log('UPDATE DB', params);
		db.update(params, (err, data) => {
			if(err){
				reject(err);
			}else{
				console.log('DB UPDATE SUCCEEDED', data);
				resolve();
			}
		});
	});
}

function deleteItem(uid){
	let params = {
		TableName: DB_TABLE,
		Key: {
			uid: uid
		}
	};
	return new Promise((resolve, reject) => {
		db.delete(params, (err, data) => {
			if(err){
				reject(err);
			}else{
				console.log('ITEM REMOVED', uid);
				resolve();
			}
		});
	});

}

exports.handle = (e, context) => {
	return co(function* (){
		let uids = yield getUids();
		console.log(`Found ${uids.length} uids to ingest`);

		for(let uid of uids){
			console.log('GET ' + uid);
			let content = yield getContent(uid).catch(err => {
				console.error(err);
				return deleteItem(uid);
			});

			return content;

			// if(!content){
			// 	continue;
			// }
			//
			// console.log('RECEIVED ', uid);
			// yield saveContent(uid, content);
			// console.log('SAVED ' + uid);
			// yield updateDB(uid);
			// console.log('DB UPDATED ' + uid);
		}

		console.log('All items ingested');
		return {stage:'ingest', count:uids.length};
	})
		.then(context.succeed)
		.catch(err => {

			console.error(err.message);
			if(err.stack){
				console.error(err.stack);
			}

			context.fail('Task failed: ' + err.message);
		});
};
