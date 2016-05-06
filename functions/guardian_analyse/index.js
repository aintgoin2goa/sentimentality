'use strict';
console.log('STARTING...');
const util = require('util');
const path = require('path');
const analyze = require('Sentimental').analyze;
const co = require('co');
const fetch = require('signed-aws-es-fetch');

const AWS = require('aws-sdk');
const s3 = new AWS.S3({params: {Bucket: 'sentimentality-guardian-content'}, region:'eu-west-1'});
const CREDS = new AWS.EnvironmentCredentials('AWS');

const db = new AWS.DynamoDB.DocumentClient();
const DB_TABLE = 'guardian_content';

const ES_HOST = 'search-sentimentality-4ov3nf6o7h7vbdqbky7csi53zu.eu-west-1.es.amazonaws.com';
const INDEX_NAME = 'refugees';
const INDEX_TYPE = 'guardian';

function getArticlestoAnalyse(){
	let params = {
		TableName : DB_TABLE,
		FilterExpression : 'analysed = :no',
		ExpressionAttributeValues : {':no' : 0}
	};

	return new Promise((resolve, reject) => {
		db.scan(params, (err, data) => {
			if(err){
				return reject(err);
			}

			resolve(data.Items.map(i => i.uid));
		})
	})
}

function updateDB(uid){
	return new Promise((resolve, reject) =>
	{
		let params = {
			TableName: DB_TABLE,
			Key: {
				"uid": uid
			},
			UpdateExpression: 'SET analysed = :analysed, analysed_date = :analysed_date',
			ExpressionAttributeValues: {
				":analysed" : 1,
				":analysed_date": new Date().toString()
			},
			ReturnValues:'UPDATED_NEW'
		};
		console.log('UPDATE DB', params);
		db.update(params, (err, data) => {
			if(err){
				reject(err);
			}else{
				console.log('DB UPDATE SUCCEEDED', data);
				resolve();
			}
		});
	});
}

function getItem(key){
	return new Promise((resolve, reject) => {
		s3.getObject({
			Key: key
		}, (err, data) => {
			if(err){
				reject(err);
			}

			let item = JSON.parse(data.Body.toString('utf8'));
			resolve(item);
		});
	});
}

function removeHTMLTags(body){
	let regex = /<.+?>/ig;
	return body.replace(regex, '');
}

function analyseItem(item){
	let result = {
		publication: 'guardian',
		uid: item.content.id,
		headline: item.content.fields.headline,
		section: item.content.sectionName,
		publication_date: item.content.webPublicationDate,
		analysis: {
			headline : {},
			body: {}
		}
	};
	let body = removeHTMLTags(item.content.fields.body);
	result.analysis.headline = analyze(item.content.fields.headline);
	result.analysis.body = analyze(body);
	return result;
}

function elasticSearchBody(results){
	let lines = [];
	for(let result of results){
		lines.push(JSON.stringify({index: {_id: result.uid}}));
		lines.push(JSON.stringify(result));
	}
	lines.push('\n');
	return lines.join('\n');
}

function sendToElasticSearch(data){
	let url = `https://${ES_HOST}/${INDEX_NAME}/${INDEX_TYPE}/_bulk`;
	let opts = {
		method: 'POST',
		body:elasticSearchBody(data)
	};
	console.log('ES REQUEST', url, util.inspect(opts, {depth:null}));
	return fetch(url, opts, CREDS)
		.then(response => {
			if(!response.ok){
				let err = new Error(`Bad Response from ElasticSearch: ${response.status} ${response.statusText}`);
				err.name = 'BAD_ES_RESPONSE';
				err.status = response.status;
				console.error(err);
			}

			return response.json();
		})
}


exports.handle = (e, context) => {
	console.log('HANDLE', e);
	console.log('CREDS', CREDS);
	let results = [];
	co(function* (){
		let keys = yield getArticlestoAnalyse();
		for(let key of keys){
			console.log('GET ITEM', key);
			let item = yield getItem(key);
			console.log('ITEM RETRIEVED', item.response.content.id);
			let analysisResult = analyseItem(item.response);
			console.log('ITEM ANALYSED', item.response.content.id);
			results.push(analysisResult);
		}
		console.log('STORE RESULTS');
		let response = yield sendToElasticSearch(results);
		console.log(`RESULTS SENT TO ES errors=${response.errors} items=${response.items.length}`);
		for(let result of results){
			yield updateDB(result.uid);
		}
		return results;
	})
		.then(context.succeed)
		.catch(context.fail);
};
