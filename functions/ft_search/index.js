'use strict';
console.log('Starting...');

const fetch = require('node-fetch');
const co = require('co');
const util = require('util');
const aws = require('sentimentality-utils').aws;

const DB_TABLE = 'ft_content';

function fetchError(response){
	let err = new Error(`Fetch Error: ${response.status} ${response.statusText}`);
	err.type = 'FETCH_ERROR';
	err.status = response.status;
	return response.text().then(text => {
		err.data = text;
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
	return aws.dynamodb.insert(DB_TABLE, uid);
}

exports.handle = (e, context) => {
	co(function* (){
		let content = yield searchFT(e.fromDate, e.toDate);
		let uids = content.results[0].results.map(r => r.id);
		yield Promise.all(uids.map(insertUid));
		return Object.assign(e, {stage:'search', count:uids.length});
	})
		.then(context.succeed)
		.catch(err => {
			console.error(err);
			context.fail(err);
		});
};
