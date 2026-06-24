# 0. 决策摘要

- **栈定型**：Svelte 5 runes + SvelteKit 2 + adapter-static + shadcn-svelte/bits-ui + Tailwind + Zinc。拒绝 React/Next（重量级、状态心智差太远）和 paraglide（要重写 ~700 个 t() 调用点）。
- **embed 双 SPA**：Go 侧用 build tag `frontend_vue`（默认）/`frontend_svelte` 切换 `//go:embed`，单二进制内只装一套；保留 Vue 直到 D 阶段全量验收后删除。
- **保留集红线**：OpenRouter 定价、订单/账单闭环、QUENCH plans+subscriptions、settings-registry 引擎、v22 AppShell+nav.ts。这五块是 subme 相对上游的全部价值，必须 1:1 移植，不重构语义。
- **铁律**：单页 ≤ 400 行（路由文件），单 eager vendor chunk（TDZ 教训），Select 哨兵 `__all__/__none__` 不松口，stylelint 禁裸 hex/非 Zinc 调色。
- **路线**：A POC（5 道硬关，10 天）→ B 用户端（12 天）→ C 管理端（22 天）→ D 切默认 + 删 Vue（5 天）。总 ~49 个工作日，单人推。

---

# 1. 技术栈定型

| 层 | 选择 | 一句话理由 |
|---|---|---|
| Framework | Svelte 5.x runes + SvelteKit 2.x | runes 直接映 Vue Composition API（$state↔ref、$derived↔computed、$effect↔watchEffect），心智零跃迁。 |
| Adapter | `@sveltejs/adapter-static` + `fallback:'index.html'` + `ssr:false` | 必须输出扁平 dist/ 给 `//go:embed all:dist`；fallback 兼容现有 `FrontendServer.serveIndexHTML`。 |
| Build | Vite 5 (SvelteKit 内置) + pnpm@9 (CI lock) | 现 `injectPublicSettings` Vite 插件直接搬到 `svelte.config.js`；pnpm@9 是 CI 契约（memory `pnpm-version-must-match-ci`）。 |
| UI Kit | shadcn-svelte + bits-ui + Tailwind + lucide-svelte | 与现 shadcn-vue + reka-ui 同构；Zinc 变量名一致，CSS token 复制即可。 |
| Routing | SvelteKit 文件路由 + `hooks.client.ts` 全局 guard | 替代 947 行 `router/index.ts`；`beforeNavigate` 单一拦截点替 `router.beforeEach`。 |
| State | Svelte 5 runes + `lib/stores/*.svelte.ts` class 单例 | 9 个 Pinia store → 9 个 `.svelte.ts` class；持久化用 `persisted.svelte.ts` helper。 |
| i18n | `svelte-i18n` (ICU) | 拒 paraglide：现有 7800 行 zh.ts/en.ts + 700 个 `$t()` 调用点零改写；同款 lazy-load-per-locale。 |
| Forms | `sveltekit-superforms` (client 模式) + zod 3 | client 模式跳过 SSR action，与 adapter-static 兼容；zod schema 复用到 Go API 契约校验。 |
| HTTP | 手写 `lib/api/client.ts` + 17 个 resource 模块 | 拒 axios：现拦截器只剩 401 重定向 + token 注入 + baseURL 读 `window.__APP_CONFIG__`，原生 fetch 足够，省 axios 包。 |
| Charts | `chart.js` + `svelte-chartjs`（lazy island） | 同 Chart.js core，只换 wrapper；dynamic import 守 vendor-chunk-tdz-trap。 |
| Virtualization | `@tanstack/svelte-virtual` | 与现 `@tanstack/vue-virtual` 同源；`AccountsPool`/`AdminOrders` 重表直接换包。 |
| Testing | `vitest` + `@testing-library/svelte` + Playwright | 拒 cypress：现 vitest 配置原样复用，仅换 testing-library 适配器。 |

---

# 2. 上游骨架 vs subme 现状

