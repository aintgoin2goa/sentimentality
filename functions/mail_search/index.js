'use strict';
console.log('Starting...');

const fetch = require('node-fetch');
const co = require('co');
const AWS = require('aws-sdk');
const docClient = new AWS.DynamoDB.DocumentClient();
const feed = require('feed-read');

const DB_TABLE = 'mail_content';

function fetchError(response){
	let err = new Error(`Fetch Error: ${response.status} ${response.statusText}`);
	err.type = 'FETCH_ERROR';
	err.status = response.status;
	return response.text().then(text => {
		err.data = text;
		throw err;
	});
}

function findArticles(fromDate, toDate){
	let key = process.env.GOOGLE_SEARCH_API_KEY;
	let cx = '010661321837660961072:8cwp3bqupww';
	let q = 'refugee';
	let fields = 'queries/nextPage/startIndex,items/link';
	let sort = `date:r:${fromDate}:${toDate}`;
	let url = (startIndex) => {
		return `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${q}&fields=${fields}&sort=${sort}&start=${startIndex}`;
	};
	console.log('fetch', url(1));
	let doFetch = index => {
		return co(function* (){
			let response = yield fetch(url(index));
			if(!response.ok){
				return null;
			}
			let data = yield response.json();
			return {
				next: data.queries.nextPage.startIndex,
				data: data.items.map(d => d.link).filter(d => d.indexOf('http://www.dailymail.co.uk/news/article-') === 0)
			};
		});
	};
	return co(function* (){
		let index = 1;
		let result;
		let found = [];
		while(result = yield doFetch(index)){
			found = found.concat(result.data);
			index = result.next;
		}

		return found;
	});

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
		let content = yield findArticles(e.fromDate, e.toDate);
		let uids = content.map(a => a.replace('http://www.dailymail.co.uk/', ''));
		console.log('found', uids);
		let saved = yield Promise.all(uids.map(insertUid));
		console.log('saved', uids);
		return Object.assign(e, {stage:'search', count:saved.filter(s => s).length});
	})
		.then(context.succeed)
		.catch(err => {
			console.error(err);
			context.fail(err);
		});
};
