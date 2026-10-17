# Flux — desktop log explorer for Graylog
# `make` alone lists the targets.

SHELL := /bin/bash
PNPM  := pnpm
CARGO_DIR := src-tauri
APP := $(CARGO_DIR)/target/release/bundle/macos/Flux.app

# The identity the bundles are signed with. Override with SIGN_ID="..."; the default is this
# machine's only codesigning identity, and an empty one just means unsigned.
SIGN_ID ?= $(shell security find-identity -v -p codesigning | awk -F'"' 'NR==1 {print $$2}')
SIGN_ENV = $(if $(SIGN_ID),APPLE_SIGNING_IDENTITY="$(SIGN_ID)",)

# A development build is signed as the release is, with the Developer ID and the app's own bundle
# identifier, so the keychain takes it for the same app and reads it the tokens the release stored
# without asking. Unsigned, every rebuild is a new caller and asks again (docs/adr/0012).
DEV_SIGN_ID ?= $(shell security find-identity -v -p codesigning | awk -F'"' '/Developer ID Application:/ {print $$2; exit}')
BUNDLE_ID ?= $(shell node -p "require('./src-tauri/tauri.conf.json').identifier")
HOST_TRIPLE = $(shell rustc -vV | sed -n 's/^host: //p' | tr 'a-z-' 'A-Z_')

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

.PHONY: install
install: ## Install JavaScript dependencies
	$(PNPM) install

.PHONY: dev
dev: ## Run the app with hot reload, unsigned: the keychain asks for the tokens after every rebuild
	$(PNPM) tauri dev

.PHONY: dev-signed
dev-signed: ## Run with hot reload, signed as the release is, so the keychain does not ask (ARGS= go to tauri dev)
	@test -n '$(DEV_SIGN_ID)' || { echo 'no "Developer ID Application" identity in the keychain; pass DEV_SIGN_ID="..."'; exit 1; }
	SIGN_ID='$(DEV_SIGN_ID)' BUNDLE_ID='$(BUNDLE_ID)' \
		CARGO_TARGET_$(HOST_TRIPLE)_RUNNER='$(CURDIR)/scripts/sign-and-run.sh' \
		$(PNPM) tauri dev $(ARGS)

.PHONY: build
build: ## Type-check and bundle the front end
	$(PNPM) build

.PHONY: app
app: ## Build Flux.app for this machine, signed if an identity is available
	$(SIGN_ENV) $(PNPM) tauri build --bundles app
	@echo "built $(APP)"

.PHONY: bundle
bundle: ## Build every installer for this platform (.app and .dmg on macOS), signed
	$(SIGN_ENV) $(PNPM) tauri build

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
		git commit -m "chore(release): v$$v" && \
		git tag -a "v$$v" -m "v$$v" && \
		echo "tagged v$$v — push it with: make publish"

.PHONY: publish
publish: ## Push the branch and this version's tag, which triggers the release workflow
	git push origin HEAD
	# only this version's tag: `--tags` would push every tag still sitting in the clone,
	# and a tag that was deleted on purpose comes back as a new one — which builds and
	# republishes that old version, manifest and all
	@v=$$(node scripts/version.mjs) && git push origin "v$$v"

.PHONY: release-local
release-local: ## Build and publish this version from this machine, for when Actions cannot (KEYS=folder, FORCE=1 to force it)
	@scripts/release-local.sh

.PHONY: clean
.PHONY: site
site: ## Deploy flux.emreb.dev (site/) to Cloudflare, binding the domain
	cd site && npx wrangler@4.150.0 deploy

clean: ## Remove build output
	rm -rf dist
	cd $(CARGO_DIR) && cargo clean