| 指标 | upstream@4a5665da | subme@cc522ae7 | Δ |
|---|---|---|---|
| views 总数 | 78 | 114 | +36 |
| components 总数 | 176 | 260 | +84 |
| 最大单页 LOC | `admin/SettingsView.vue` 10440 | `admin/GroupsView.vue` 4029 | upstream 顶页消失（已注册化），但新增页仍突破 400 行红线 |
| 顶 10 LOC 总和 | 28147 | 21856 | -22%（settings 拆分功劳） |
| 新增 admin 子域 | — | `admin/accounts/`、`admin/monetization/{plans,pricing,subscriptions}/`、`admin/settings-registry/`、`admin/users/`、`admin/orders/`、`admin/affiliates/` | 保留集核心 |
| 删除 upstream 页 | — | `admin/SettingsView.vue` (10440)、`admin/AccountsView.vue` (1727)、`auth/DingTalkEmailCompletionView`、user `AirwallexPaymentView`/`PaymentQRCodeView` | 已被新架构取代 |
| OAuth 回调页 | 7 个独立 vue 文件 | 7 个独立 vue 文件 | 移植期合并为 `routes/auth/callback/[provider]/+page.svelte` |

观察：subme 不是 upstream 的 superset，是 superset−delta；删除项必须验证后端是否仍依赖旧路由 path（如 `/admin/settings/legacy`、`/admin/subscriptions/legacy` 当过渡 fallback 保留）。

---

# 3. 保留集（subme 增量必须移植）

### 3.1 OpenRouter 定价 UI（admin/monetization/pricing）
**理由**：memory 红线 `openrouter-pricing-done`。后端 `GetModelPricing` 不可动，前端是唯一可见面。
- `frontend/src/views/admin/monetization/pricing/PricingModelListView.vue`
- `frontend/src/views/admin/monetization/pricing/ProviderVerifyDrawer.vue`
- `frontend/src/api/admin/modelCatalog.ts`
- `frontend/src/router/index.ts:/admin/pricing`

### 3.2 订单 + 账单闭环（admin/orders）
**理由**：与 OpenRouter 定价同链的收入闭环，upstream 无此层。
- `frontend/src/views/admin/orders/OrdersFilterBar.vue`
- `frontend/src/views/admin/orders/AdminOrdersView.vue`
- `frontend/src/views/admin/orders/AdminPaymentDashboardView.vue`
- `frontend/src/views/admin/orders/AdminPaymentPlansView.vue`
- `frontend/src/views/admin/orders/PlanEditDialog.vue`
- `frontend/src/components/admin/users/tabs/OrdersTab.vue`

### 3.3 Plans + Subscriptions（QUENCH 残留）
**理由**：替代 upstream 扁平 `SubscriptionsView`，是 monetization 叙事主轴。QUENCH 皮肤剥离但功能保留。
- `frontend/src/views/admin/monetization/plans/PlansCatalogView.vue`
- `frontend/src/views/admin/monetization/plans/PlanCard.vue`
- `frontend/src/views/admin/monetization/subscriptions/SubscriptionsQuenchView.vue`
- `frontend/src/views/admin/monetization/subscriptions/SubscriptionDialogs.vue`

### 3.4 Settings Registry 引擎
**理由**：替代 upstream 10440 行 `SettingsView.vue` 的声明式注册表。丢失即整个 admin 配置面塌方。
- `frontend/src/views/admin/settings-registry/SettingsRegistryView.vue`
- `frontend/src/views/admin/settings-registry/FieldRenderer.vue`
- `frontend/src/views/admin/settings-registry/SectionRenderer.vue`
- `frontend/src/views/admin/settings-registry/registry.ts`
- `frontend/src/views/admin/settings-registry/sections/`（~28 段）
- `frontend/src/views/admin/settings-registry/special/`（~22 段）

### 3.5 AppShell + nav 模型（v22 c0875399）
**理由**：用户/管理双端统一 shell + 命令面板 + nav 过滤。移植不是搬皮肤，是搬 IA 主干。
- `frontend/src/components/shell/AppShell.vue`
- `frontend/src/router/nav.ts`
- `frontend/src/composables/useNavFiltered.ts`（含单测）

---

# 4. 目录骨架（frontend-svelte/）

