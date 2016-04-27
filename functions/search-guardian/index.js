'use strict';
console.log('Starting...');

const fetch = require('node-fetch');
const co = require('co');
const AWS = require('aws-sdk');
const docClient = new AWS.DynamoDB.DocumentClient()

function searchGuardianContentPage(fromDate, page){
	let apiKey = process.env.GUARDIAN_API_KEY;
	let pageSize = 100;
	let query = 'refugee';
	let url = `http://content.guardianapis.com/search?from-date=${fromDate}&page-size=${pageSize}&page=${page}&q=${query}&api-key=${apiKey}`;
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



function searchGuardianContent(fromDate){
	let page = 1;
	return co(function* (){
		let data = yield searchGuardianContentPage(fromDate, page);
		console.log(`RECEIVED DATA page=1 total_pages=${data.response.pages}`);
		while(data.response.pages > page){
			page++;
			let moreData = yield searchGuardianContentPage(fromDate, page);
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
				uid: uid
			},
			ConditionExpression: 'attribute_not_exists(uid)'
		}, (err, data) => {
			if(err){
				if(!/The conditional request failed/i.test(err.message)){
					console.log('INSERT_UID_ERROR ' + err.message);
					return reject(err);
				}else{
					console.log('UID_EXISTS ' + uid);
				}

			}

			resolve(data);
		});
	})
}

exports.handle = (e, context) => {
	co(function* (){
		let results = yield searchGuardianContent(e.fromDate);
		return Promise.all(results.map(insertUid));
	})
		.then(context.succeed)
		.catch(context.fail);
};
