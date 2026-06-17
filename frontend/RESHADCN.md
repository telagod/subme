# RE-SHADCN · 回归 shadcn-vue 原生组件（Zinc）

> 2026-06-12 方向转变：冷钢 / QUENCH 被否（"驾驭不了冷钢配色，回到原生 shadcn，逐个组件重写"）。
> 取代 `RESKIN.md` / `RESKIN_RULES.md`（COLD STEEL，已废）。

## 决策（已定）

| 项 | 选择 |
|----|------|
| 组件 | shadcn-vue **官方原生 primitive**，逐个 add，不要自研全局类 |
| baseColor | **Zinc**（微冷中性，HSL CSS 变量驱动） |
| style | `default`（按钮 h-10 系列，与既有高度一致） |
| 明暗 | light + dark 两套官方 Zinc token 都铺好；**亮色为最终默认** |
| 起手式 | 无软重置中间态，直接 init + 逐个原生组件，过渡期接受新旧混搭 |

## ✅ 已完成：地基 + 第一批原生组件（typecheck 0 / build 绿 14.69s）

- `components.json`：shadcn-vue 配置（style default / baseColor zinc / cssVariables / lucide）
- `src/style.css`：`:root`(官方 Zinc light) + `.dark`(官方 Zinc dark) 拆分，取代旧 `:root,.dark` 合用纯黑块
- `tailwind.config.js`：`primary`/`accent` DEFAULT 走 `hsl(var(--*))`，数字色阶 + `dark` 阶全部换 **Zinc 官方值** → 117 个 inline `primary-*` / `dark-*` 残留**自动中性化**，无需逐个改文件
- 原生组件（`src/components/ui/`）：`button`(官方变体重写) / `input` / `label` / `card`(6 子件) / `badge` / `separator`

## ▶ 待办

### 1. 补全原生 primitive ✅ 完成（19 个目录，vue-tsc --noEmit exit 0 / build 绿）
- [x] dialog / sheet / tabs / dropdown-menu / tooltip / popover
- [x] switch / checkbox / textarea / select
- [x] table（原生封装）/ alert / scroll-area
- 全部 reka-ui 2.9.9 导出经 grep 确认，受控件用 useForwardPropsEmits 透传，className 走语义 token

### 2. 逐页重写（314 个 .vue）
- [x] **标杆已立**：`AuthLayout.vue`（容器→原生 Card）+ `LoginView.vue`（表单→原生 Input/Label/Button/Separator），见 `RESHADCN_RULES.md`
- [ ] 把页面里自研全局类（`.btn*`/`.card*`/`.input`/`.modal*`/`.badge*`/`.table`…）替换成原生组件
- [ ] inline 直写色 → 语义 token（`bg-card`/`text-foreground`/`text-muted-foreground`/`border-border`…）
- [ ] 84 个文件的彩虹色 → 收敛为语义状态色或中性
- [ ] 每页改完确保 light + dark 两套都正确（这是冷钢没做到的核心债）

**批量迁移波次（工作集 274 页 = 含 QUENCH 变量/自研类/彩虹色，已扣除 ui 组件与标杆）**：
- [x] 波1（`wf_d30b1c4d`）：QUENCH views **69 页** ✅ 0 fail / 8 warn 真问题已修 / typecheck 0 错 / build 绿
  - 修复：Input&Textarea modelValue 加 `|null`(16 错根因) · FieldRenderer Switch/Input v-model 契约 · 删死代码 · q-btn-danger 裸奔→Button
- [x] 波2（`wf_3b99c157`）：共享基础组件 **60 页** ✅ 1 fail+真 warn 已修 / typecheck 0 / build 绿
  - 修复：**Input.vue 加 defineExpose({focus})**(系统缺陷,SearchInput/ProxySelector 的 ref focus 失效根因) · **Button class?: string→HTMLAttributes['class']**(:class 对象绑定 5 错) · ResourceFormDrawer number 类型退化 · SearchInput :value→:model-value
- [x] 波3a（`wf_15896eee`）：account/payment/user/admin 子域 **72 页** ✅ PlanCard fail(@update:checked→model-value)+2 死代码已修 / typecheck 0 / build 绿
  - 注：AccountCapacityCell「逻辑越界」经 git diff 核实为审查官**误报**(把历史 commit 4d6eafe4 误归本次,实际 script 未动)
- [x] 波3b-small（`wf_bda220d5`）：中小页 **60 页** ✅ 1 fail+真 warn 已修 / typecheck 0 / build 绿
  - **系统根治**：Switch.vue + Checkbox.vue 加 `checked` 兼容层(同时吃 :checked 与 :model-value 两种契约) → 全站所有 :checked 用法一次复活 · 4 处 `<Input>` v-model.number→正确契约 · PaymentStatusPanel 畸形 class
  - AccountStatusIndicator 半迁移 badge-* → Tailwind 语义状态色（已迁移页瑕疵清零）

