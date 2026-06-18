# Upstream Watch · 上游观测书签

> **单一事实源**：subme fork 与 Wei-Shaw/sub2api 上游的关系、未来观测流程、移植配方。
> 本文档替代 DEV_GUIDE.md 中 `git fetch upstream` 操作示例（已标记为历史）与
> UPSTREAM_REIMPLEMENT_ROADMAP.md 中 "108 commits ahead" 的 TODO 语义。
> 严禁 `git merge upstream/main` —— 见 MEMORY [fork-reimplement-model]。

---

## 1. 断开事件 · Detach Event

- **日期**：2026-06-18
- **断开原因**：subme 已完成 v0.2.0-subme.7 .. v.20 系列的独立重写，
  108 commits 历史快照全部已在重写产品线内行为对齐覆盖；
  保留上游同步 ref 已无产品收益，只剩污染风险（旧 module 路径 `github.com/Wei-Shaw/sub2api`
  仍存在于上游 1011 处 import，merge 必然系统性冲突）。
- **执行动作**：本地 `upstream` remote 保留作为 read-only 观测 ref；
  `main` 分支不再接受任何来自 `upstream/main` 的 merge / cherry-pick。
- **MIT 合规**：本 fork 已 clean-room 重写并切换 MIT（上游为 LGPL）。
  所有过往移植项见 `docs/upstream/LEDGER.md`（append-only 合规台账）。

---

## 2. 锚点 · SHA Anchors

| 角色 | SHA | 说明 |
|---|---|---|
| **merge-base**（共同祖先） | `0aad6030130c02cadb8b70e6cc90c9ed04bb1a7a` | 历史分叉点。**永不变动**，仅作溯源。 |
| **检查点 · upstream HEAD @ 2026-06-18** | `4a5665da5b2c6b83c4597844ea6e573746c821b1` | 断开时刻上游 HEAD。**这是未来观测的书签**。 |
| **本 fork HEAD @ 2026-06-18** | `f305307ef601a16f74b6491461aa2853a1b7e83b` | subme `chore: bump version to 0.2.0-subme.20`。 |
| 检查点上游版本号 | `0.1.137` | upstream `chore: sync VERSION to 0.1.137 [skip ci]` |

`docs/upstream/WATERMARK` 同步更新为 `4a5665da...`，
`tools/upstream-triage.sh` 默认从该 SHA 起向后扫描。

---

## 3. 历史快照 · 108-commit 回顾（仅供溯源，不是 TODO）

区间 `0aad6030..4a5665da`（2026-06-08 .. 2026-06-16），74 个可见提交。
**全部已在 v0.2.0-subme.7 .. v.20 干净重写覆盖**，明细见
`docs/RELEASE_NOTES_SUBME_V7_V20.md`。下表仅为类别速查：

| 类别 | 代表提交 | 覆盖位置 |
|---|---|---|
| 网关 SSE error 透传 | `6c7203d8` | v.7..v.20 gateway 重写已覆盖 |
| 网关 thinking-block 过滤 / MiniMax 适配 | `56c6325d`, `6baf00d7` | thinking_protocol 重写 |
| 国产 LLM 兜底定价（GLM/Kimi/MiniMax/Doubao） | `a4ce7339`, `262fe123`, `a05d9e87`, `4f5f2788` | 本地走 OpenRouter 价源 + 编辑覆盖（见 MEMORY/openrouter-pricing-done） |
| Scheduler outbox dedup / 快照 coalesce | `f069c9ae`, `b3ec6288`, `60cf89ae`, `3ef70b04`, `34e66ec0`, `cb14935e` | scheduler 重写已覆盖 |
| 网关双写预防 / MarkResponseCommitted 全覆盖 | `20f3f204`, `6c886316`, `914c059f` | 已在 LEDGER 标 ported (2741e451) |
| Token refresh retry 放大 | `74199b6a` | auth 路径重写已覆盖 |
| Cyber policy 硬阻断 | `b62b573f` | OpenAI policy 通路重写已覆盖 |
| OAuth 优惠码 / 系统 prompt 块 / app_session_terminated | `f8c80bf0`, `8ce7b9a8`, `727ac3f6` | auth 模块重写已覆盖 |
| zstd 解压 / non-JSON 2xx failover | `c1c28ac7`, `ab9987b2` | 网关重写已覆盖 |
| Bedrock 字段过滤 / beta token 清理 | `bf28a009`, `12962bab` | LEDGER 标 deferred；行为对齐确认中 |
| 渠道监控抖动 / 账号 id 显示 / admin 用户分组过滤 | `c70c6a26`, `25a9762a`, `329414ea` | UI/UX 类，本 fork 走 QUENCH→shadcn 自有方向 |
| Anthropic window cooldown 保留 | `f6e0ebc6` | 已对齐 |
| OpenAI prompt cache key 透传 | `d251487d` | LEDGER 标 ported (c47e8743) |
| Claude Fable 5 / OpenAI quota query+reset | `d662c973`, `b816949` | 模型路由 / 配额查询独立实现 |

完整 64 条上游 commit 表见本文件附录 / 或运行：

```bash
git log 0aad6030..4a5665da --oneline upstream/main
```

> **再次强调**：本节是回顾，不是清单。未来观测请用第 4 节流程，从 `4a5665da` 起向后扫，
> 不要回头处理这 108 条快照。

---

## 4. 未来观测流程 · Forward Watch Workflow

### 4.1 检测新活动

