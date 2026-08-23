# Jugni — Contributor interface (spec §2).
#
# Every target runs INSIDE the Docker container. Nothing app-related ever runs
# on the host. If no named target fits, use `make shell` or `make run CMD="..."`.
# There is no scenario where running a project command on the host is correct.

SHELL := /bin/bash
.DEFAULT_GOAL := help

# Prefer the Compose v2 plugin, fall back to the legacy binary.
COMPOSE := $(shell if docker compose version >/dev/null 2>&1; then echo "docker compose"; else echo "docker-compose"; fi)

export JUGNI_UID := $(shell id -u)
export JUGNI_GID := $(shell id -g)

RUN := $(COMPOSE) run --rm jugni

# The image rebuilds automatically whenever its inputs change — nobody
# triggers an image build by hand.
STAMP := .make/image.stamp

TRIP  ?= default
INPUT ?= trips/$(TRIP)/input.json
OUT   ?= trips/$(TRIP)/jugni.html
FROM  ?=

.PHONY: help build check icons generate update validate shell run down rebuild image clean

help: ## Show this help
	@echo "Jugni — make targets (all run inside Docker)"
	@echo
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[1m%-12s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo "Variables:  TRIP=<slug> (default: $(TRIP))   INPUT=<path>   OUT=<path>   FROM=<raw dir or file>"

$(STAMP): Dockerfile docker-compose.yml requirements.txt
	@mkdir -p .make
	$(COMPOSE) build jugni
	@touch $(STAMP)

image: $(STAMP) ## Build the tooling image if its inputs changed

build: image ## Bundle src/ into a single self-contained app file (empty shell unless INPUT exists)
	$(RUN) python scripts/build.py --input "$(INPUT)" --out "$(OUT)"

check: image ## Verify a built file: JS parses, no external assets, no unreplaced placeholders
	$(RUN) python scripts/check.py --file "$(OUT)"

icons: image ## Vendor icon/flag SVGs from the image into src/icons/ (FLAGS=all for every flag)
	$(RUN) python scripts/icons.py --flags "$(FLAGS)"

generate: image ## Intake+Convert raw data into input.json, then build that trip's app
	$(RUN) python scripts/generate.py --trip "$(TRIP)" --from "$(FROM)"
	$(MAKE) --no-print-directory validate TRIP=$(TRIP)
	$(MAKE) --no-print-directory build TRIP=$(TRIP)
	$(MAKE) --no-print-directory check TRIP=$(TRIP)

update: image ## Re-apply reviewed-and-locked Skills and rebuild only what changed
	$(RUN) python scripts/update.py --trip "$(TRIP)"

validate: image ## Check an input.json against the schema shape (spec §4)
	$(RUN) python scripts/validate.py --input "$(INPUT)"

shell: image ## Interactive shell inside the container
	$(RUN) bash

run: image ## Run an arbitrary command inside the container: make run CMD="..."
	$(RUN) $(CMD)

down: ## Stop and remove containers/volumes
	$(COMPOSE) down --volumes --remove-orphans

rebuild: ## Force a clean image rebuild (no cache)
	@mkdir -p .make
	$(COMPOSE) build --no-cache jugni
	@touch $(STAMP)

clean: ## Remove build artifacts (never touches raw/ or a trip's input.json)
	$(RUN) python scripts/clean.py --trip "$(TRIP)"
