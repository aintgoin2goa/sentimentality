.PHONY: test

install:
	npm install

test:
	# empty task

deploy:
	node scripts/deploy.js

test-search-guardian:
	echo '{"fromDate":"2016-04-07"}' | apex invoke search-guardian --profile sentimentality --region eu-west-1

test: test-search-guardian

logs:
	apex logs search-guardian --profile sentimentality --region eu-west-1
