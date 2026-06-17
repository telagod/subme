# 上游重新实现路线图 · Wei-Shaw/sub2api → telagod/subme

> 生成 2026-06-17 ｜ 上游领先 108 提交（分叉点 `0aad6030` ≈ v0.1.135，对应上游 release v0.1.137）
> **方法论铁律**：把上游改动当需求源，在重写版按本地架构**重新实现**，绝不 `git merge`（旧 module 路径 + 旧架构会污染重写版）。
> 盘点方式：9 功能簇并行 survey + 对抗验证（8+ skip 判断全部 confirmed，零翻案）。所有「本地落点」基于 `main` ref。
> 落地前每项务必：① `git show <commit>` 复核上游实现 ② `git grep <pat> main` 复核本地现状未漂移 ③ 价格类逐项核对厂商当前官方页。

---

## 全局结论

- **~30 项值得移植**（reimplement / adapt），**~14 项 confirmed-skip**（本地已自实现或本地无此 bug）。
- 最大风险区：`billing-pricing`——本地计费链 `Channel→LiteLLM→Go fallback`，OpenRouter 目录**只是展示绝不触达 `GetModelPricing`**（red line）。GLM/Kimi/MiniMax 流量当前零成本记录，是**收入红线**。
- 关键依赖：`thinking_protocol.go` 子系统（gateway 簇）是 MiniMax-normalize、reasoning_effort-fill 两项的前置——要做这条线就**先做它**。
- 多项标 `conflicts-with-rewrite`：本地后端大幅分叉（cyber_policy、fable-5 bedrock thinking、Gemini transformer 签名），**须按本地命名 re-thread，严禁逐字 cherry-pick**。前端已迁 shadcn-vue + Zinc，所有 UI 项须适配本地体系，i18n 须对齐 rebrand 文案。

---

## P0 — 安全，立即做

| # | 项 `[簇]` | effort | 本地落点 / 要点 | commit |
|---|-----------|--------|----------------|--------|
| 1 | **form-data 升 ≥4.0.6** `[admin-frontend]` | trivial | `frontend/pnpm-lock.yaml:2620,7378` 仍 pin `form-data@4.0.5`（GHSA-hmw2-7cc7-3qxx CRLF 注入，axios ^1.16 传递依赖）。**只**在 `frontend/package.json` 的 `pnpm.overrides` 加 `"form-data": ">=4.0.6"` 再 `pnpm install`，勿整包复制上游 package.json | — |

---

## P1 — 数据 / 收入 / 可用性 bug（核心批次）

> 建议先做无依赖的 trivial/small bug（性价比最高），再啃 `thinking_protocol.go` 子系统与收入红线。