```
frontend-svelte/
├── svelte.config.js            # adapter-static + fallback: index.html
├── vite.config.ts              # injectPublicSettings + 单 eager vendor + lazy islands
├── package.json                # pnpm@9, deps 镜像现 frontend/package.json 子集
├── pnpm-lock.yaml              # CI=true npx pnpm@9 install --lockfile-only 生成
├── tailwind.config.ts          # Zinc only + density CSS vars
├── tsconfig.json
├── .eslintrc.cjs               # max-lines-per-file 400, no-empty-select-value, no-restricted-imports
├── stylelint.config.cjs        # no-raw-color custom rule
├── src/
│   ├── app.html                # 注入 window.__APP_CONFIG__ 占位
│   ├── app.css                 # Zinc tokens, density vars
│   ├── hooks.client.ts         # 全局 guard、401 重定向、locale 初始化
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts       # fetch wrapper + AbortController
│   │   │   ├── admin/
│   │   │   │   ├── modelCatalog.ts
│   │   │   │   ├── orders.ts
│   │   │   │   ├── plans.ts
│   │   │   │   ├── settingsRegistry.ts
│   │   │   │   └── ...
│   │   │   └── user/
│   │   ├── stores/             # *.svelte.ts class 单例
│   │   │   ├── auth.svelte.ts
│   │   │   ├── app.svelte.ts
│   │   │   ├── adminSettings.svelte.ts
│   │   │   ├── persisted.svelte.ts
│   │   │   └── ...
│   │   ├── ui/                 # shadcn-svelte 复制源
│   │   │   ├── button/
│   │   │   ├── select/         # 哨兵 __all__/__none__ 实现
│   │   │   ├── input/
│   │   │   ├── table/
│   │   │   └── ...
│   │   ├── shell/
│   │   │   ├── AppShell.svelte
│   │   │   ├── AppSidebar.svelte
│   │   │   └── CommandPalette.svelte
│   │   ├── nav/
│   │   │   ├── user.config.ts
│   │   │   ├── admin.config.ts
│   │   │   └── filter.ts       # useNavFiltered 等价
│   │   ├── registry/
│   │   │   ├── settings.schema.ts
│   │   │   ├── FieldRenderer.svelte
│   │   │   └── SectionRenderer.svelte
│   │   ├── i18n/
│   │   │   ├── index.ts        # svelte-i18n init + 懒加载
│   │   │   ├── zh.ts
│   │   │   └── en.ts
│   │   ├── auth/providers/     # dingtalk/oidc/wechat/linuxdo/oauth 策略
│   │   └── forms/createClientForm.ts
│   └── routes/
│       ├── +layout.svelte               # 顶层（toast、theme、i18n provider）
│       ├── +error.svelte
│       ├── (user)/
│       │   ├── +layout.svelte           # 用户端 AppShell（density=comfortable）
│       │   ├── dashboard/+page.svelte
│       │   ├── keys/+page.svelte
│       │   ├── subscriptions/+page.svelte
│       │   ├── usage/+page.svelte
│       │   ├── billing/+page.svelte
│       │   ├── profile/+page.svelte
│       │   └── affiliates/+page.svelte
│       ├── (admin)/
│       │   ├── +layout.svelte           # 管理端 AppShell（density=compact）
│       │   ├── monetization/
│       │   │   ├── plans/+page.svelte
│       │   │   ├── pricing/+page.svelte
│       │   │   └── subscriptions/+page.svelte
│       │   ├── orders/{list,payments,dashboard}/+page.svelte
│       │   ├── accounts/+page.svelte
│       │   ├── channels/{list,monitor}/+page.svelte
│       │   ├── settings/+page.svelte    # registry 驱动
│       │   ├── ops/+page.svelte
│       │   └── ...
│       └── auth/
│           ├── login/+page.svelte
│           ├── register/+page.svelte
│           └── callback/[provider]/+page.svelte   # 7 合 1
└── tools/
    ├── migrate/route-map.mjs   # vue-router → SvelteKit 路由 codemod
    └── check-chunks.mjs        # eager chunk ≤ 2 守门
```

---

# 5. Go embed 双 SPA 切换

策略：单二进制内只装一套；构建期选定。拒绝运行时双挂载（多 30MB 二进制 + 路由混淆）。

**文件清单**（`backend/internal/frontend/`）：

```go
// embed_vue.go
//go:build !frontend_svelte
package frontend

import "embed"

//go:embed all:dist_vue
var DistFS embed.FS

const DistRoot = "dist_vue"
```

```go
// embed_svelte.go
//go:build frontend_svelte
package frontend

import "embed"

//go:embed all:dist_svelte
var DistFS embed.FS

const DistRoot = "dist_svelte"
```

