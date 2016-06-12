'use strict';
console.log('Starting...');

const fetch = require('node-fetch');
const co = require('co');
const aws = require('sentimentality-utils').aws;

const DB_TABLE = 'ft_content';
const BUCKET = 'sentimentality-ft-content';

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
	let url = 'http://api.ft.com/content/items/v1/' + uid;
	let opts = {
		headers: {
			'X-Api-Key': 'z6cc2j7dybhbbcg8ybbfgbjn'
		}
	};

	return fetch(url, opts)
		.then(response => {
			if(!response.ok){
				return fetchError(response);
			}else{
				return response.text();
			}
		});
}

function saveContent(uid, content){
	return aws.s3.upload(BUCKET, uid, content);
}

function getUids(){
	return aws.dynamodb.find(DB_TABLE, 'ingested', 0);
}

function updateDB(uid){
	return dynamodb.update(DB_TABLE, uid, {'ingested':1, 'ingested_date':new Date().toString()});
}

function deleteItem(uid){
	return dynamodb.delete(DB_TABLE, uid);
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

			if(!content){
				continue;
			}

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
