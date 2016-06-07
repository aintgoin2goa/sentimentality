'use strict';
console.log('Starting...');

const fetch = require('node-fetch');
const co = require('co');
const aws = require('sentimentality-utils').aws;

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
	return aws.s3.upload('sentimentality-guardian-content', uid, content);
}

function getUids(){
	return aws.dynamodb.find(DB_TABLE, 'ingested', 0);
}

function updateDB(uid){
	return aws.dynamodb.update(DB_TABLE, uid, {'ingested':1, 'ingested_date':new Date().toString()});
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
