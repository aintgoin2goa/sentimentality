.PHONY: test

install:
	npm install

test:
	# empty task

deploy:
	node scripts/deploy.js

test-guardian-search:
	echo '{"fromDate":"2016-04-07"}' | apex invoke guardian_search --profile sentimentality --region eu-west-1

test-guardian-ingest:
	echo '{"uids":["australia-news/2016/apr/18/manus-island-detainees-plead-anywhere-but-papua-new-guinea"]}' | apex invoke guardian_ingest  --profile sentimentality --region eu-west-1

test-guardian-analyse:
	echo '{"uids":["world/2016/apr/26/refugee-children-need-our-protection"]}' | apex invoke guardian_analyse --profile sentimentality --region eu-west-1

test: test-guardian-analyse

logs:
	apex logs ${f} --profile sentimentality --region eu-west-1

run-guardian:
	echo '{"fromDate":"2016-04-07"}' | \
	apex invoke guardian_search --profile sentimentality --region eu-west-1 | \
	apex invoke guardian_ingest --profile sentimentality --region eu-west-1
