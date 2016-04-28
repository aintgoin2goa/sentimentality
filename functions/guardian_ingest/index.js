'use strict';
console.log('Starting...');

const fetch = require('node-fetch');
const co = require('co');
const AWS = require('aws-sdk');
const s3 = new AWS.S3({params: {Bucket: 'sentimentality-guardian-content'}, region:'eu-west-1'});
const db = new AWS.DynamoDB.DocumentClient();

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

function updateDB(uid){
	return new Promise((resolve, reject) =>
	{
		let params = {
			TableName: 'guardian_content',
			Key: {
				"uid": uid
			},
			UpdateExpression: 'SET crawled = :crawled',
			ExpressionAttributeValues: {
				":crawled" : true
			},
			ReturnValues:'UPDATED_NEW'
		};
		console.log('UPDATE DB', params);
		db.update(params, (err, data) => {
			if(err){
				reject(err);
			}else{
				console.log('DB UPDATE SUCCEEDED');
				resolve();
			}
		});
	});
}

exports.handle = (e, context) => {
	return co(function* (){
		let uids = e.uids;
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
		return e;
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
