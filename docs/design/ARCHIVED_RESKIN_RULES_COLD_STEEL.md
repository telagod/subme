> **已弃用 2026-06-12**：被 frontend/RESHADCN_RULES.md 取代。保留作为方向溯源。

# COLD STEEL Re-skin Rules（agent 执行规约）

你正在把一个 Vue3 页面从「teal 玻璃拟态」改造成「冷钢黑白金属」。
**只改视觉，绝不动逻辑。** 参考已完成标杆：`src/views/admin/DashboardView.vue`、`src/components/layout/AuthLayout.vue`。

## 颜色替换表（inline tailwind class → 语义 token）

| 旧（teal/直写色） | 新（冷钢语义） |
|---|---|
| `bg-white dark:bg-dark-800` / `dark:bg-dark-900` | `bg-card` |
| `bg-gray-50 dark:bg-dark-900` / `bg-gray-100 dark:bg-dark-800` | `bg-muted` 或 `bg-accent` |
| `text-gray-900 dark:text-white` | `text-foreground` |
| `text-gray-700 dark:text-gray-300` | `text-foreground/85` |
| `text-gray-500 dark:text-gray-400` / `dark:text-dark-400` | `text-muted-foreground` |
| `border-gray-200 dark:border-dark-700` / `dark:border-dark-600` | `border-border` |
| `text-primary-*` / `bg-primary-*`（teal 强调） | 保留（primary 已是银灰 token），或改 `text-primary-200`/`bg-primary-300/10` |
| `focus:ring-primary-500` | `focus:ring-ring` |

## 彩虹强调色 → 冷钢钢牌（最重要）

页面里**成组的彩色 icon 容器**（`bg-blue-100 dark:bg-blue-900/30`、purple/green/amber/indigo/violet/rose/emerald 等）= 冷钢大忌，必须统一：
- icon 容器 → `bg-metal-raised border border-border shadow-metal-edge`（gunmetal 钢牌）
- icon 本身颜色 → `text-primary-200`（银白）
- 参考 DashboardView 的 `.kpi-icon`

## 语义状态色（克制保留）

success/error/warning/info 用于**状态指示**时保留语义，但低饱和：
- 文字用 `-400`（如 `text-emerald-400`/`text-red-400`/`text-amber-400`）
- 背景用 `/10` 透明（如 `bg-emerald-500/10`），边框 `/30`
- 不要大面积纯彩色块

## 玻璃 → 金属

- `backdrop-blur-*` + `bg-white/70 dark:bg-dark-800/70` → 删 blur，用 `bg-card` 或 `bg-metal-surface`
- `shadow-glow` / `shadow-glass` / 彩色 shadow（`shadow-primary-500/25` 等） → `shadow-metal` / `shadow-metal-edge` / 删除

## 圆角收紧（硬朗）

`rounded-xl`→`rounded-md`；`rounded-2xl`→`rounded-lg`；`rounded-3xl`→`rounded-xl`。pill 徽章 `rounded-full` 可保留。

## 渐变

`bg-gradient-to-* from-primary-* to-primary-*`（teal 渐变）→ 主按钮用 `bg-metal-silver`；其余用纯 `bg-metal-raised` 或 `bg-card`。

## 铁律（违反即失败）

1. **只改 `<template>` 的 class 属性值 与 `<style scoped>` 的颜色/圆角/阴影**。
2. **绝不改**：`<script>` 任何内容、`v-if`/`v-for`/`v-model`/`@event`/`:bind` 表达式、组件标签与嵌套结构、props、i18n `t('...')` key、变量名。
3. **不新增/删除 DOM 元素**（纯装饰性彩色光晕 div 可删）。
4. **不碰全局文件**：`style.css` / `tailwind.config.js` / `main.ts` / `router/` / `App.vue` / `components/layout/AppLayout|AppHeader|AppSidebar.vue`（已由主理人处理）。
5. **已用全局类的元素不用动**：`.card` / `.btn*` / `.input` / `.badge*` / `.stat-card` / `.tab*` / `.modal*` / `.dialog*` / `.table` / `.sidebar*` 已全局金属化，保留类名即可，**只改 inline 直写彩色/玻璃/圆角的元素**。
6. 保持 Vue 模板语法有效（标签配对、引号闭合）。改完该文件必须仍能编译。
7. 克制：宁可少改正确，不可过度乱改。拿不准的元素保持原样。
