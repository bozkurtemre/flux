# Flux — desktop log explorer for Graylog
# `make` alone lists the targets.

SHELL := /bin/bash
PNPM  := pnpm
CARGO_DIR := src-tauri
APP := $(CARGO_DIR)/target/release/bundle/macos/Flux.app

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

.PHONY: install
install: ## Install JavaScript dependencies
	$(PNPM) install

.PHONY: dev
dev: ## Run the app with hot reload
	$(PNPM) tauri dev

.PHONY: build
build: ## Type-check and bundle the front end
	$(PNPM) build

.PHONY: app
app: ## Build Flux.app for this machine
	$(PNPM) tauri build --bundles app
	@echo "built $(APP)"

.PHONY: bundle
bundle: ## Build every installer for this platform (.app and .dmg on macOS)
	$(PNPM) tauri build

.PHONY: icons
icons: ## Regenerate the app icons from assets/logo-app.png
	$(PNPM) tauri icon assets/logo-app.png

.PHONY: typecheck
typecheck: ## Type-check without emitting
	$(PNPM) typecheck

.PHONY: lint
lint: ## Lint TypeScript
	$(PNPM) lint

.PHONY: fmt
fmt: ## Format TypeScript and Rust in place
	$(PNPM) format
	cd $(CARGO_DIR) && cargo fmt

.PHONY: fmt-check
fmt-check: ## Fail if anything is unformatted
	$(PNPM) format:check
	cd $(CARGO_DIR) && cargo fmt --check

.PHONY: clippy
clippy: ## Lint Rust
	cd $(CARGO_DIR) && cargo clippy --all-targets -- -D warnings

.PHONY: test
test: ## Run the unit tests
	$(PNPM) test

.PHONY: check
check: typecheck lint fmt-check test clippy ## Run every check CI runs

.PHONY: hooks
hooks: ## Point git at the repo's hooks, so the quality gate runs before every commit
	git config core.hooksPath .githooks
	@echo "pre-commit hook active"

.PHONY: version
version: ## Print the current version
	@node scripts/version.mjs

.PHONY: bump-patch bump-minor bump-major
bump-patch: ## Bump the patch version, commit and tag
	@$(MAKE) --no-print-directory bump PART=patch
bump-minor: ## Bump the minor version, commit and tag
	@$(MAKE) --no-print-directory bump PART=minor
bump-major: ## Bump the major version, commit and tag
	@$(MAKE) --no-print-directory bump PART=major

.PHONY: bump
bump:
	@test -z "$$(git status --porcelain)" || { echo "working tree is dirty; commit or stash first"; exit 1; }
	@$(MAKE) --no-print-directory check
	@v=$$(node scripts/version.mjs $(PART)) && \
		git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json && \
		git commit -m "Release v$$v" && \
		git tag -a "v$$v" -m "v$$v" && \
		echo "tagged v$$v — push it with: make publish"

.PHONY: publish
publish: ## Push the branch and its tags, which triggers the release workflow
	git push origin HEAD
	git push origin --tags

.PHONY: clean
clean: ## Remove build output
	rm -rf dist
	cd $(CARGO_DIR) && cargo clean
