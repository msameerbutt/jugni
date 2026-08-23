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
# Which file under trips/<slug>/input/ to build. `default` is the trip itself;
# an exported copy dropped back in as input1.json is built with NAME=input1.
NAME  ?= default
# An explicit path, when you want to point at a file outside the trip layout.
INPUT ?=
OUT   ?= trips/$(TRIP)/jugni.html
FROM  ?=

.PHONY: help build check icons generate update validate test shell run down rebuild image clean

help: ## Show this help
	@echo "Jugni — make targets (all run inside Docker)"
	@echo
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[1m%-12s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo "Variables:  TRIP=<slug> (default: $(TRIP))   NAME=<input file, default: default>"
	@echo "            INPUT=<explicit path>   OUT=<path>   FROM=<raw dir or file>"

$(STAMP): Dockerfile docker-compose.yml requirements.txt
	@mkdir -p .make
	$(COMPOSE) build jugni
	@touch $(STAMP)

image: $(STAMP) ## Build the tooling image if its inputs changed

build: image ## Bundle src/ into one self-contained app file (NAME=<input> to pick a different input)
	$(RUN) python scripts/build.py --trip "$(TRIP)" --name "$(NAME)" --input "$(INPUT)" --out "$(OUT)"

check: image ## Verify a built file: JS parses, no external assets, no unreplaced placeholders
	$(RUN) python scripts/check.py --file "$(OUT)"

icons: image ## Vendor icon/flag SVGs from the image into src/icons/ (FLAGS=all for every flag)
	$(RUN) python scripts/icons.py --flags "$(FLAGS)"

generate: image ## Step one for a trip: make its folders, then read raw/ into intake and build
	$(RUN) python scripts/generate.py --trip "$(TRIP)" --from "$(FROM)" --name "$(NAME)"
	$(MAKE) --no-print-directory validate TRIP=$(TRIP) NAME=$(NAME)
	$(MAKE) --no-print-directory build TRIP=$(TRIP) NAME=$(NAME)
	$(MAKE) --no-print-directory check TRIP=$(TRIP)

update: image ## Re-apply reviewed-and-locked Skills and rebuild only what changed
	$(RUN) python scripts/update.py --trip "$(TRIP)"

validate: image ## Check a trip's input file against the schema shape (spec §4)
	$(RUN) python scripts/validate.py --trip "$(TRIP)" --name "$(NAME)" --input "$(INPUT)"

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

clean: ## Remove build artifacts (never touches raw/, intake/ or input/)
	$(RUN) python scripts/clean.py --trip "$(TRIP)"

test: image ## Run the tooling tests (paths, intake accumulation)
	$(RUN) python -m pytest
