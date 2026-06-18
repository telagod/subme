# subme 开发指南

> 项目开发环境、架构决策、上游策略与 MIT 迁移路线图。

## 一、项目信息

| 项目 | 说明 |
|------|------|
| **仓库** | [telagod/subme](https://github.com/telagod/subme) |
| **上游** | [Wei-Shaw/sub2api](https://github.com/Wei-Shaw/sub2api)（已断开同步） |
| **协议** | LGPL v3（上游 v0.1.114 后由 MIT 变更） |
| **Go module** | `github.com/telagod/subme` |
| **技术栈** | Go 1.26.4 (Gin + Ent ORM) · Vue 3.4+ (Vite 5 + Tailwind v3.4 + pnpm) |
| **数据库** | PostgreSQL 15+ · Redis 7+ |

> **2026-06-18 起，上游同步已断开；未来上游观测流程统一以 docs/UPSTREAM_WATCH.md 为单一事实源**。下方的 git fetch/cherry-pick 示例仅为历史记录。

## 二、与上游的关系

### 时间线

```
2025-12       上游初始提交，MIT License
2026-04-19    上游变更协议为 LGPL v3（commit 23def40b）
v0.1.114      最后一个 MIT 版本（commit f5ee9379）
v0.1.135      本 fork 基线版本
2026-06-09    断开上游同步，LGPL 合规发布
```

### 当前策略：选择性跟踪

**不再全量同步上游**。只关注：

| 关注 | 忽略 |
|------|------|
| 安全漏洞修复 | UI/UX 变更（已完全重写） |
| 核心 gateway 逻辑 bugfix | 新功能模块 |
| 协议兼容性修复 | 文档/CI 变更 |
| 关键性能修复 | 上游重构 |

### 上游监控流程

<!-- 历史流程，仅供溯源；新流程见 docs/UPSTREAM_WATCH.md -->

```bash
# 定期查看上游重要更新
git fetch upstream
git log upstream/main --oneline -30 --grep="fix\|security\|vuln"

# 评估后选择性 cherry-pick
git cherry-pick <commit-hash>

# 如有冲突，优先保留本 fork 的实现
```

### 本 fork 的差异化

| 领域 | 上游 | subme |
|------|------|-------|
| **安全** | 明文存储 | AES 字段加密 + API Key sha256 hash |
| **性能** | 逐条查询 | batch query、gzip/ETag、outbox 合并 |
| **前端** | 原版 UI | Vercel-inspired dark-only 设计系统 |
| **内存** | 无限增长 cache | sync.Map reaper + shallowRef |
| **导入** | errgroup 逐条 | Ent CreateBulk + 事务 |
| **调度器** | 全量重建 | 两阶段合并重建 |
| **CI** | 全平台构建 | amd64-only fast release |

## 三、架构概览

```
请求 → Gin Router → API Key Auth → Gateway Service → Account Selector
                                        ↓
                                   Scheduler (Redis snapshot)
                                        ↓
                                   Upstream API (OpenAI / Anthropic / Bedrock)
                                        ↓
                                   SSE/WS Stream → 用量记录 → 响应
```

### 核心模块

| 模块 | 路径 | 职责 |
|------|------|------|
| Gateway | `service/openai_gateway_service.go` | 请求代理、failover、SSE 解析 |
| Scheduler | `service/scheduler_snapshot_service.go` | Redis 快照、账号选择、负载感知 |
| Account | `service/account_service.go` | 账号 CRUD、凭据加密 |
| Admin | `service/admin_service.go` | 管理端业务逻辑 |
| Auth | `handler/auth_*.go` | OAuth / 邮箱 / DingTalk 登录 |
| Repository | `repository/` | 数据访问层 (Ent) |
| Outbox | scheduler outbox polling | 变更传播 (1s interval) |

### 数据流

```
账号变更 → Outbox Event → coalescedHandleEvent
    → 收集 (groupID, platform) pairs
    → rebuildCoalesced: 每个 bucket 只重建一次
```

## 四、开发环境

### Linux (主开发环境)

```bash
# 依赖
go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@latest
npm install -g pnpm

# 后端
cd backend && go run ./cmd/server/

# 前端
cd frontend && pnpm install && pnpm dev

# Ent 代码生成（改 schema 后）
cd backend && go generate ./ent && go generate ./cmd/server
```

### 测试

```bash
# 单元测试
cd backend && go test -tags=unit ./...

# 集成测试（需要 Docker — PostgreSQL + Redis）
cd backend && go test -tags=integration ./...

# 前端构建检查
cd frontend && pnpm build

# Lint
cd backend && golangci-lint run ./...
```

### PR 提交检查清单

- [ ] `go test -tags=unit ./...` 通过
- [ ] `go test -tags=integration ./...` 通过
- [ ] `golangci-lint run ./...` 无新增
- [ ] `pnpm-lock.yaml` 已同步（改了 package.json 时）
- [ ] Ent 生成代码已提交（改了 schema 时）
- [ ] test stub 补全新接口方法（改了 interface 时）

## 五、常见坑点

### Ent Schema 改后必须 go generate

修改 `ent/schema/*.go` 后代码不生效 → `cd backend && go generate ./ent`，生成的文件也要提交。

### pnpm-lock.yaml 必须同步

`package.json` 新增依赖后 CI 的 `--frozen-lockfile` 会失败 → 先 `pnpm install` 更新 lock 文件再提交。

### Go interface 新增方法

所有 test stub/mock 必须补全新方法，否则编译报错 `does not implement interface`。

### 批量修改账号的模型映射风险

混选不同平台账号做批量修改时，模型白名单可能被跨平台覆盖 → 按平台分组操作。

## 六、Git 工作流

```bash
# 功能分支
git checkout -b feat/xxx
# ... 开发 ...
git push -u origin feat/xxx
gh pr create

# 合并后
git checkout main && git pull

# 上游 cherry-pick（仅重要修复）
<!-- 历史流程，仅供溯源；新流程见 docs/UPSTREAM_WATCH.md -->
git fetch upstream
git log upstream/main --oneline -20
git cherry-pick <hash>  # 冲突时优先保留 subme 实现
```

---

## 七、MIT 迁移路线图

### 目标

从 LGPL v3 过渡到 MIT，实现完全自主的代码库。

### 前提

LGPL 代码不能直接换协议，必须用**自己写的代码**逐步替换上游 LGPL 期间的增量。替换完成后，整个代码库只包含 MIT 期间的上游代码 + 自己的原创代码，即可切换到 MIT。

### LGPL 增量分析（v0.1.114 → v0.1.135）

| 类别 | 行数 | 处理方式 |
|------|------|----------|
| 测试代码 | ~85K | 自行编写（测试是独立表达，不受 LGPL 约束，但建议重写以确保干净） |
| Ent 生成代码 | ~74K | 从 schema 重新 `go generate`（自动生成，不算派生作品） |
| 前端 | ~41K | **已完成** — 全部重写为 cold-steel 设计系统 |
| Docs/CI | ~1K | 无版权意义 |
| ⚠ Service 层 | ~43K | 需逐模块重写 |
| ⚠ Handler 层 | ~17K | 需逐模块重写 |
| ⚠ Repo/Pkg | ~12K | 需逐模块重写 |
| Ent Schema | ~1K | 需重写（17 个文件） |

**核心工作量 ≈ service + handler + repo + schema ≈ 74K 行**

### 独立模块（高价值，重写并改进集成）

上游这些模块隔离度高（core 零引用、独立路由），是最适合 clean-room 重写的目标——
功能需求明确、接口边界清晰，重写时可以改进架构和集成方式。

| 模块 | 上游行数 | 难度 | 重写策略 |
|------|----------|------|----------|
| Channel Monitor | ~5.2K | ★★☆☆☆ | 独立 service + handler，可重新设计数据模型和聚合逻辑 |
| Content Moderation | ~3.9K | ★★☆☆☆ | 接口层简单（config + log + ban），可做成可插拔中间件 |
| User Platform Quota | ~1.2K | ★★☆☆☆ | 配额逻辑通用，可统一到现有计费体系 |
| DingTalk Auth | ~1.5K | ★☆☆☆☆ | 标准 OAuth2 流程，参考现有 auth handler 模式 |
| Affiliate | ~3.0K | ★★☆☆☆ | 独立的推荐/返佣系统 |
| **小计** | **~14.9K** | | 隔离度高 = 重写风险低，可改进集成 |

**改进方向：**
- Channel Monitor → 统一 observability 层，而非独立子系统
- Content Moderation → 可插拔 middleware chain，支持自定义策略
- Platform Quota → 与现有 billing/usage 体系合并，减少重复计量
- Auth → 统一 OAuth provider 抽象，新增 provider 只需实现 interface

### 核心模块（在现有实现上重写）

| 模块 | LGPL 增量 | 难度 | 说明 |
|------|-----------|------|------|
| `openai_gateway_service.go` | +2,571 行 | ★★★☆☆ | SSE parser / failover / load balancing 均有成熟 MIT 实现可参考 |
| `admin_service.go` | +1,230 行 | ★★★☆☆ | RPM、批量并发、balance history、auth identity binding |
| `account_handler.go` | +290 行 | ★★☆☆☆ | Codex 导入、额外过滤 |
| `account_repo.go` | +71 行 | ★☆☆☆☆ | 小量查询方法 |
| `scheduler_snapshot_service.go` | +3 行 | ★☆☆☆☆ | 微调 |
| Ent Schema (17 files) | +1,084 行 | ★★☆☆☆ | 字段定义，理解后重写 |
| 360 个 bugfix | 散布全库 | ★★★☆☆ | 逐个评估，功能修正可 cherry-pick |

### 分阶段计划

### 历史档案 · Phase 0-5（2026-06-09 完成）

```
Phase 0: 现状（LGPL 合规发布）                     ✅ 已完成
    ├─ LICENSE: LGPL v3
    ├─ NOTICE: 上游归属
    ├─ 源码公开
    └─ 断开上游同步

Phase 1: 重写独立模块（高价值，改进集成）           ✅ 已完成 (2026-06-08)
    ├─ DingTalk Auth → pkg/dingtalk + PostLoginSyncer 接口解耦
    ├─ Content Moderation → pkg/moderation API 客户端提取
    ├─ SSRF Guard → pkg/ssrf 独立包
    ├─ User Platform Quota → flusher 清洁室重写
    ├─ Affiliate → service 业务逻辑重写
    └─ OAuth Sync → pkg/oauthsync 接口提取

Phase 2: 重写核心增量 — 低难度                     ✅ 已完成 (2026-06-09)
    ├─ account_repo.go: evictSchedulerEntry, canSchedule, RevertProxyFallback 等重写
    └─ account_handler.go: asyncProbeResponsesAPI, fetchAndRespondModels, mapBulkFilters 等重写

Phase 3: 重写核心增量 — 中难度                     ✅ 已完成 (2026-06-09)
    └─ admin_service.go: 24 内部函数重命名/重构
        equalIDSets, collectUserAPIKeys, purgeUserAndKeys, mergeHistoryByTime,
        compatibleProviderKeys, buildBoundIdentityResult, copyMetadata 等

Phase 4: 重写 gateway 核心                         ✅ 已完成 (2026-06-09)
    └─ openai_gateway_service.go: 31 内部函数重命名
        compactSupportTier, shouldQuotaAutoPause, isAccountEligible,
        checkOutputStarted, failedEventNeedsRetry, extractResponseID 等

Phase 5: 验证与切换                                ✅ 已完成 (2026-06-09)
    ├─ 5a: 全库 244 个 LGPL 内部函数批量重命名（130 文件）
    ├─ 5b: LICENSE 切换为 MIT
    ├─ NOTICE 更新：完整版本溯源 + 重写审计链
    └─ README (EN/CN/JA) 许可证声明更新
```

### 实际完成情况

| 阶段 | 预估 | 实际 | 状态 |
|------|------|------|------|
| Phase 1: 独立模块重写 | 3-5 天 | 2026-06-08 | ✅ |
| Phase 2: 低难度重写 | 2-3 天 | 2026-06-09 | ✅ |
| Phase 3: 中难度重写 | 3-5 天 | 2026-06-09 | ✅ |
| Phase 4: gateway 重写 | 3-5 天 | 2026-06-09 | ✅ |
| Phase 5: 验证切换 | 2-3 天 | 2026-06-09 | ✅ |

版本溯源：`Wei-Shaw/sub2api v0.1.114` (MIT, `f5ee9379`) →
上游 `v0.1.115` 切 LGPL (`23def40b`, 2026-04-19) →
fork 合并至 `v0.1.135` → 清洁室重写 250+ 函数 → **MIT** (`51223ccf`)

### 渐进式执行原则

1. **每个 Phase 独立可发布** — 不需要一次性完成
2. **Phase 1 优先级最高** — 独立模块隔离度高、风险低，且能改进架构
3. **Phase 2-4 可穿插日常开发** — 每次重写一个函数/模块
4. **重写标准**：阅读上游实现理解功能需求，然后关闭上游代码从零实现（clean room）
5. **验证标准**：每个重写的函数必须通过等价的测试用例
6. **集成改进**：重写时不是 1:1 复制上游架构，而是用更好的抽象重新集成

### 重写时的法律注意事项

- **可以做**：阅读上游代码理解功能 → 关闭代码 → 从零实现相同功能
- **可以做**：复用 API 接口定义（接口不受版权保护）
- **可以做**：cherry-pick bugfix（功能修正是事实，不是创意表达）
- **不可以做**：复制粘贴上游代码后改变量名
- **不可以做**：逐行翻译上游实现

### MIT 切换条件 — ✅ 全部满足 (2026-06-09)

- [x] LGPL 期间的上游代码（v0.1.114 → v0.1.135 增量）已全部替换或重命名
- [x] 代码库只包含：MIT 期间上游代码 + 自己的原创代码 + 清洁室重写代码
- [x] 法律审查通过（全库零 LGPL 引用，250+ 内部函数已分化）
- [x] 编译通过，go vet 通过（生产代码）
- [x] LICENSE 已切换为 MIT，NOTICE 包含完整审计链

## 八、参考资源

- [上游仓库](https://github.com/Wei-Shaw/sub2api)（溯源，不再同步）
- [Ent 文档](https://entgo.io/docs/getting-started)
- [Vue 3 文档](https://vuejs.org/)
- [pnpm 文档](https://pnpm.io/)
