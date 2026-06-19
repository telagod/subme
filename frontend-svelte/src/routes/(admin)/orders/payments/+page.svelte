<script lang="ts">
	/**
	 * Admin · Orders · Payment Plans 落地（M12）
	 *
	 * 重复性报告 —— **本路由与 M22 `/admin/monetization/plans` 表面 1:1 重叠**：
	 *   - Vue tree AdminPaymentPlansView.vue (frontend/src/views/admin/orders/) 与
	 *     PlansCatalogView.vue 都消费同一份 `/api/admin/payment/plans` CRUD，
	 *     共用同款 PlanEditDialog（features 序列化为换行字符串、group_id-tied 等）。
	 *   - Svelte rewrite 在 M22 已落地完整目录：
	 *       routes/(admin)/monetization/plans/+page.svelte
	 *       lib/features/monetization/plans/{PlanCard,PlanEditDialog}.svelte
	 *       lib/api/admin/plans.ts（list/create/update/delete/duplicate/archive/restore/sort）
	 *   - 后端没有 "payment-only" 与 "subscription" 的 schema 分歧 —— 只有
	 *     /admin/payment/plans 一张表面，按 group_id 区分用途。
	 *
	 * 决策：
	 *   - 不重写第二份 plans CRUD UI（防止双源漂移、check-chunks bloat、维护负担）。
	 *   - 本页只渲染 redirect notice，把用户引导到 M22 的 canonical 视图。
	 *   - 同时也把 nav 链接（/admin/monetization/plans）暴露给运营侧，
	 *     避免 admin nav 出现"两个 plans"入口的混乱。
	 *   - Provider 配置走 settings registry（/admin/settings），本页不下沉到 provider CRUD。
	 *
	 * Task 描述明确允许 SKIP DUPLICATE 并 REPORT —— REPORT 已经发回 orchestrator
	 * 的 status JSON，此处落地最小可见落地物，避免 404 / 路由空白。
	 *
	 * 红线（CLAUDE.md billing）：
	 *   - 本文件不引用 billing 核心 / 价格查询；只是 link/redirect 到 M22。
	 */
	import { _ } from 'svelte-i18n';
	import { ExternalLink, Info, Settings } from '@lucide/svelte';

	const PLANS_CANONICAL = '/admin/monetization/plans';
	const SETTINGS_CANONICAL = '/admin/settings';
</script>

<svelte:head>
	<title>
		{$_('admin.orderPayments.title', { default: 'Payment Plans' })} · sub2api admin
	</title>
</svelte:head>

<section
	class="flex flex-col gap-4 px-7 pb-16 pt-6 text-foreground"
	data-testid="admin-orderpayments-page"
>
	<!-- Header -->
	<div class="min-w-0">
		<h1 class="m-0 text-xl font-bold tracking-tight text-foreground">
			{$_('admin.orderPayments.title', { default: 'Payment Plans' })}
		</h1>
		<p class="m-0 text-xs text-muted-foreground">
			{$_('admin.orderPayments.desc', {
				default: 'This surface has consolidated with the Plan Catalog'
			})}
		</p>
	</div>

	<!-- Consolidation notice -->
	<div
		class="flex items-start gap-3 rounded-xl border border-border bg-card p-5 shadow-sm"
		data-testid="admin-orderpayments-notice"
	>
		<div
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sky-500"
		>
			<Info class="h-5 w-5" />
		</div>
		<div class="flex min-w-0 flex-col gap-2">
			<h2 class="m-0 text-base font-semibold text-foreground">
				{$_('admin.orderPayments.noticeTitle', {
					default: 'Plan editing has moved'
				})}
			</h2>
			<p class="m-0 text-sm text-muted-foreground">
				{$_('admin.orderPayments.noticeBody', {
					default:
						'Payment plans and subscription plans share the same backend table (/admin/payment/plans). To avoid drift, all plan CRUD is now managed in one place — the Plan Catalog under Monetization.'
				})}
			</p>
			<div class="mt-1 flex flex-wrap items-center gap-2">
				<a
					href={PLANS_CANONICAL}
					class="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
					data-testid="admin-orderpayments-goto-plans"
				>
					{$_('admin.orderPayments.gotoPlans', { default: 'Open Plan Catalog' })}
					<ExternalLink class="h-3.5 w-3.5" />
				</a>
				<a
					href={SETTINGS_CANONICAL}
					class="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-muted"
					data-testid="admin-orderpayments-goto-settings"
				>
					<Settings class="h-3.5 w-3.5" />
					{$_('admin.orderPayments.gotoSettings', {
						default: 'Payment provider settings'
					})}
				</a>
			</div>
		</div>
	</div>

	<!-- Documentation block -->
	<div
		class="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground"
		data-testid="admin-orderpayments-doc"
	>
		<h3 class="mb-2 m-0 text-[12px] font-semibold uppercase tracking-wider text-foreground">
			{$_('admin.orderPayments.docTitle', { default: 'What moved where' })}
		</h3>
		<ul class="m-0 list-disc space-y-1.5 pl-5">
			<li>
				{$_('admin.orderPayments.docPlans', {
					default:
						'Subscription / top-up plan CRUD (create, edit, archive, duplicate, sort) → Monetization · Plan Catalog'
				})}
			</li>
			<li>
				{$_('admin.orderPayments.docProviders', {
					default:
						'Payment provider instances and global payment config → Platform · Settings (payment section)'
				})}
			</li>
			<li>
				{$_('admin.orderPayments.docDashboard', {
					default: 'Revenue / refund / churn KPIs → Orders · Payment Dashboard'
				})}
			</li>
		</ul>
	</div>
</section>
