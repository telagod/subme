# 模型定价数据源切换 OpenRouter —— 设计方案

> **状态：已实现**（v0.2.0-subme.X 系列内落地，详见 MEMORY/openrouter-pricing-done + git log --grep=pricing|openrouter）。本文档保留作为设计决策溯源。GetModelPricing 为红线，不动。

> 目标：把官方价数据源从 LiteLLM 切到 **OpenRouter**，单一源拿齐「价格 + 描述 + 能力」；
> 妥善处理「一模型多供应商价差」的取舍；定价直接展示，可编辑、可核对、信息密集。

---

## 一、为什么 OpenRouter（已实拉验证）

| 维度 | OpenRouter | models.dev | LiteLLM(现用) |
|------|:---:|:---:|:---:|
| 价格 | ✅ 每 token | ✅ 每百万 | ✅ 每 token |
| **prose 描述** | ✅ 唯一有 | ❌ | ❌ |
| 多供应商拆价 | ✅ `/endpoints` | ❌ | ❌ |
| 缓存读写价 | ✅ | ✅ | ✅ |
| 能力标签 | ✅ | ✅ | ⚠ |
| 单位与本系统 | ✅ 同为每 token，免转换 | 需 /1e6 | ✅ |

**结论**：要「价格+描述」单一源，OpenRouter 是唯一解，且单位免转换、多供应商可核对。

### 两个端点
1. `GET /api/v1/models` —— 全量目录：`id / name / description / pricing(代表价) / context_length / architecture / supported_parameters`（300+ 模型，一次拉齐）。
2. `GET /api/v1/models/{author}/{slug}/endpoints` —— 单模型按供应商拆价：`data.endpoints[]` 每项 `provider_name / tag / pricing(prompt/completion/cache,每token) / context_length / quantization / uptime_last_1d / supported_parameters`。

---

## 二、核心取舍：一模型多供应商价差

实拉验证的关键事实：
- **首方前沿模型**（claude / gpt / gemini）：Anthropic 直连、Amazon Bedrock、Google Vertex **价格通常完全相同**，差的只是 uptime / 量化 / 支持参数 → 取哪个供应商对「价」无影响。
- **开源模型**（Llama / Qwen / DeepSeek）：DeepInfra / Together / Fireworks 等各家**价差显著** → 取舍才真正影响基准。

### 取舍策略（默认 + 可覆盖）

```
官方价基准 official_price(model) =
  ① 管理员手动覆盖值        （存在则用，最高优先级）
  ② 否则：管理员指定的供应商  （pin 了某 provider tag 则用它）
  ③ 否则：默认策略 = 各供应商中「最低价」
     理由：转售成本锚应取最便宜的正规源，折价透视据此最保守、最不会高估毛利
```

三层兜底：**手动值 > 指定供应商 > 自动最低价**。每一层都把「这价从哪来」如实记录，满足「可核对」。

---

## 三、数据模型

### 后端目录缓存（复用现有 pricing_service 的下载→缓存→本地兜底骨架）

新增模型目录结构（缓存到 `backend/data/model_catalog.json`，本地资源兜底）：

```go
type CatalogModel struct {
    ID           string            // openrouter slug, e.g. "anthropic/claude-sonnet-4.5"
    Name         string
    Description  string            // prose，OpenRouter 独有
    ContextLen   int
    Modalities   []string
    Capabilities []string          // reasoning/tools/structured_outputs...
    Providers    []ProviderPrice   // 来自 /endpoints
    Updated      time.Time
}
type ProviderPrice struct {
    Provider   string   // "Anthropic" / "Amazon Bedrock"
    Tag        string   // "anthropic" / "amazon-bedrock"
    Input      float64  // per-token
    Output     float64
    CacheRead  float64
    CacheWrite float64
    Uptime1d   float64
    Quant      string
}
```

### 管理员覆盖（DB，可编辑）

新增 ent 表 `model_price_override`（轻量）：

```
model_id (PK)        openrouter slug 或本地模型名
pinned_provider_tag  string?   指定供应商（②）
manual_input         float64?  手动覆盖 input（①）
manual_output        float64?
manual_cache_read    float64?
manual_cache_write   float64?
note                 string?   覆盖理由
updated_by, updated_at
```

### 本地模型名 ↔ OpenRouter slug 匹配
- 主匹配：归一化后精确匹配（去厂商前缀、小写、去 `-latest`/日期后缀）。
- 兜底：`platform + family` 模糊匹配；匹配不到的模型在 UI 标「无官方价源」，不阻断。
- 匹配关系可在目录页人工校正并持久化（`model_alias` 映射）。

---

## 四、API 面

