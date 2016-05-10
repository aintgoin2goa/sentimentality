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

function findArticles(){
	let url = 'http://www.dailymail.co.uk/news/immigration/index.rss';
	return new Promise((resolve, reject) => {
		feed(url, (err, articles) => {
			if(err){
				return reject(err);
			}

			resolve(articles);
		})
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
		let content = yield findArticles();
		let uids = content.map(a => a.link);
		let saved = yield Promise.all(uids.map(insertUid));
		return Object.assign(e, {stage:'search', count:saved.filter(s => s).length});
	})
		.then(context.succeed)
		.catch(err => {
			console.error(err);
			context.fail(err);
		});
};
