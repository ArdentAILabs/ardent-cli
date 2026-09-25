NPM ?= npm

.DEFAULT_GOAL := ci
.PHONY: ci install typecheck test build pack

ci: install typecheck test pack

install:
	$(NPM) ci

typecheck:
	$(NPM) run typecheck

test:
	$(NPM) test

build:
	$(NPM) run build

pack:
	$(NPM) pack --dry-run
