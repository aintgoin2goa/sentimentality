.PHONY: test

install:
	npm install

test:
	# empty task

deploy:
	node scripts/deploy.js

test-guardian-search:
	echo '{"fromDate":"2016-04-07"}' | apex invoke guardian_search --profile sentimentality --region eu-west-1

run-guardian-ingest:
	apex invoke guardian_ingest  --profile sentimentality --region eu-west-1

run-guardian-analyse:
	apex invoke guardian_analyse --profile sentimentality --region eu-west-1

logs:
	apex logs ${f} --profile sentimentality --region eu-west-1

wait:
	sleep 30

run-guardian:
	echo '{"fromDate":"2016-04-07"}' | \
	apex invoke guardian_search --profile sentimentality --region eu-west-1 | \
	apex invoke guardian_ingest --profile sentimentality --region eu-west-1 | \
	apex invoke guardian_analyse --profile sentimentality --region eu-west-1
