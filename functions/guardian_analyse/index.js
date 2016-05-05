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
const ES_HOST = 'search-sentimentality-4ov3nf6o7h7vbdqbky7csi53zu.eu-west-1.es.amazonaws.com';
const ES_PATH = '/analysis/guardian/_bulk';


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
	console.log('CLEAN HTML', body);
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
			Sentimentality: {
				headline : {},
				body: {}
			}
		}
	};
	let body = removeHTMLTags(item.content.fields.body);
	result.analysis.Sentimentality.headline = analyze(item.content.fields.headline);
	result.analysis.Sentimentality.body = analyze(body);
	return result;
}

function elasticSearchBody(results){
	let lines = [];
	for(let result of results){
		lines.push(JSON.stringify({index: {_id: result.uid}}));
		lines.push(JSON.stringify(result));
	}

	return lines.join('\n');
}

function sendResultsToElasticSearch(results){
	let url = `https://${ES_HOST}${ES_PATH}`;
	let opts = {
		method: 'POST',
		body:elasticSearchBody(results)
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
	let results = [];
	co(function* (){
		let keys = e.uids;
		for(let key of keys){
			console.log('GET ITEM', key);
			let item = yield getItem(key);
			console.log('ITEM RETRIEVED', item);
			let analysisResult = analyseItem(item.response);
			console.log('ITEM ANALYSED', util.inspect(analysisResult, {depth:null}));
			results.push(analysisResult);
		}
		console.log('STORE RESULTS');
		let response = yield sendResultsToElasticSearch(results);
		console.log('COMPLETE', response);
		return results;
	})
		.then(context.succeed)
		.catch(context.fail);
};