```
GET  /admin/model-catalog                 全量目录（含 providers[] + 已选基准 + 覆盖状态）
GET  /admin/model-catalog/:model          单模型详情（供 tooltip / 抽屉核对）
POST /admin/model-catalog/sync            手动触发 OpenRouter 同步（/models + 热门模型 /endpoints）
PUT  /admin/model-catalog/:model/override 写覆盖（pin 供应商 / 手动价 / 清除）
GET  /admin/channels/model-pricing        【保持现有契约】现在由 OpenRouter 目录回答，
                                           返回 official baseline + 来源 provider + 全供应商列表
```

同步节奏：复用现有 24h 调度 + 启动加载 + 本地兜底；`/endpoints` 按需懒同步（只对在用模型拉，避免 300×N 请求）。

---

## 五、前端展示：直接、可编辑、可核对、信息密集

### 1. PayGo 计价台（主战场）
当前矩阵 = 模型 × 分组售价 + 折价染色。增强为「官方价就在眼前」：

```
┌ 模型行 ────────────────────────────────────────────────┐
│ claude-sonnet-4-6   官方 IN $3.00 OUT $15.00  来源:Anthropic ▾ │ ← 官方价直接展示 + 来源
│   ├ vip-line  ×1.5  IN $4.50 +50%  OUT $22.50 +50%            │ ← 售价 + 相对官方折价染色
│   └ free-trial ×0.8 IN $2.40 −20%  OUT $12.00 −20%            │
└────────────────────────────────────────────────────────┘
点「来源 ▾」展开供应商核对抽屉 ↓
```

### 2. 供应商核对抽屉（可核对 + 可编辑）
点模型的「来源」展开右侧抽屉，信息密集：

```
claude-sonnet-4-6                          [↻ 重新同步此模型]
描述：Claude Sonnet 4.5 is Anthropic's most advanced…   ← prose 描述
上下文 1M · 能力 推理/工具/结构化
─────────────────────────────────────────
官方价取舍：  ○ 自动最低价   ● 指定供应商   ○ 手动输入
─────────────────────────────────────────
供应商         IN/MTok  OUT/MTok  缓存读  uptime  [选]
● Anthropic    $3.00    $15.00    $0.30   99.97%   ◉   ← 当前基准高亮
  Amazon Bedrock $3.00  $15.00    $0.30   94.56%   ○
  Google Vertex  $3.00  $15.00    $0.30   99.9%    ○
─────────────────────────────────────────
手动覆盖： IN [____] OUT [____] 缓存读[__] 写[__]  备注[____]
                                      [清除覆盖] [保存]
```

要点：
- **可核对**：所有供应商的价并排列出 + uptime/量化，管理员一眼比对；当前基准高亮 + 来源标注。
- **可编辑**：三态取舍（自动/指定/手动）+ 手动覆盖字段，存 DB。
- **信息密集**：价格 mono 钢白对齐（沿用刚修好的矩阵对齐）、折价染色、能力/上下文/描述同屏。
- **直接展示**：官方价不再藏在懒加载里，目录同步后矩阵直接显示官方列。

### 3. 模型描述落点
- 计价台/账号池/分组的模型选择处，hover 出 OpenRouter 描述 + 能力徽章。
- 可选「模型目录」独立页：全量模型卡（描述/能力/上下文/官方价/覆盖状态），供运营浏览选品。

---

## 六、落地分期

| 阶段 | 内容 |
|------|------|
| P1 后端源切换 | pricing_service 增 OpenRouter 源（/models）→ 目录缓存；保留 LiteLLM 兜底开关 |
| P2 多供应商 | /endpoints 懒同步 + ProviderPrice；取舍三层兜底逻辑；model-pricing 端点改由目录回答 |
| P3 覆盖表 | ent `model_price_override` + PUT 端点 + 匹配/别名校正 |
| P4 前端 | 计价台官方价列 + 来源 + 供应商核对抽屉（展示/编辑/核对）|
| P5 描述 | 描述+能力进 tooltip / 可选模型目录页 |

---

## 七、风险与决断点

1. **OpenRouter 价 = 路由价非厂商牌价**：对直连模型基本等于厂商原价透传，对转售成本锚更贴现实；接受。
2. **/endpoints 请求量**：300 模型全拉 = 300 请求；策略=只对「在用模型」（有渠道定价/分组引用的）懒同步，其余用 /models 代表价。
3. **schema 变更**：新增 `model_price_override` 表需 ent migration（可逆，新增表不动旧数据）。
4. **匹配失配**：本地模型名与 OpenRouter slug 对不上的，UI 明示「无官方价源」并允许人工别名，不静默错配。

**唯一需魔尊拍板**：取舍默认策略——姐姐推荐「自动最低价 + 可覆盖」（§2）。若你倾向「默认锁首方供应商」（claude→Anthropic）也可，改默认②即可。
