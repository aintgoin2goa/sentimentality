'use strict';
console.log('Starting...');

const fetch = require('node-fetch');
const co = require('co');
const AWS = require('aws-sdk');
const s3 = new AWS.S3({params: {Bucket: 'sentimentality-guardian-content'}, region:'eu-west-1'});
const db = new AWS.DynamoDB.DocumentClient();

const DB_TABLE = 'guardian_content';

function getContent(uid){
	let url = `http://content.guardianapis.com/${uid}?api-key=${process.env.GUARDIAN_API_KEY}&show-fields=headline,body`;
	console.log('FETCH ' + url);
	return fetch(url)
		.then(response => {
			if(!response.ok){
				let err = new Error(`Bad Response from Server: ${response.status} ${response.statusText}`);
				err.status = response.status;
				err.type = 'BAD_SERVER_RESPONSE';
				throw err;
			}

			return response.text();
		});
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

exports.handle = (e, context) => {
	return co(function* (){
		let uids = yield getUids();
		console.log(`Found ${uids.length} uids to ingest`);
		
		for(let uid of uids){
			console.log('GET ' + uid);
			let content = yield getContent(uid);
			console.log('RECEIVED ', uid);
			yield saveContent(uid, content);
			console.log('SAVED ' + uid);
			yield updateDB(uid);
			console.log('DB UPDATED ' + uid);
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
