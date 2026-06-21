.PHONY: build build-backend build-frontend build-datamanagementd test test-backend test-frontend test-datamanagementd secret-scan \
	build-svelte build-server build-server-svelte

SVELTE_CRITICAL_VITEST := \
	src/lib/routing/reroute.test.ts \
	src/lib/features/backup/backup.test.ts \
	src/lib/features/supply/supply.test.ts

# 一键编译前后端
build: build-backend build-frontend

# 编译后端（复用 backend/Makefile）
build-backend:
	@$(MAKE) -C backend build

# 编译前端（需要已安装依赖）
build-frontend:
	@CI=true npx pnpm@9 --dir frontend-svelte run build

# 编译 datamanagementd（宿主机数据管理进程）
build-datamanagementd:
	@cd datamanagement && go build -o datamanagementd ./cmd/datamanagementd

# 运行测试（后端 + 前端）
test: test-backend test-frontend

test-backend:
	@$(MAKE) -C backend test

test-frontend:
	@CI=true npx pnpm@9 --dir frontend-svelte exec svelte-kit sync
	@CI=true npx pnpm@9 --dir frontend-svelte exec svelte-check --tsconfig ./tsconfig.json
	@CI=true npx pnpm@9 --dir frontend-svelte exec vitest run $(SVELTE_CRITICAL_VITEST)

test-datamanagementd:
	@cd datamanagement && go test ./...

secret-scan:
	@python3 tools/secret_scan.py

# ─────────────────────────────────────────────────────────────────────────────
# Svelte rewrite (Phase D) · Svelte is the only embedded frontend.
# frontend-svelte/ -> backend/internal/web/dist_svelte/
# Embed requires -tags=embed.
# Pin pnpm@9 — CI/CD lockfile is generated with pnpm 9 (see memory: pnpm-version-must-match-ci).
# ─────────────────────────────────────────────────────────────────────────────

build-svelte:
	@CI=true npx pnpm@9 --dir frontend-svelte run build

build-server-svelte:
	@$(MAKE) build-server

build-server:
	@mkdir -p bin
	@cd backend && go build -tags=embed -o ../bin/server-svelte ./cmd/server
