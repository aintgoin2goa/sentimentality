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
	apex invoke ft_search --profile sentimentality --region eu-west-1 | \
	node updateConfig.js ft

run-ft-ingest:
	apex invoke ft_ingest  --profile sentimentality --region eu-west-1

run-ft-analyse:
	apex invoke ft_analyse --profile sentimentality --region eu-west-1

run-mail-search:
	apex invoke mail_search --profile sentimentality --region eu-west-1

run-mail-ingest:
	apex invoke mail_ingest --profile sentimentality --region eu-west-1



logs:
	apex logs ${f} --profile sentimentality --region eu-west-1

wait:
	sleep 30

run-guardian: run-guardian-search run-guardian-ingest run-guardian-analyse

run-ft: run-ft-search run-ft-ingest run-ft-analyse

run: run-guardian