### ✅ 迁移成果（263 页 = 71+60+72+60，全绿入库）
- **全站 QUENCH CSS 变量残留 = 0**（冷钢/淬钢视觉变量彻底清除）
- 组件库系统契约全加固：Input(defineExpose+null)·Button(class 类型)·Switch/Checkbox(checked 兼容)·Textarea(null)
- 每波 typecheck 0 / build 绿，对抗审查揪出的 fail/真 warn 全部定点修
- [x] 波3b-huge：**8 核心巨页**(UsersView/AccountsView/ChannelsView/SubscriptionsView/RedeemView/ProxiesView/RiskControlView/BulkEditAccountModal) ✅ opus 波迁移完成 / typecheck 0 / build 绿 _(AccountsView 已 deprecated, see Phase 4 migration → AccountsPoolView)_
  - 修复：BulkEdit 6 处 `<Input> v-model.number`(雷点,number/number|null 分类) · proxyExpiry.ts util badge-*→Tailwind · RiskControlView 畸形 ` /50` class · **session limit 中断的半成品已 git 回滚重迁**
- [x] 超巨页 opus 波（`wf_ac24f037`）：EditAccountModal/GroupsView/CreateAccountModal ✅ 迁移完成 / typecheck 0 / build 绿
  - **Input.vue 根治支持 `modelModifiers.number/.trim`**（CreateAccountModal 15 处 `<Input v-model.number>` 雷点一次修死,改 useVModel→computed get/set）
- [x] backlog 清零（2026-06-14）：
  - ~~亮色默认切换~~ → ✅ `useTheme` composable + AppHeader 日月切换（`03d6dfd7`）
  - ~~tokens.css~~ → ✅ 已删除
  - ~~q-money/q- 工具类~~ → tokens.css 删除后无定义源，Tailwind purge 自动清
  - **SettingsView 9784 行 legacy** → 唯一保留 backlog（被 settings-registry 取代,风险收益比最差）
  - EditAccountModal cosmetic class 噪音（mb-1.5+mb-0 等冲突,Tailwind 后者胜不影响功能）

> **里程碑（2026-06-13）：「完整 + 干净」达成。**
> - 274/275 页原生组件迁移；**全站 QUENCH CSS 变量 = 0**；**所有 QUENCH CSS 文件删除**(tokens.css + ops-quench.css + 7 个死 CSS)；onboarding.css 中性化为 shadcn 语义 token
> - 19 原生 ui primitive；**交互正确性守卫 17 tests**(防 Button div 类 bug 复发)；全局自研类残留 = 0(pvd-/toc-/dq- 等为组件私有 scoped,视觉 Zinc 正常 Vue 实践)
> - 每波 typecheck 0 / build 绿 / 对抗审查 + 全局关卡定点修
> - **唯一 backlog**：SettingsView 9784 行 legacy 回退页(opus 反复改坏标签;视觉已中性化 Zinc;新版 SettingsRegistryView 已迁移完整)

> **里程碑2（2026-06-13）：「逐页核对,仅保留原生 shadcn-vue」达成。**
> - **190 页逐页核对**(5 大波),手写 `<button>`/`<input radio>`/`<input checkbox>`/`<select>` 全部收编进原生组件——**残留 = 0**
> - 补建 **RadioGroup** primitive(21 ui 组件);Input 补 `select()` expose
> - 修一批 typecheck 抓不到的结构/契约 bug:Button 渲染成 div(@vue-ignore 陷阱)、Button 嵌套 button(HTML 非法 ×3)、伪造 `{target:{value}} as Event` 桥接(×6)、删 ops-quench.css 连带的 od-* 动态 class 失定义(视觉回归)、换组件后 document 监听泄漏
> - **合理例外**(非 shadcn 对应,保留原生):GroupsView multiple-select(无 shadcn multi-select)、隐藏 `<input type=file>` 触发器、SettingsView legacy
> - 全程 typecheck 0 / build 绿 / 交互守卫 17 tests / 每波对抗审查 + git diff 核标签
- 遗留收尾：DataTableV2 的 `:global(.q-money)` 等 q- 工具类（有 tokens.css 定义,功能在,留最终统一清）
- 每波后主循环跑全局 `vue-tsc --noEmit` + `vite build` + grep 残留三关，fail/warn 页定点修；全绿才入下一波

### 3. 收尾清理 ✅（2026-06-14）
- [x] 删 `style.css` 自研全局类：708→444 行（-37%），死类全删，仅保留 SettingsView/sidebar/toast 消费的存活类
- [x] 删 `tailwind.config.js` 的 `metal-*`/`glass`/`glow`/`azure` 全部 QUENCH 遗产
- [x] `design/tokens.css` 已删除；`styles/onboarding.css` 已中性化（里程碑1）
- [x] `main.ts` 亮色默认 + `useTheme` composable + AppHeader 日月切换按钮
- [x] 30 处 `bg-*-900/40` 暗色假设模式 → `bg-*-500/10 + dark:text-*`（明暗通吃）
- [x] `dashboard-quench/` 孤儿目录删除；App.vue 最后一个原生 `<button>` → `<Button>`

## 验证

```bash
cd frontend
node_modules/.bin/vue-tsc --noEmit   # 类型
node_modules/.bin/vite build         # 构建 + tailwind/CSS
pnpm dev                             # 本地预览
```
