'use strict';
console.log('STARTING...');
const util = require('util');
const path = require('path');
const analyze = require('Sentimental').analyze;
const aws = require('sentimentality-utils').aws;
const co = require('co');
const DB_TABLE = 'ft_content';
const BUCKET = 'sentimentality-ft-content';

function getArticlestoAnalyse(){
	return aws.dynamodb.find(DB_TABLE, {'analysed':0,'ingested':1});
}

function updateDB(uid){
	return aws.dynamodb.update(DB_TABLE, uid, {'analysed':1, 'analysed_date':new Date().toString()});
}

function getItem(key){
	return aws.s3.retrieve(BUCKET, key);
}

function removeHTMLTags(body){
	let regex = /<.+?>/ig;
	return body.replace(regex, '');
}

function analyseItem(item){
	let result = {
		publication: 'ft',
		uid: item.id,
		headline: item.title.title,
		section: item.metadata.primarySection.term.name,
		publication_date: item.lifecycle.lastPublishDateTime,
		analysis: {
			headline : {},
			body: {}
		}
	};
	let body = removeHTMLTags(item.body.body);
	result.analysis.headline = analyze(item.title.title);
	result.analysis.body = analyze(body);
	return result;
}


function sendToElasticSearch(data){
	aws.elasticsearch.sendData('ft', data);
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
			console.log('ITEM RETRIEVED', key);
			let analysisResult = analyseItem(item.item);
			console.log('ITEM ANALYSED', key);
			results.push(analysisResult);
		}
		console.log('STORE RESULTS');
		let response = yield sendToElasticSearch(results);
		if(response[0] === 'ERROR'){
			console.log('ES_ERROR', response[1], response[2]);
			throw response[1];
		}

		console.log(`RESULTS SENT TO ES errors=${response[1].errors} items=${response[1].items.length}`);
		for(let result of results){
			yield updateDB(result.uid);
		}
		return {stage:'analyse', count:results.length};
	})
		.then(context.succeed)
		.catch(context.fail);
};
