'use strict';
process.stdin.setEncoding('utf8');
const fs = require('fs');
const moment = require('moment');
const config = require('./config.json');
const publication = process.argv[2];
const dateFormat = config[publication].date_format;

process.stdin.on('readable', () => {
	let input = process.stdin.read();
	let data = JSON.parse(input);
	console.log(data);

	let toDate = moment(data.toDate);
	config[publication].last_searched = dateFormat === 'UTC' ? toDate.utc().format() : toDate.format(dateFormat);
	fs.writeFileSync('./config.json', JSON.stringify(config, null, 2), {encoding:'utf8'});
	process.exit(0);
});