**构建合约**：
- 默认 tag = 空 → 走 Vue（`embed_vue.go` 是默认编译路径）。
- 切 Svelte：`go build -tags=frontend_svelte ./cmd/server`。
- CI matrix 双产物：`server-vue`（默认）+ `server-svelte`（带 tag）；同 commit 同 SHA-256 后端逻辑层。
- `Makefile`：
  - `make build-vue` → 跑 `frontend/` pnpm build → 输出到 `backend/internal/frontend/dist_vue/`
  - `make build-svelte` → 跑 `frontend-svelte/` pnpm build → 输出到 `backend/internal/frontend/dist_svelte/`
- `FrontendServer.serveIndexHTML` 改读 `DistRoot` 常量，无运行时分支。

**回滚**：D 阶段切默认 = 把 build tag 反过来（`embed_svelte.go` 默认、`embed_vue.go` 带 tag）；任何阶段回滚 = 切回默认 tag 重 build，二进制重发。Vue 文件保留到 D+1 周后删除。

---

# 6. 5 道硬关 POC

### POC 1 — embed 契约 + 单 eager vendor chunk
- **目标**：SvelteKit + adapter-static 产物被 Go 二进制吃下，且 vendor chunk 不复发 TDZ。
- **验收**：`make build-svelte && ./server-svelte` 启动后 `curl -sI http://127.0.0.1:8080/ | grep 'text/html'`；`node tools/check-chunks.mjs` exit 0（eager chunk ≤ 2）；浏览器 console 无 `Cannot access 'V' before initialization`。
- **文件**：`svelte.config.js`、`vite.config.ts`、`backend/internal/frontend/embed_svelte.go`、`tools/check-chunks.mjs`。
- **工作量**：1.5 天。

### POC 2 — AppShell + nav 配置 + 命令面板骨架
- **目标**：双端 layout 切换、admin↔user 链接、Cmd-K 打开命令面板渲染 nav config。
- **验收**：`pnpm test src/lib/nav/filter.test.ts` 全过；Playwright 脚本 `e2e/shell.spec.ts` 登录后 `/dashboard` → 点 admin 链接 → `/admin/orders` 顶栏更新、sidebar density 切 compact；命令面板搜 "pricing" 命中 `/admin/monetization/pricing`。
- **文件**：`src/routes/(user)/+layout.svelte`、`src/routes/(admin)/+layout.svelte`、`src/lib/shell/AppShell.svelte`、`src/lib/nav/{user,admin}.config.ts`、`src/lib/nav/filter.ts`。
- **工作量**：2 天。

### POC 3 — i18n 平移 + Select 哨兵
- **目标**：`$t()` 调用与 vue-i18n 1:1；Select 空值哨兵契约移植。
- **验收**：把现 `locales/zh.ts` 直接 import 进 svelte-i18n，`pnpm test src/lib/i18n/parity.test.ts` 比对 1000 个随机 key 与 Vue 端 t() 输出一致；`<Select>` 测试用例传 `value=""` 必 throw（lint+runtime 双守）；e2e 切语言来回切，无空字符串渲染。
- **文件**：`src/lib/i18n/index.ts`、`src/lib/i18n/{zh,en}.ts`（从 `frontend/src/locales/` 复制）、`src/lib/ui/select/Select.svelte`、`.eslintrc` 中 `no-empty-select-value` 规则。
- **工作量**：1.5 天。

### POC 4 — settings-registry 端到端
- **目标**：把 1 个 section（SMTP）整体从 Vue 注册表搬到 Svelte 注册表，证明 schema 模型可移植。
- **验收**：`/admin/settings#smtp` 渲染所有字段、保存调 `PATCH /admin/settings`、reload 后值回填；`pnpm test src/lib/registry/smtp.test.ts` 校验 schema → DOM → API payload 三方一致。
- **文件**：`src/lib/registry/settings.schema.ts`（仅 smtp 段）、`src/lib/registry/FieldRenderer.svelte`、`src/lib/registry/SectionRenderer.svelte`、`src/routes/(admin)/settings/+page.svelte`、`src/lib/api/admin/settingsRegistry.ts`。
- **工作量**：3 天。

