.PHONY: test

install:
	npm install

test:
	# empty task

deploy:
	apex deploy --profile sentimentality --region eu-west-1

test-uppercase:
	echo '{"value":"foo"}' | apex invoke uppercase --profile sentimentality --region eu-west-1
