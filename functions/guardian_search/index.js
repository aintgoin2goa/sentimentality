'use strict';
console.log('Starting...');

const fetch = require('node-fetch');
const co = require('co');
const AWS = require('aws-sdk');
const docClient = new AWS.DynamoDB.DocumentClient();

function fetchError(response){
	let err = new Error(`Fetch Error: ${response.status} ${response.statusText}`);
	err.type = 'FETCH_ERROR';
	err.status = response.status;
	throw err;
}

function getReleventTags(){
	let apiKey = process.env.GUARDIAN_API_KEY;
	let url = `http://content.guardianapis.com/tags?q=refugee&api-key=${apiKey}`;
	return fetch(url)
		.then(response => {
			if(!response.ok){
				fetchError(response);
			}

			return response.json();
		})
		.then(json => {
			return json.response.results.map(r => r.id);
		})
}

function searchGuardianContentPage(fromDate, tag, page){
	let apiKey = process.env.GUARDIAN_API_KEY;
	let pageSize = 100;
	let query = 'refugee';
	let url = `http://content.guardianapis.com/search?tag=${encodeURIComponent(tag)}&from-date=${fromDate}&page-size=${pageSize}&page=${page}&q=${query}&api-key=${apiKey}`;
	console.log('FETCH ' + url);
	return fetch(url)
		.then(response => {
			if(!response.ok){
				let err = new Error(`Bad Response from server: ${response.status} ${response.statusText}`);
				err.type = 'BAD_RESPONSE_ERROR';
				err.status = response.status;
				throw err;
			}

			return response.json();
		})
}



function searchGuardianContent(fromDate, tag){
	let page = 1;
	return co(function* (){
		let data = yield searchGuardianContentPage(fromDate, tag, page);
		console.log(`RECEIVED DATA page=1 total_pages=${data.response.pages}`);
		while(data.response.pages > page){
			page++;
			let moreData = yield searchGuardianContentPage(fromDate, tag, page);
			console.log(`RECEIVED DATA page=${page}`);
			data.response.results = data.response.results.concat(moreData.response.results);
		}
		let uids = data.response.results.map(r => r.id);
		return uids;
	});
}

function insertUid(uid){
	console.log('INSERT ' + uid);
	return new Promise((resolve, reject) => {
		docClient.put({
			TableName: 'guardian_content',
			Item: {
				uid: uid,
				date_found: new Date().toString(),
				ingested: false,
				analysed: false
			},
			ConditionExpression: 'attribute_not_exists(uid)'
		}, (err, data) => {
			if(err){
				if(!/The conditional request failed/i.test(err.message)){
					console.log('INSERT_UID_ERROR ' + err.message);
					return reject(err);
				}else{
					console.log('UID_EXISTS ' + uid);
					return resolve(null);
				}
			}else{
				console.log('UID_INSERTED ' + uid);
			}

			resolve(uid);
		});
	})
}

exports.handle = (e, context) => {
	co(function* (){
		let uids = [];
		let tags = yield getReleventTags();
		console.log('TAGS', tags);
		for(let tag of tags){
			console.log('GET CONTENT FOR TAG', tag);
			let content = yield searchGuardianContent(e.fromDate, tag);
			let uidsFound = yield Promise.all(content.map(insertUid));
			uids = uids.concat(uidsFound.filter(u => u));
		}

		return {uids:uids};
	})
		.then(context.succeed)
		.catch(err => {
			console.error(err.stack || err.message);
			context.fail(err);
		});
};