```bash
# 1. 拉最新上游
git fetch upstream

# 2. 列出检查点之后的新提交（按时间倒序）
CHECKPOINT=4a5665da5b2c6b83c4597844ea6e573746c821b1
git log ${CHECKPOINT}..upstream/main --oneline

# 3. 按主题分组速查（可选）
git log ${CHECKPOINT}..upstream/main --oneline --grep='fix\|security\|CVE'
git log ${CHECKPOINT}..upstream/main --oneline -- backend/internal/gateway
git log ${CHECKPOINT}..upstream/main --oneline -- backend/internal/billing
```

### 4.2 分类决策

对每条新提交，按 MEMORY [fork-reimplement-model] 与 LEDGER 既有判定准则：

| 类别 | 默认动作 |
|---|---|
| 安全 / CVE / 协议正确性 | **重新实现**（独立重写，行为对齐） |
| 性能 / 调度 / scheduler 修复 | 评估是否与本 fork scheduler 重写冲突；不冲突则重写 |
| 国产 LLM 兜底定价 | **跳过**——本 fork 走 OpenRouter 价源，`GetModelPricing` 是红线 |
| UI / 文案 / 渠道监控 UI | **跳过**——本 fork 走 QUENCH→shadcn 自有方向 |
| 上游自身 CI / gofmt / 文档 | **跳过**——与本仓库无关 |
| Bedrock / 特定平台兼容性 | 视使用情况，按需重写 |

判定结果写入 `docs/upstream/LEDGER.md`，状态枚举：`ported / deferred / skipped / bulk-covered`。

### 4.3 移植后更新书签

完成一轮观测后，把 `CHECKPOINT` 更新为最新已审过的 upstream SHA：

1. 本文件第 2 节表格的"检查点"行；
2. `docs/upstream/WATERMARK`；
3. CHANGELOG `[Unreleased]` 加一行 `Changed:` 注记。

> 书签不必每条 commit 都推；建议每月或每个 v.N 发布前推一次。

---

## 5. 移植配方 · 3-Step Port Recipe

> 重新实现一条上游提交的标准步骤。**严禁 cherry-pick、严禁 merge**。

### Step 1 · 读懂上游差异（read）

```bash
UPSTREAM_SHA=<sha>
git show --stat ${UPSTREAM_SHA}                    # 改了哪些文件
git show ${UPSTREAM_SHA} -- backend/internal/...   # 看 hunk
git log -1 --format=fuller ${UPSTREAM_SHA}         # 看 author/date/message
```

读 **行为**，不抄代码。识别：什么 bug、什么场景触发、修复后的不变式是什么。

### Step 2 · 在 subme idiom 内重写（reimplement）

- 文件路径：用 subme 重写后的路径（`github.com/telagod/subme/...`），不是上游路径。
- 依赖：用 subme 已有的工具/封装/types，不要为了像上游而 import 旧符号。
- 测试：先写一条复现 bug 的测试，再修；测试用 subme 现有 testcontainer 链路。
- 命名 / 注释 / 错误码：按本 fork 风格，不照搬上游变量名。
- 验证：`cd backend && go build ./... && go test -tags=integration -run TestXxx ./...`

### Step 3 · 提交带 trailer（commit with reference）

```bash
git commit -m "fix(<scope>): <subme 视角的描述>

<为什么需要、什么场景、修复后的不变式>

Upstream-Ref: ${UPSTREAM_SHA}
"
```

`Upstream-Ref:` trailer 是 LEDGER 与本文件追溯的钩子，**必填**。
然后 append 一行到 `docs/upstream/LEDGER.md`：

```
| `<short-sha>` | YYYY-MM-DD | ported | <local-sha> | <一句话本地落点> |
```

---

## 6. 红线 · Hard Lines

- **不 merge、不 cherry-pick、不 patch -p1 上游差异。** 任何把上游代码原样拖进本 fork 的尝试都会污染重写产品线。
- **`GetModelPricing` 不动。** 本 fork 走 OpenRouter 价源（MEMORY/openrouter-pricing-done），上游的国产 LLM 兜底定价多半会冲突。
- **UI 方向走 shadcn-vue + Zinc**（MEMORY/ui-design-preference + frontend/RESHADCN.md），上游 UI 改动默认跳过。
- **module 路径**：本 fork `github.com/telagod/subme`；任何上游 commit 引入的 `github.com/Wei-Shaw/sub2api` 路径在重写时必须改写。

---

## 7. 关联文档

- `docs/upstream/LEDGER.md` — append-only 移植/跳过判定台账（MIT 合规凭据）
- `docs/upstream/WATERMARK` — 当前检查点 SHA（与本文件第 2 节同步）
- `docs/RELEASE_NOTES_SUBME_V7_V20.md` — v.7..v.20 重写明细，覆盖 108-commit 快照
- `UPSTREAM_REIMPLEMENT_ROADMAP.md` — 断开时刻路线图（历史档案，不是 TODO）
- `DEV_GUIDE.md` — 开发指南，其中 git fetch/cherry-pick 示例已标记为历史
- MEMORY `fork-reimplement-model` — 重写型 fork 铁律
- MEMORY `upstream-watch-checkpoint` — 索引本文件
- 工具：`tools/upstream-triage.sh`（scan / show / mark / seal / status）

---

*本文件由 `docs/*` 路径覆盖，在 .gitignore 中。首次入库需 `git add -f docs/UPSTREAM_WATCH.md`。*
