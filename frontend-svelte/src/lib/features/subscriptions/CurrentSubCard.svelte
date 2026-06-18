<script lang="ts">
	/**
	 * CurrentSubCard · 当前订阅摘要卡（M6）
	 *
	 * 设计：
	 *   - 接受一个 UserSubscription（必非空 —— 父组件做 null 兜底）。
	 *   - 渲染：plan name + status badge + renewsAt + Cancel / Upgrade 按钮。
	 *   - status 'cancelled' 隐藏 Cancel 按钮；'expired' 同理。
	 *   - 不挂任何对话框 —— Cancel 仅 emit onCancelClick，dialog 由父页持有。
	 *   - NO QUENCH 皮肤 —— Zinc neutral only。
	 */
	import { _ } from 'svelte-i18n';
	import { CreditCard, AlertTriangle } from '@lucide/svelte';
	import type { UserSubscription, SubscriptionStatus } from '$lib/api/user/subscriptions';

	type Props = {
		subscription: UserSubscription;
		onCancelClick?: (sub: UserSubscription) => void;
		onUpgradeClick?: (sub: UserSubscription) => void;
	};

	let { subscription, onCancelClick, onUpgradeClick }: Props = $props();

	function fmtDate(s: string | null): string {
		if (!s) return '—';
		try {
			return new Date(s).toLocaleDateString();
		} catch {
			return s;
		}
	}

	function statusBadgeClass(s: SubscriptionStatus): string {
		switch (s) {
			case 'active':
				return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
			case 'trialing':
				return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300';
			case 'pending':
				return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200';
			case 'cancelled':
			case 'canceled':
				return 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
			case 'expired':
				return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
			default:
				return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
		}
	}

	function statusLabel(s: SubscriptionStatus): string {
		return $_(`user.subscriptions.status.${s}`, { default: s });
	}

	// expired / cancelled 不展示 Cancel；其它 status 允许取消。
	const canCancel = $derived(
		subscription.status !== 'cancelled' && subscription.status !== 'expired'
	);

	const expiringSoon = $derived.by(() => {
		if (!subscription.expiresAt) return false;
		try {
			const ms = new Date(subscription.expiresAt).getTime() - Date.now();
			const days = ms / 86400000;
			return days >= 0 && days <= 3;
		} catch {
			return false;
		}
	});
</script>

<article
	class="rounded-lg border border-border bg-card p-5 shadow-sm"
	data-testid="current-sub-card"
	data-sub-id={subscription.id}
>
	<div class="flex items-start justify-between gap-4">
		<div class="flex items-start gap-3">
			<div
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
			>
				<CreditCard class="h-5 w-5" />
			</div>
			<div class="space-y-1">
				<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{$_('user.subscriptions.currentLabel', { default: 'Current subscription' })}
				</p>
				<h2 class="text-lg font-semibold text-foreground" data-testid="current-sub-name">
					{subscription.planName || subscription.platform}
				</h2>
			</div>
		</div>
		<span
			class="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium {statusBadgeClass(subscription.status)}"
			data-testid="current-sub-status"
		>
			{statusLabel(subscription.status)}
		</span>
	</div>

	<dl class="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
		<div>
			<dt class="text-xs text-muted-foreground">
				{$_('user.subscriptions.startedAt', { default: 'Started' })}
			</dt>
			<dd class="mt-0.5 text-foreground" data-testid="current-sub-started">
				{fmtDate(subscription.startedAt)}
			</dd>
		</div>
		<div>
			<dt class="text-xs text-muted-foreground">
				{$_('user.subscriptions.renewsAt', { default: 'Renews at' })}
			</dt>
			<dd class="mt-0.5 text-foreground" data-testid="current-sub-renews">
				{fmtDate(subscription.expiresAt)}
			</dd>
		</div>
	</dl>

	{#if expiringSoon}
		<div
			class="mt-4 flex items-start gap-2 rounded-md border border-amber-300/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-200"
			data-testid="current-sub-expiring"
		>
			<AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
			<span>
				{$_('user.subscriptions.expiringSoon', {
					default: 'This subscription is about to expire. Renew to keep access.'
				})}
			</span>
		</div>
	{/if}

	<div class="mt-5 flex flex-wrap items-center justify-end gap-2">
		{#if canCancel}
			<button
				type="button"
				data-testid="current-sub-cancel-btn"
				onclick={() => onCancelClick?.(subscription)}
				class="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium text-destructive hover:bg-destructive/10"
			>
				{$_('user.subscriptions.cancel', { default: 'Cancel' })}
			</button>
		{/if}
		<button
			type="button"
			data-testid="current-sub-upgrade-btn"
			onclick={() => onUpgradeClick?.(subscription)}
			class="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
		>
			{$_('user.subscriptions.upgrade', { default: 'Upgrade' })}
		</button>
	</div>
</article>
