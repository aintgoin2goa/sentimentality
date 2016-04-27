'use strict';

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const exec = require('child_process').exec;

const ENV_FILE = path.resolve(__dirname, '../.env');

function getEnvVars(){
	let envFileContents = fs.readFileSync(ENV_FILE);
	return dotenv.parse(envFileContents);
}

function getEnvVarString(){
	let envVarParts = [];
	let vars = getEnvVars();
	for(let v of Object.keys(vars)){
		envVarParts.push(`-s ${v}=${vars[v]}`);
	}

	return envVarParts.join(' ');
}

function getExecString(){
	return `apex deploy --profile sentimentality --region eu-west-1 ${getEnvVarString()}`;
}

let execString = getExecString();
console.log(execString);
exec(execString, {cwd:path.resolve(__dirname, '../')}, function(err, stdout, stderr){
	if(err){
		console.error(err.stack);
	}

	console.error(stderr);
	console.log(stdout)
});
