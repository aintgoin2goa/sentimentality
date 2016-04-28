'use strict';
console.log('STARTING...');
const util = require('util');
const path = require('path');
const analyze = require('Sentimental').analyze;
const co = require('co');
const fetch = require('node-fetch');
const AWS = require('aws-sdk');
const esDomain = {
	endpoint: 'search-sentimentality-4ov3nf6o7h7vbdqbky7csi53zu.eu-west-1.es.amazonaws.com',
	region: 'eu-west-1',
	index: 'analysis'
};
const endpoint =  new AWS.Endpoint(esDomain.endpoint);
const s3 = new AWS.S3({params: {Bucket: 'sentimentality-guardian-content'}, region:'eu-west-1'});
const CREDS = new AWS.EnvironmentCredentials('AWS');

const ES_HOST = 'search-sentimentality-4ov3nf6o7h7vbdqbky7csi53zu.eu-west-1.es.amazonaws.com';
const ES_UPDATE_PATH = '/_bulk';

function fetchError(response){
	let err = new Error(`Fetch Error: ${response.status} ${response.statusText}`);
	err.type = 'FETCH_ERROR';
	err.status = response.status;
	return err;
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

function sendResultsToElasticSearch(results){
	var req = new AWS.HttpRequest(endpoint);

	req.method = 'POST';
	req.path = path.join('/', esDomain.index);
	req.region = esDomain.region;
	req.body = JSON.stringify(results);
	req.headers['presigned-expires'] = false;
	req.headers['Host'] = endpoint.host;

	// Sign the request (Sigv4)
	var signer = new AWS.Signers.V4(req, 'es');
	signer.addAuthorization(CREDS, new Date());
	return new Promise((resolve, reject) => {
		var send = new AWS.NodeHttpClient();
		send.handleRequest(req, null, function(httpResp) {
			var body = '';
			httpResp.on('data', function (chunk) {
				body += chunk;
			});
			httpResp.on('end', function (chunk) {
				resolve()
			});
		}, function(err) {
			reject(err);
		});
	});
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
		for(let result of results){
			yield sendResultsToElasticSearch(result);
		}
		console.log('COMPLETE');
		return results;
	})
		.then(context.succeed)
		.catch(context.fail);
};
