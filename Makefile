.PHONY: test

install:
	npm install

test:
	# empty task

deploy:
	node scripts/deploy.js

run-guardian-search:
	node getDates.js guardian | \
	apex invoke guardian_search --profile sentimentality --region eu-west-1 | \
	node updateConfig.js guardian

run-guardian-ingest:
	apex invoke guardian_ingest  --profile sentimentality --region eu-west-1

run-guardian-analyse:
	apex invoke guardian_analyse --profile sentimentality --region eu-west-1

run-ft-search:
	node getDates.js ft | \
	apex invoke ft_search --profile sentimentality --region eu-west-1
logs:
	apex logs ${f} --profile sentimentality --region eu-west-1

wait:
	sleep 30

run-guardian: run-guardian-search run-guardian-ingest run-guardian-analyse

run: run-guardian
