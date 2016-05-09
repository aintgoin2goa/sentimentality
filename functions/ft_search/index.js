'use strict';
console.log('Starting...');

const fetch = require('node-fetch');
const co = require('co');
const AWS = require('aws-sdk');
const docClient = new AWS.DynamoDB.DocumentClient();
const util = require('util');

const DB_TABLE = 'ft_content';

function fetchError(response){
	let err = new Error(`Fetch Error: ${response.status} ${response.statusText}`);
	err.type = 'FETCH_ERROR';
	err.status = response.status;
	return response.json().then(json => {
		err.data = json.query.errors;
		throw err;
	});
}

function searchFT(fromDate, toDate){
	let searchTerm = 'refugees';
	let url = 'http://api.ft.com/content/search/v1';
	let opts = {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Api-Key': process.env.FT_API_KEY
		},
		body: JSON.stringify({
			"queryString": `${searchTerm} AND lastPublishDateTime:>${fromDate} AND lastPublishDateTime:<${toDate}`,
			"queryContext" : {
				"curations": ["ARTICLES"]
			}
		})
	};

	console.log('FETCH', url, opts);

	return fetch(url, opts)
		.then(response => {
			if(!response.ok){
				return fetchError(response);
			}else{
				return response.json();
			}
		})
}

function insertUid(uid){
	console.log('INSERT ' + uid);
	return new Promise((resolve, reject) => {
		docClient.put({
			TableName: DB_TABLE,
			Item: {
				uid: uid,
				date_found: new Date().toString(),
				ingested: 0,
				analysed: 0
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
		let content = yield searchFT(e.fromDate, e.toDate);
		let uids = content.results[0].results.map(r => r.id);
		yield Promise.all(uids.map(insertUid));
		return e;
	})
		.then(context.succeed)
		.catch(err => {
			console.error(err);
			context.fail(err);
		});
};
