# RE-SHADCN 逐页迁移规约（agent 执行）

把一个 Vue3 页面从「QUENCH 冷钢 / 自研全局类」改造成「shadcn-vue 原生组件 + Zinc 语义 token」。
**只改视觉，绝不动逻辑。** 取代 `RESKIN_RULES.md`（已废）。

## 参考范式（动手前必读）
- 容器层：`src/components/layout/AuthLayout.vue`（自研 scoped CSS → 原生 Card + 语义 token，删全部 QUENCH 装饰）
- 内容层：`src/views/auth/LoginView.vue`（`lv-*` scoped 类 + 原生 input/button → 原生 Input/Label/Button/Separator，删整个 `<style scoped>`）

## 铁律（违反即失败）
1. **绝不改** `<script>` 任何内容、`v-if`/`v-for`/`v-model`/`@event`/`:bind` 表达式、props、i18n `t('...')` key、变量名、组件嵌套语义。
2. 不新增/删除带逻辑的 DOM；纯装饰 div（光晕/网格/金属层）可删。
3. 改完该文件：无残留旧类、`vue-tsc --noEmit` 无报错、保持 light + dark 两套都正确。

## 组件替换映射
| 旧 | 新（from `@/components/ui/*`） |
|----|----|
| `<input>` / `.input` 全局类 | `<Input v-model>` |
| `<textarea>` | `<Textarea v-model>` |
| `<button class="lv-submit/.btn*">` | `<Button variant size>` |
| `<label>` / `.input-label` | `<Label>` |
| `.card*` / scoped 卡片容器 | `<Card>` + `<CardHeader/CardTitle/CardContent/CardFooter>` |
| `.modal*` / 自研弹窗 | `<Dialog>` 体系（侧拉用 `<Sheet>`） |
| 自研下拉 / `<select>` | `<Select>` 体系 |
| 选项卡 | `<Tabs>` |
| `.badge*` | `<Badge variant>` |
| 分隔线 `.divider`/`<hr>` | `<Separator>` |
| 开关 / 复选 | `<Switch>` / `<Checkbox>` |
| tooltip / 气泡 / 右键菜单 | `<Tooltip>` / `<Popover>` / `<DropdownMenu>` |
| `.table` 全局类 | `<Table>` 体系 |

## 颜色 → 语义 token
- **任何 QUENCH 变量**（`var(--bg-*/--ink-*/--line-*/--azure/--metal*/--glow*/--q-*)`）→ 删，改 Tailwind 语义类。
- bg：页面 `bg-background`、卡片 `bg-card`、浮层 `bg-popover`、弱面 `bg-muted`/`bg-accent`
- text：主 `text-foreground`、弱 `text-muted-foreground`
- border：`border-border`，输入 `border-input`；focus：`focus-visible:ring-ring`
- 状态色克制：`text-destructive`/`bg-destructive/10` 等，不要大面积纯彩块
- inline 直写色（`gray-*`/`dark-*`/彩虹色）→ 语义 token

## 图标内嵌输入（参照 LoginView）
外层 `relative`；Icon `pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground`；Input 加 `pl-10`（右侧另有按钮则 `pr-10` 或 `px-10`）；错误态 `:class="{ 'border-destructive focus-visible:ring-destructive': errors.x }"`。

## 收口自检
```bash
grep -nE 'lv-|--(bg-|ink-|line-|azure|metal|glow|q-)|class="(btn|card|input|modal|badge|table)' <file>   # 应为空
node_modules/.bin/vue-tsc --noEmit && node_modules/.bin/vite build
```
