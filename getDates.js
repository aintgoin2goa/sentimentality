'use strict';
const moment = require('moment');

const config = require('./config.json');
const publication = process.argv[2];
let fromDate, toDate;

if(config[publication].mode === 'catchup'){
	fromDate = moment(config[publication].last_searched || config.first_date);
	toDate = fromDate.clone().add(config.date_chunk[0], config.date_chunk[1]);
}else{
	fromDate = moment(config[publication].last_searched);
	toDate = moment();
}

function datetoString(date, format){
	if(format === 'UTC'){
		return date.utc().format();
	}else{
		date.format(format);
	}
}

let output = {
	fromDate:datetoString(fromDate, config[publication].date_format),
	toDate: datetoString(toDate, config[publication].date_format)
};

console.log(JSON.stringify(output));
