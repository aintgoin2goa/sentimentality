'use strict';
console.log('Starting...');

const fetch = require('node-fetch');
const co = require('co');
const aws = require('sentimentality-utils').aws;

const DB_TABLE = 'guardian_content';

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

function searchGuardianContentPage(fromDate, toDate, tag, page){
	let apiKey = process.env.GUARDIAN_API_KEY;
	let pageSize = 100;
	let query = 'refugee';
	let url = `http://content.guardianapis.com/search?tag=${encodeURIComponent(tag)}&from-date=${fromDate}&to-date=${toDate}&page-size=${pageSize}&page=${page}&q=${query}&api-key=${apiKey}`;
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



function searchGuardianContent(fromDate, toDate, tag){
	let page = 1;
	return co(function* (){
		let data = yield searchGuardianContentPage(fromDate, toDate, tag, page);
		console.log(`RECEIVED DATA page=1 total_pages=${data.response.pages}`);
		while(data.response.pages > page){
			page++;
			let moreData = yield searchGuardianContentPage(fromDate, toDate, tag, page);
			console.log(`RECEIVED DATA page=${page}`);
			data.response.results = data.response.results.concat(moreData.response.results);
		}
		let uids = data.response.results.map(r => r.id);
		return uids;
	});
}

function insertUid(uid){
	return aws.dynamodb.insert(DB_TABLE, uid);
}

exports.handle = (e, context) => {
	co(function* (){
		console.log('begin search', e);
		let uids = [];
		let tags = yield getReleventTags();
		let count = 0;
		console.log('TAGS', tags);
		for(let tag of tags){
			console.log('GET CONTENT FOR TAG', tag);
			let content = yield searchGuardianContent(e.fromDate, e.toDate, tag);
			let uidsFound = yield Promise.all(content.map(insertUid));
			uids = uids.concat(uidsFound.filter(u => u));
		}

		return {fromDate:e.fromDate, toDate:e.toDate, found:uids.length}
	})
		.then(context.succeed)
		.catch(err => {
			console.error(err.stack || err.message);
			context.fail(err);
		});
};