| # | 项 `[簇]` | effort | 本地落点 / 要点 | commits |
|---|-----------|--------|----------------|---------|
| 2 | **DeepSeek `reasoning_effort 'max'→'xhigh'`** `[gateway]` | trivial | `openai_gateway_service.go:7181` `case "xhigh","extrahigh":` 缺 `"max"` → deepseek-v4-pro 的 reasoning_effort 被静默 null。**全簇最高性价比，无依赖** | 142d8c36 |
| 3 | **token refresh 非重试关键字** `[auth-token]` | trivial | `token_refresh_service.go:442-450` `isNonRetryableRefreshError` 缺 `invalid_refresh_token`/`app_session_terminated` → 死 Team token 永久重试、永不标 needs-reauth | fa8f1749, 727ac3f6 |
| 4 | **Bedrock 剥顶层 `provider`/`metadata`** `[bedrock]` | trivial | `bedrock_request.go:196-258` 从不删 → Claude Code / OpenRouter 风格 passthrough 带顶层字段被 Bedrock 400。两行 `sjson.DeleteBytes`，与 #5 同 commit 捆绑 | bf28a009 |
| 5 | **Bedrock 空 beta token 泄漏防护** `[bedrock]` | trivial | `bedrock_request.go:212-217` 只有 `len>0` 分支无 else → resolver 返空时客户端注入的 `anthropic_beta` 直达 Bedrock。单行 else，与 #4 同 commit | bf28a009 |
| 6 | **SSE `event:error` body 保留** `[gateway]` | small | `gateway_service.go:5137-5141` 仍 `if err.Error()=="have error in stream"` 造无证据 403，`ops_error_logs.upstream_error_message` 空白、关键字 passthrough 规则失效。需引入 typed error + `errors.As` | 6c7203d8 |
| 7 | **非 JSON 2xx failover** `[gateway]` | small | `gateway_service.go:8254` 2xx body Unmarshal 失败直接 `parse response` 硬错 → CDN/proxy HTML interstitial 当硬错返客户而非 failover。镜像现有 failover plumbing | (合并项) |
| 8 | **OpenAI 图像 5xx failover** `[openai]` | small | `openai_images.go:227-230` 对每个 `*OpenAIImagesUpstreamError` 无条件当 success → 单账户瞬时 5xx 使全员图像中断。移植 `IsOpenAIImagesRetryableUpstreamError` 分类器 | (合并项) |
| 9 | **Responses session hash 锚定 input** `[openai/gateway]` | small | `gateway_service.go:725/770-787` 空 messages 哈希到空 → 无 sticky、跨账户弹跳、prompt-cache 失效。`ParsedRequest` 加 inputRange + hash input-anchor 回退 | a67b10f4, 44f57910 |
| 10 | **prompt_cache_key + apiKey-隔离 session_id** `[openai]` adapt | small | `openai_gateway_chat_completions.go:222-223` 仍裸 `generateSessionUUID(promptCacheKey)`，缺 body 注入 → 两 API key 共享 cache key 在上游 session_id 碰撞（跨租户串台）。套本地已有 `isolateOpenAISessionID` | (合并项) |
| 11 | **`/responses` probe 验 tool-calling** `[openai]` | medium | `openai_apikey_responses_probe.go:111` 纯靠 HTTP status → 火山方舟 kimi-k2.6 等返 2xx 却丢 tool calls 被误标 supported，工具请求确定性失败。加 tools+tool_choice=required，8s→15s | b88f8e4c |
| 12 | **Bedrock CC compat toggle 静默死** `[bedrock]` | small | **比上游更严重**：前端 `formToAPI` 写 `Record<string,boolean>` map、后端 `channel.go:258` 只读 `.(bool)` → `IsBedrockCCCompatEnabled` 恒 false。**须双向改前端**（`ChannelsView.vue` formToAPI 写 plain bool + apiToForm 读 `===true`），不能只补上游读路径 | (bedrock) |
| 13 | **Gemini system-role 合并** `[model-compat]` | small | `antigravity/request_transformer.go:359` `buildContents` 无 `role==system` 分支 → 含 system 的 message 当非法 content role 发 Gemini 触发 400。**本地签名 `([]GeminiContent,bool,error)` 不同，须适配返回 shape** | (model-compat) |
| 14 | **claude-fable-5 注册** `[model-compat]` feature | small | 跨 `constants.go`/antigravity/claude/`bedrock_request.go` 注册新模型。**本地缺 `isBedrockOpus47OrNewer` 脚手架，bedrock thinking 分支须适配本地 `sanitizeBedrockThinking`**。含前端 whitelist/UseKeyModal | (model-compat) |
| 15 | **thinking_protocol.go 子系统** `[gateway]` | medium | **基础子系统，#16/reasoning-fill 依赖它，先做**。本地 `thinking_protocol.go` 不存在，`gateway_request.go:531` `FilterThinkingBlocksForRetry` 等用旧签名无 mappedModel → thinking 客户端路由到 DeepSeek/Kimi/GLM Anthropic-兼容上游丢 thinking 块 + 400 | 6baf00d7 |
| 16 | **GLM/Kimi/MiniMax + DeepSeek-V4 兜底定价** `[billing]` adapt | medium | **收入红线**：`billing_service.go:187-368` fallback 表零中国模型分支，这些流量解析为 `ErrModelPricingUnavailable` 零成本记录。落进 `initFallbackPricing/getFallbackPricing`。**DROP 上游 deepseek-chat/reasoner→v4-flash alias 重映射**（本地这俩先命中 LiteLLM）。逐价核对厂商官方页 | a4ce7339, c90089c8, c906bf00, 5a593a51, 4f5f2788 |
| 17 | **token refresh retry amplification** `[auth-token]` | medium | `account_repo.go:1278` `SetTempUnschedulable` 丢 `RowsAffected` → 0 行匹配仍无条件 enqueue outbox + snapshot；刷新器扫全部 ListActive 无 cooldown 排除。**先做 RowsAffected guard，再加 `ListOAuthRefreshCandidates`（带 `acaffe29` 的 `IS NOT TRUE` 写法）**。⚠ 适配本地 outbox 命名 | (含 acaffe29) |
| 18 | **Anthropic 5h/7d window cooldown 优先** `[auth-token]` | medium | `ratelimit_service.go:184-189` 对所有非 401（含 429）先跑 temp-unsched 命中即返回，官方 window 解析在更后 → 客户 429 规则把 5h/7d 压成 10 分钟短停、反复 429。补 `selectAnthropicExhaustedWindow`+`parseAnthropicWindowReset`+前置 guard | (auth-token) |
| 19 | **outbox coalesce window 1s→10s** `[scheduler]` | trivial | `scheduler_outbox_repo.go:16` `schedulerOutboxDedupWindow = time.Second` 正是上游修复前值 → under-coalesce 冗余 snapshot rebuild。**架构无关，一行常量** | 34e66ec0 |
| 20 | **cleanup consumed outbox rows** `[scheduler]` adapt | medium | 本地 `SchedulerOutboxRepository` 只有 ListAfter+MaxID 无 Delete → **outbox 表无限增长**（生产 disk creep + ListAfter 慢查询）。加 `DeleteConsumedUpTo`+10s grace+advisory-lock。架构无关（操作 watermark 非 dedup_key） | (scheduler) |