### POC 5 — OpenRouter 定价页 + 重表虚拟化
- **目标**：保留集 §3.1 跑通 + `@tanstack/svelte-virtual` 撑住 5000 行模型表。
- **验收**：`/admin/monetization/pricing` 列出全部模型；provider verify drawer 打开调 `/api/admin/model-catalog/verify`；DevTools Performance 录制滚动到底，长任务 < 50ms；与现 Vue 页对照截图（同分辨率），UI 差异肉眼可忽略。
- **文件**：`src/routes/(admin)/monetization/pricing/+page.svelte`、`src/lib/api/admin/modelCatalog.ts`、`src/lib/ui/table/VirtualTable.svelte`、`src/lib/features/pricing/ProviderVerifyDrawer.svelte`。
- **工作量**：2 天。

POC 总工作量 ≈ 10 天。出完 5 关后才允许进 B 阶段。

---

# 7. 美学纲领

1. **Zinc-only 中性，仅语义 token**。强制：stylelint `no-raw-color` 禁裸 hex（白名单 11 个 Zinc 刻度）；CI `rg -n '#(?!18181b|09090b|fafafa|f4f4f5|e4e4e7|d4d4d8|a1a1aa|71717a|52525b|3f3f46|27272a)([0-9a-f]{6})' src/` 返 0。
2. **路由文件 ≤ 400 行**。强制：eslint `max-lines-per-file: ['error',{max:400}]` 限 `src/routes/**/+page.svelte` + `+layout.svelte`。10440 行的 `SettingsView.vue` 是反面教材。
3. **配置 UI 必走注册表**。强制：`no-restricted-imports` 禁 `lib/registry/` 外引 FieldRenderer/SectionRenderer；新增设置 = 改 schema，不开新组件。
4. **单 eager vendor + lazy 岛**。强制：`tools/check-chunks.mjs` eager 数 > 2 或 chart/stripe/airwallex/xlsx/markdown 落 eager → CI 红。
5. **密度模式一等公民**。强制：`<html data-density>` 驱动 `--row-h`/`--input-h`/`--space-*`；`routes/admin/**/*Table.svelte` 禁 `h-\d+`/`p-\d+` 硬编码（`no-restricted-syntax`）。
6. **Select 必哨兵**。强制：`lib/ui/select` 默认 `__all__`/`__none__`；`no-empty-select-value` AST 规则禁 `value=""` 与 `value={undefined}`；query-string 同步层做哨兵 ↔ omit-key 翻译，禁封装层补丁（memory `reshadcn-migration`）。
7. **URL 层级 = 信息层级**。强制：`routes/admin/` 根禁直接放 `.svelte`；`tools/check-nav-routes.mjs` diff nav config 与路由树，不一致 CI 红。
8. **Layout slot 唯一**。强制：grep 任何 `+page.svelte` 含 `<AppHeader`/`<AdminSidebar`/`<Toaster`/顶层 `<aside>` 即 fail。

---

# 8. 路由 / 状态 / i18n / UI / 表单 / HTTP / Build 七大支柱

## 8.1 路由
SvelteKit 文件路由 + `hooks.client.ts` 单一 guard：

```ts
// src/hooks.client.ts
import { beforeNavigate } from '$app/navigation';
import { auth } from '$lib/stores/auth.svelte';

beforeNavigate(({ to, cancel }) => {
  if (to?.url.pathname.startsWith('/admin') && !auth.isAdmin) {
    cancel(); window.location.href = '/login'; return;
  }
  if (to?.url.pathname.startsWith('/dashboard') && !auth.user) {
    cancel(); window.location.href = '/login';
  }
});
```

Codemod `tools/migrate/route-map.mjs`:解析 `frontend/src/router/index.ts` 全部 path → 输出 SvelteKit 目录骨架 stub。

## 8.2 状态
Pinia 9 个 store → 9 个 `*.svelte.ts` class：

```ts
// src/lib/stores/auth.svelte.ts
import { persisted } from './persisted.svelte';

class AuthStore {
  user = $state<User | null>(null);
  token = persisted<string | null>('auth.token', null);
  get isAdmin() { return this.user?.role === 'admin'; }
  async login(p: LoginPayload) { /* fetch + set */ }
  logout() { this.user = null; this.token = null; }
}
export const auth = new AuthStore();
```

## 8.3 i18n
svelte-i18n + 现 zh.ts/en.ts 直接 import；懒加载：

