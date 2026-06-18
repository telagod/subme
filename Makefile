.PHONY: build build-backend build-frontend build-datamanagementd test test-backend test-frontend test-frontend-critical test-datamanagementd secret-scan \
	build-vue build-svelte build-server-vue build-server-svelte

FRONTEND_CRITICAL_VITEST := \
	src/views/auth/__tests__/LinuxDoCallbackView.spec.ts \
	src/views/auth/__tests__/WechatCallbackView.spec.ts \
	src/views/user/__tests__/PaymentView.spec.ts \
	src/views/user/__tests__/PaymentResultView.spec.ts \
	src/components/user/profile/__tests__/ProfileInfoCard.spec.ts \
	src/views/admin/__tests__/SettingsView.spec.ts

# 一键编译前后端
build: build-backend build-frontend

# 编译后端（复用 backend/Makefile）
build-backend:
	@$(MAKE) -C backend build

# 编译前端（需要已安装依赖）
build-frontend:
	@pnpm --dir frontend run build

# 编译 datamanagementd（宿主机数据管理进程）
build-datamanagementd:
	@cd datamanagement && go build -o datamanagementd ./cmd/datamanagementd

# 运行测试（后端 + 前端）
test: test-backend test-frontend

test-backend:
	@$(MAKE) -C backend test

test-frontend:
	@pnpm --dir frontend run lint:check
	@pnpm --dir frontend run typecheck
	@$(MAKE) test-frontend-critical

test-frontend-critical:
	@pnpm --dir frontend exec vitest run $(FRONTEND_CRITICAL_VITEST)

test-datamanagementd:
	@cd datamanagement && go test ./...

secret-scan:
	@python3 tools/secret_scan.py

# ─────────────────────────────────────────────────────────────────────────────
# Dual-SPA rewrite (Phase A-D) · Vue is default, Svelte gated by build tag.
# Vue tree:    frontend/        -> backend/internal/web/dist/        (default)
# Svelte tree: frontend-svelte/ -> backend/internal/web/dist_svelte/ (tag: frontend_svelte)
# Both embeds require -tags=embed; the rewrite tree adds frontend_svelte.
# Pin pnpm@9 — CI/CD lockfile is generated with pnpm 9 (see memory: pnpm-version-must-match-ci).
# ─────────────────────────────────────────────────────────────────────────────

build-vue:
	@CI=true npx pnpm@9 --dir frontend run build

build-svelte:
	@CI=true npx pnpm@9 --dir frontend-svelte run build

build-server-vue:
	@mkdir -p bin
	@cd backend && go build -tags=embed -o ../bin/server-vue ./cmd/server

build-server-svelte:
	@mkdir -p bin
	@cd backend && go build -tags=embed,frontend_svelte -o ../bin/server-svelte ./cmd/server