---

## P2 — 功能 / 性能 / 运维

| 项 `[簇]` | effort | 本地落点 / 要点 | commit |
|-----------|--------|----------------|--------|
| **account list 参数批处理** `[account-repo]` | small | `account_repo.go:1800/1821` 裸 `IDIn(proxyIDs...)/AccountIDIn(accountIDs...)` 无批处理 → 账号多撞 PG 65535 参数上限。加 `postgresParameterBatchSize=50000` 分批 | 8b698ff4 |
| **zstd 上游响应解压** `[gateway]` | small | `repository/http_upstream.go` `decompressResponseBody` 只处理 gzip/br/deflate。`klauspost/compress v1.18.2` 已是本地依赖（`go.mod:26`），零新依赖 | (gateway) |
| **MarkResponseCommitted 全平台覆盖** `[gateway]` | small | 本地只 2 处（base Anthropic），OpenAI/Gemini/Antigravity compat 错误写入仍可双写/SSE corruption。~1 行 `MarkResponseCommitted(c)` 插入，须映射本地各 call site | (gateway) |
| **max_tokens=1 haiku probe streaming 拦截** `[gateway]` | trivial | `gateway_handler.go:1822` `isMaxTokensOneHaikuRequest` 含 `!isStream` → streaming 探测漏到上游浪费 quota | (gateway) |
| **MiniMax thinking enabled→adaptive** `[gateway]` | small | 依赖 #15 thinking_protocol；minimax-m* enabled→400。窄爆炸半径 | (gateway) |
| **tool.strict default false** `[gateway/model-compat]` | trivial | `apicompat/chatcompletions_to_responses.go:423/435` 透传 nil 被 omitempty 丢 → 偏离 false 默认。加 `defaultStrictFalse` helper（实现前 grep 防与其他簇重复） | (跨簇去重) |
| **doubao-embedding-vision 图文差别计费** `[billing]` | medium | `ModelPricing/UsageTokens` 无 `ImageInput*` 字段 → 多模态 embedding 图像 token 按文本费率欠费。镜像现有 `ImageOutputTokens` 路径，核 CNY→USD (/7.14) | 262fe123 |
| **cyber_policy 硬阻断全链路** `[openai]` | large | **~3000 LOC/56 文件大功能**，深嵌每条 forward 路径。本地 `RequestType` 枚举无 cyber，须按本地命名 re-thread。**仅产品要 ChatGPT cyber-policy 语义才做**，分阶段：detection+passthrough+ops-log 先 | 16765bde |
| **OpenAI quota 查询+重置** `[openai]` feature | medium | 自包含 admin 功能（1 service+2 handler+2 route+1 DI）。依赖本地已有。本地 `NewOpenAIOAuthHandler` 旧 2-arg 签名须加 quotaService + 改 wire_gen。前端适配 shadcn | b8169492 |
| **promo code 应用到 OAuth 注册** `[auth-token]` feature | medium | 纯加法营收功能，触 5 个 provider handler + pending-session state，机械低风险 | (auth-token) |
| **ACL denial 含 client IP** `[auth-token]` | trivial | `api_key_auth.go:96-103` 已算 clientIP，拼进 denial message（3 行，无安全副作用） | (auth-token) |
| **/admin/users 按 API Key 分组过滤** `[admin-frontend]` feature | medium | `UserListFilters` 缺 `APIKeyGroupID`，`HasAPIKeysWith` ent predicate 已存在仅需 wiring。注意负哨兵 :key fix + i18n 对齐 rebrand | (admin) |
| **渠道监控随机抖动** `[admin-frontend]` adapt | medium | `channel_monitor_runner.go:212` 固定 ticker。监控子系统已全在。**ent 代码本地重生成勿复制；migration 用 153+（勿用 151，本地已两个 151，最高 152）** | (admin) |
| **account_groups 复合调度索引** `[scheduler]` perf | trivial | 本地仅单列索引（`001_init.sql:114-115`）。新 migration（renumber + CONCURRENTLY IF NOT EXISTS） | (scheduler) |
| **account autopause-expiry 部分索引** `[scheduler/account-repo]` perf | trivial | 列已存在无索引。新 migration `idx_accounts_autopause_expiry_due ON accounts(expires_at) WHERE ...`。**migration 编号 153+** | e4c255a7 |

