'use strict';
console.log('STARTING...');
const util = require('util');
const path = require('path');
const analyze = require('Sentimental').analyze;
const co = require('co');
const fetch = require('signed-aws-es-fetch');
const aws = require('sentimentality-utils').aws;

const DB_TABLE = 'guardian_content';


function getArticlesToAnalyse(){
	return aws.dynamodb.find(DB_TABLE, 'analysed', 0);
}

function updateDB(uid){
	return aws.dynamodb.update(DB_TABLE, uid, {'analysed':1, 'analysed_date':new Date().toString()});
}

function getItem(key){
	return aws.s3.retrieve('sentimentality-guardian-content', key);
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


function sendToElasticSearch(data){
	return aws.elasticsearch.sendData('guardian', data);
}


exports.handle = (e, context) => {
	console.log('HANDLE', e);
	let results = [];
	co(function* (){
		let keys = yield getArticlesToAnalyse();
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