```ts
// src/lib/i18n/index.ts
import { register, init, locale } from 'svelte-i18n';
register('zh', () => import('./zh').then(m => m.default));
register('en', () => import('./en').then(m => m.default));
init({ fallbackLocale: 'zh', initialLocale: localStorage.getItem('locale') ?? 'zh' });
```

## 8.4 UI
shadcn-svelte CLI add → 复制到 `src/lib/ui/`，Zinc token 与 Vue 端共享 `app.css`。Select 哨兵实现：

```svelte
<!-- src/lib/ui/select/Select.svelte -->
<script lang="ts">
  export let value: string;          // '__all__' | '__none__' | 真值
  if (value === '' || value == null) throw new Error('Select: empty value banned, use __all__/__none__');
</script>
```

## 8.5 表单
superforms client 模式 + zod：

```ts
// src/lib/forms/createClientForm.ts
import { superForm, defaults } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
export function createClientForm<S extends import('zod').ZodTypeAny>(schema: S, initial?: any) {
  return superForm(defaults(initial ?? {}, zod(schema)), { SPA: true, validators: zod(schema) });
}
```

## 8.6 HTTP
原生 fetch + 17 模块：

```ts
// src/lib/api/client.ts
const base = () => (window as any).__APP_CONFIG__?.apiBase ?? '/api';
export async function request<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  const r = await fetch(base() + path, {
    ...init, signal,
    headers: { 'content-type': 'application/json', ...authHeader(), ...init.headers },
  });
  if (r.status === 401) { auth.logout(); location.href = '/login'; throw new Error('401'); }
  if (!r.ok) throw new ApiError(r.status, await r.text());
  return r.status === 204 ? (undefined as T) : r.json();
}
```

## 8.7 Build
`vite.config.ts` 单 eager vendor + 命名 lazy 岛；`tools/check-chunks.mjs`：

```js
const eager = chunks.filter(c => !c.dynamicallyImported);
if (eager.length > 2) process.exit(1);
const forbidden = ['chart.js', '@stripe', 'airwallex', 'xlsx', 'markdown-it'];
for (const c of eager) for (const f of forbidden)
  if (c.modules.some(m => m.includes(f))) process.exit(2);
```

---

# 9. 迁移阶段路线

### Phase A — POC 5 关（10 天）
- M1 POC1 embed 跑通 / M2 POC2 shell+nav / M3 POC3 i18n+select / M4 POC4 registry / M5 POC5 pricing 重表
- **Exit gate**：5 个 POC 验收命令全绿；`make build-svelte` 二进制可启动并 serve 前述 5 路由 200。

### Phase B — 用户端（12 天）
范围：`(user)/{dashboard,keys,subscriptions,usage,billing,profile,affiliates,redeem}` + `auth/{login,register,forgot,reset,verify,callback/[provider]}`。
- M6 用户 dashboard+keys（3 天）/ M7 subscriptions+billing+payment（4 天，含 Stripe lazy island）/ M8 usage+profile+affiliates（2 天）/ M9 auth 7 路径合并（3 天）
- **Exit gate**：用户端 e2e（Playwright `e2e/user/*.spec.ts`）全绿；与 Vue 端并行同 host 切 cookie 对照截图差异 < 5 处肉眼可见 diff。

### Phase C — 管理端（22 天）
范围：保留集 §3 五块 + upstream 等价管理页（accounts/channels/groups/proxies/risk/ops/users/announcements/backup/promo/redeem）。
- M10 settings-registry 28 sections + 22 special（7 天，最重）
- M11 monetization 三件套 plans/pricing/subscriptions（4 天）
- M12 orders 四页（3 天）
- M13 accounts pool + channels + groups + proxies（5 天，含虚拟表）
- M14 ops dashboard + risk + users + 长尾（3 天）
- **Exit gate**：管理端 e2e 全绿；`rg -n 'TODO|FIXME|@ts-ignore' frontend-svelte/src/routes/\(admin\)` 返 0；OpenRouter pricing 红线页与 Vue 端 API payload 字节级一致。

