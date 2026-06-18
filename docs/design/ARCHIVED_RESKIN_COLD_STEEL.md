> **已弃用 2026-06-12**：被 frontend/RESHADCN.md 取代。保留作为方向溯源。

# COLD STEEL · 前端冷钢黑白金属 Re-skin

> 策略：**视觉层重写（re-skin）**，保留全部业务/数据/i18n/路由/stores，
> 仅重建设计系统层与组件外观。app 始终可用、分阶段、可回退。
> 技术：shadcn-vue（reka-ui + Tailwind + cva）+ 冷钢黑白金属设计 token。

## 设计语言

冷钢（COLD STEEL）：纯黑炭打底、银白前景、铬银强调、gunmetal 表面 + 金属边缘高光，无彩色温。

| token | dark（主调） | light（冷白） |
|-------|-------------|--------------|
| background | `#0a0a0b` 炭黑 | `#ffffff` |
| card / surface | `#16181a` gunmetal | `#f9fafb` |
| border | `#2a2d31` 钢灰 | `#dfe2e6` |
| foreground | `#e8eaed` 银白 | `#1a1b1e` |
| primary | `#c0c4cc` 铬银 | `#33363b` 深钢 |
| ring | 银 focus 环 | 钢 focus 环 |
| radius | `0.375rem`（收紧、硬朗） | 同 |

金属质感三件套：① gunmetal 线性渐变面 ② 顶部高光边 `inset 0 1px rgba(255,255,255,.1)` ③ 冷投影。
主按钮 = 亮银实体金属（`bg-metal-silver` 深字 + 高光边）；拉丝扫光用 `.metal-sheen`。

## 杠杆打法

1. **token 重定义**（`tailwind.config.js`）：`primary` teal→铬银、`dark` slate→纯炭 → 117+193 文件色调自动转冷钢。
2. **全局类重写**（`src/style.css` `@layer components`）：`.btn`/`.input`/`.card`/`.badge`/`.table`/`.sidebar`/`.tab`/`.modal`/`.dialog`/`.toast`… 全部金属化 → **121+90+54… 文件基础控件即换肤**。
3. **shadcn-vue primitives**（`src/components/ui/`）：精致金属交互件，逐步替换自研组件。
4. **逐页精修**：处理 inline tailwind 残留 + 标杆细节。

## 进度

### ✅ 第一刀：设计系统 + 标杆容器（已完成，build/typecheck 绿）
- 依赖：reka-ui / class-variance-authority / tailwind-merge / tailwindcss-animate
- `src/lib/utils.ts`：`cn()`
- `tailwind.config.js`：冷钢 token + shadcn 语义层 + 金属阴影/渐变 + 收紧 radius + animate
- `src/style.css`：`:root`/`.dark` 冷钢 CSS vars + 全局类全面金属化 + 金属 utilities
- `src/components/ui/button/`：Button primitive（金属变体 default/secondary/outline/ghost/destructive/link）
- `src/components/layout/AuthLayout.vue`：标杆容器（炭黑底 + 银网格 + gunmetal 金属卡 + 扫光 + 银渐变标题）→ 登录/注册/找回密码全部精修

### ▶ 待办（fan-out 全站）
- [ ] 补全 primitives：Card / Input / Label / Select / Dialog / Badge / Dropdown / Switch / Tabs / Tooltip
- [ ] 核心布局：AppLayout / AppHeader / AppSidebar 金属精修
- [ ] 高频页逐页精修：Dashboard / AccountsView / UsageView / UsersView / KeysView / SettingsView …（78 views）
- [ ] inline tailwind 残留迁移：`-primary-`(117) / `gray-NNN`(232) / `dark-NNN`(193) → 语义 token
- [ ] 清理旧玻璃拟态遗留（glass/glow/mesh 残留）
- [ ] 移除 deprecated `lucide-vue-next`（改用现有 `components/icons/Icon.vue`）或换正确版本
- [ ] 暗/亮双主题逐页核对对比度（a11y）

## 验证

```bash
cd frontend
pnpm dev            # 本地预览（暗色下看冷钢主调）
node_modules/.bin/vue-tsc --noEmit   # 类型
node_modules/.bin/vite build         # 构建 + tailwind/css 编译
make -C .. test-frontend-critical    # 关键回归
```
