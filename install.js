'use strict';
const spawn = require('child_process').spawn;
const fs = require('fs');

function runInstall(prefix, pkg){
	let cmd = 'npm';
	let args = [
		'install',
		`--prefix=${prefix}`
	];

	if(pkg){
		args.push('--save');
		args.push(pkg);
	}
	
	return spawn(cmd, args, {
		cwd: process.cwd(),
		env: process.env,
		stdio: 'inherit'
	});
}

fs.readdir('./functions/', function(err, files){
	for(let file of files){
		runInstall(`functions/${file}`, process.argv[2]);
	}
});