### Phase D — 切默认 + 删 Vue（5 天）
- M15 默认 build tag 反转（1 天，CI matrix 主线变 svelte）
- M16 灰度观察（2 天，生产 7 天告警零事故才进下一步）
- M17 删 `frontend/` 与 `backend/internal/frontend/dist_vue/`、`embed_vue.go`（1 天）
- M18 文档更新（README/ARCHITECTURE/CLAUDE.md）+ memory 归档（1 天）
- **Exit gate**：`git rm -r frontend/` 后 `make test && make build` 全绿；二进制大小净减 ≥ 1.5 MB。

总计 **49 个工作日**，单人推。

---

# 10. 风险与回滚

| # | 风险 | 触发条件 | 缓解 | 回滚动作 |
|---|---|---|---|---|
| 1 | shadcn-svelte primitive 缺口（Combobox/Calendar） | 进入 C 阶段发现某页强依赖 | POC 1 阶段先做 primitive 清单 vs 现 ui/ 20 件对照表；缺口列入 lib/ui 自研 backlog | 单页 fallback：该路由继续 Vue（Go middleware path 白名单转发到 dist_vue/） |
| 2 | settings-registry 28+22 段 schema 漂移 | M10 中途 backend 改 settings shape | schema 写完即 freeze，PATCH 后端先 stable 再开 M10；写 zod schema 对 `/admin/settings/schema` 端点做契约测试 | 回滚到 legacy 路由 `/admin/settings/legacy`（保留 Vue 段直到 D） |
| 3 | TDZ 白屏复发 | manualChunks 配错或某 dep 偷偷顶层 import 重 SDK | `tools/check-chunks.mjs` 入 CI；vendor 拆分策略写进 `vite.config.ts` 顶部注释（memory vendor-chunk-tdz-trap） | 回滚 vite.config.ts 到单一 vendor 配置（git revert 指定 commit） |
| 4 | i18n 静默空串回归 | svelte-i18n key 缺失或路径写错 | POC 3 parity 测试覆盖 1000 随机 key；运行时 missing-key 默认输出 `‹missing:key›` 红色字 | 临时禁掉 fallback、`MISSING` 关键字 grep 给出全表 |
| 5 | superforms client 模式踩坑 | M7 复杂支付表单（多 step、动态字段） | `createClientForm` helper 集中处理；遇阻直接降级为手写 store + zod | 单页降级：去掉 superforms，直接 `$state` + zod safeParse |
| 6 | pnpm 锁版本漂移 | 开发本地用 pnpm 11 跑了 install | `engines.pnpm: ">=9 <10"`、`packageManager: "pnpm@9.x.x"`；CI 第一步 `corepack enable && pnpm -v` | `CI=true npx pnpm@9 install --lockfile-only` 重生成 lock 后提 PR |
| 7 | embed dist_svelte 路径硬编码漂移 | Go 端某处忘改读 DistRoot 常量 | `rg -n '"dist_vue"\|"dist_svelte"' backend/` 必须只出现在 2 个 embed_*.go 文件 | grep gate CI；任何越界引用 PR 拒合 |
| 8 | Vue 删除后发现遗漏路由 | D 阶段后用户报某老链接 404 | M15-M16 灰度期跑两套 e2e（vue + svelte），全集 diff；M17 删除前 24h 在生产开 access-log path 直方图 | embed_vue.go tag 反开（30 分钟内能切回 Vue 默认） |

---

# 11. 立刻可执行的下一步

1. **建分支 + 骨架**：`git checkout -b feat/svelte-rewrite && mkdir frontend-svelte && cd frontend-svelte && pnpm dlx sv@latest create . --template minimal --types ts --no-add-ons` → 立即跑 `pnpm i && pnpm dev` 验证 hello world 端起，提初始 commit。
2. **POC 1 embed 契约**：写 `backend/internal/frontend/embed_svelte.go`（build tag）与 `embed_vue.go`（默认）拆分；改 `FrontendServer.serveIndexHTML` 读 `DistRoot` 常量；`make build-svelte` 一次跑通，curl `/` 返 200 + text/html。
3. **POC 3 i18n 平移种子**：把 `frontend/src/locales/{zh,en}.ts` 原样 `cp` 到 `frontend-svelte/src/lib/i18n/`，写 `src/lib/i18n/parity.test.ts` 对 100 个随机 key 跑通 vitest，确认 ICU 调用面零改动 — 这一步绿了，700+ `$t()` 调用点的迁移就是机械工作。