---

## P3 — 低优先 / 按需 / defer

| 项 `[簇]` | 说明 |
|-----------|------|
| **thinking reasoning_effort auto-fill** `[billing/gateway]` | 纯 analytics（填 NULL 列非计费正确性），硬依赖 #15 thinking_protocol。**defer 到子系统到位** |
| **wait queue 热路径收敛** `[account-repo]` | 本地散落 5 handler，但已有 hotpath/fastpath test 疑部分做过。**先核对本地现状再决定** |
| **前端 account id 列** `[account-repo]` | `AccountsPoolView.vue` 加 id 列，适配本地 shadcn + Zinc 文案 |
| **Claude OAuth system prompt blocks 可配置** `[model-compat]` | 纯加法 admin 配置，本地硬编码 3-block 功能等价。仅产品需要时做，适配本地 settings registry |
| **Bedrock beta token whitelist 扩展** `[bedrock]` | 本地 deliberate policy（注掉 context-management）。reconcile 本地 const 处理，核 AWS 当前文档 |

---

## ⚠ 冲突区（须按本地架构适配，严禁逐字 cherry-pick）

1. **billing 收入红线**：OpenRouter 目录绝非价源（`channel_handler.go:21`），只喂 admin autofill UI。中国模型须落 fallback 表，`GetModelPricing` 不动（见 [[openrouter-pricing-done]]）。
2. **deepseek alias 重映射丢弃**：上游把 legacy deepseek-chat/reasoner→v4-flash，本地这俩先命中 LiteLLM 动态源，fallback 永不触发，强加会冲突。
3. **scheduler outbox 本地自实现**：本地用 time-window dedup（非上游 dedup_key/sha256/ON CONFLICT）。**dedup_key 架构整体 skip**，只摘 10s window + cleanup 两个架构无关的等价收益。
4. **Bedrock CC compat 前端 map vs 后端 bool**：比上游更严重，须双向修。
5. **大功能 re-thread**：cyber_policy、fable-5 bedrock thinking 深嵌本地分叉的 service/枚举，按本地命名重新穿线。
6. **前端全部适配 shadcn-vue + Zinc**：见 [[reshadcn-migration]]，i18n 对齐 subme rebrand 文案，勿复制上游 `?raw` 导入。

---

## ✓ 确认跳过（对抗验证 confirmed-skip，本地已实现或无此 bug）

- `[billing]` remove unused billing attribution helper — 本地 `gateway_billing_block.go:69` **live**，删会破 `gateway_service.go:4195` 编译
- `[openai]` model body hoist out of retry loop — 本地 `openai_gateway_handler.go:262/680` 已等价实现
- `[openai/gateway]` double-write gate **core** — 本地 `MarkResponseCommitted` 机制已在（覆盖缺口另列 P2）
- `[openai]` reuse failover error body — 本地调用点先 re-buffer，无 empty-body bug
- `[bedrock]` ApplyBedrockCCCompat header 合并 — 本地已收敛到重构后形态（`gateway_service.go:5871`）
- `[auth-token]` inline retry reason const — 本地已是 revert 后内联终态
- `[gateway]` idempotency utf8 截断 — 本地 `idempotency.go:463` `truncateUTF8Safe` 等价
- `[scheduler]` dedup_key 架构迁移 — 本地 time-window 自实现，整体冲突 skip
- `[scheduler]` typed-nil dedup_key — 本地不 hash payload，无害
- `[scheduler]` 调度日志 slog guard — 本地 `gateway_service.go:2364/2409/2444` 已 guard
- `[admin-frontend]` compliance gate + docs/legal Docker — 上游产品/合规决策，subme 独立产品线不采纳

---

## 建议落地顺序

- **第一批（半天，无依赖 trivial/small bug）**：#1 form-data → #2 reasoning_effort max → #3 token 非重试 → #4/#5 Bedrock 字段 → #6 SSE error body → #12 Bedrock toggle → #13 Gemini system-role → #19 outbox 10s window。每项独立、低风险、立竿见影。
- **第二批（基础子系统）**：#15 thinking_protocol.go → 解锁 MiniMax-normalize、reasoning-fill。
- **第三批（收入/数据）**：#16 中国模型定价 → #17 retry amplification → #18 Anthropic window → #20 outbox cleanup → P2 参数批处理。
- **第四批（按需大功能）**：cyber_policy、OpenAI quota、/admin/users 过滤、渠道抖动——按产品优先级取舍。

> 每项落地走 `复现→根因→最小重新实现→go build+test→验证`。后端改动 push 前按 [[run-integration-tests-with-docker]] 本地真跑 `go test -tags=integration`。
