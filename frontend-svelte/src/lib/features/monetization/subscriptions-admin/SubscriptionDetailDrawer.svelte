<script lang="ts">
	/**
	 * SubscriptionDetailDrawer · 管理员订阅详情面板（M22）
	 *
	 * 设计：
	 *   - StandardDrawer 右侧贴边面板。
	 *   - $effect 监听 open + subscription.id 变化 → 拉 detail。
	 *   - actions（仅后端真实存在的端点）：
	 *       Revoke → 内联确认 → revokeSub(id)        DELETE /admin/subscriptions/:id
	 *       Extend → 内联 date input → extendSub(id, days)  POST /:id/extend { days }
	 *   - 后端无 /:id/refund、/:id/audit-log、/:id/cancel —— 不渲染退款按钮 / 审计日志区。
	 *   - 红线：subscription surface only —— 严禁引用计费核心、渠道定价、价格查询 service。
	 */
	import { _ } from 'svelte-i18n';
	import { X, AlertTriangle, RefreshCw, Calendar, Trash2 } from '@lucide/svelte';
	import {
		getAdminSub,
		revokeSub,
		extendSub,
		type AdminSubscription
	} from '$lib/api/admin/subscriptions';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import StandardDrawer from '$lib/ui/StandardDrawer.svelte';

	type Props = {
		open: boolean;
		subscription: AdminSubscription | null;
		onChanged?: () => void;
	};

	let {
		open = $bindable(false),
		subscription = null,
		onChanged
	}: Props = $props();

	let detail = $state<AdminSubscription | null>(null);
	let loading = $state(false);
	let loadError = $state<string | null>(null);

	// 撤销确认（DELETE /:id；后端无 cancel 端点，故无理由 body）
	let revokeConfirmOpen = $state(false);
	let revoking = $state(false);

	// 延期（POST /:id/extend body { days }）—— UI 收一个新到期日期，转换为相对天数
	let extendOpen = $state(false);
	let extendDate = $state('');
	let extending = $state(false);

	let lastLoadedId = $state<string | number | null>(null);

	$effect(() => {
		if (open && subscription && subscription.id !== lastLoadedId) {
			lastLoadedId = subscription.id;
			void loadDetail(subscription.id);
		}
		if (!open) {
			lastLoadedId = null;
			detail = null;
			revokeConfirmOpen = false;
			extendOpen = false;
			extendDate = '';
			loadError = null;
		}
	});

	async function loadDetail(id: number | string) {
		loading = true;
		loadError = null;
		try {
			const d = await getAdminSub(id);
			detail = d;
			extendDate = d.expires_at?.slice(0, 10) ?? '';
		} catch (err) {
			const e = err as Error;
			loadError = e?.message ?? 'load failed';
		} finally {
			loading = false;
		}
	}

	function close() {
		open = false;
	}

	function openRevokeConfirm() {
		revokeConfirmOpen = true;
	}

	function closeRevokeConfirm() {
		if (revoking) return;
		revokeConfirmOpen = false;
	}

	async function confirmRevoke() {
		if (!detail || revoking) return;
		revoking = true;
		try {
			await revokeSub(detail.id);
			showSuccess(
				$_('admin.subscriptions.cancelSuccess', {
					default: 'Subscription cancelled'
				})
			);
			revokeConfirmOpen = false;
			onChanged?.();
			// 刷新详情
			await loadDetail(detail.id);
		} catch (err) {
			const e = err as Error;
			showError(
				$_('admin.subscriptions.cancelError', {
					default: 'Cancel failed: {error}',
					values: { error: e?.message ?? 'unknown' }
				})
			);
		} finally {
			revoking = false;
		}
	}

	// 由「新到期日」相对当前到期日推算出天数差（后端 extend 契约为相对天数）。
	function daysFromExpiry(currentExpires: string | undefined, targetDate: string): number {
		const MS_PER_DAY = 86_400_000;
		const base = currentExpires ? new Date(currentExpires).getTime() : Date.now();
		const target = new Date(`${targetDate}T23:59:59Z`).getTime();
		if (!Number.isFinite(base) || !Number.isFinite(target)) return 0;
		return Math.ceil((target - base) / MS_PER_DAY);
	}

	async function confirmExtend() {
		if (!detail || extending || !extendDate) return;
		const days = daysFromExpiry(detail.expires_at, extendDate);
		if (days <= 0) {
			showError(
				$_('admin.subscriptions.extendError', {
					default: 'Extend failed: {error}',
					values: {
						error: $_('admin.subscriptions.newExpiresAt', { default: 'New expiry date' })
					}
				})
			);
			return;
		}
		extending = true;
		try {
			await extendSub(detail.id, days);
			showSuccess(
				$_('admin.subscriptions.extendSuccess', { default: 'Subscription extended' })
			);
			extendOpen = false;
			onChanged?.();
			await loadDetail(detail.id);
		} catch (err) {
			const e = err as Error;
			showError(
				$_('admin.subscriptions.extendError', {
					default: 'Extend failed: {error}',
					values: { error: e?.message ?? 'unknown' }
				})
			);
		} finally {
			extending = false;
		}
	}

	function fmtDate(s?: string | null): string {
		if (!s) return '—';
		try {
			return new Date(s).toLocaleString();
		} catch {
			return s;
		}
	}

	function fmtMoney(v?: number | null, currency = 'USD'): string {
		if (v == null || !Number.isFinite(v)) return '—';
		return `${currency === 'USD' ? '$' : ''}${v.toFixed(2)}`;
	}

	function maskEmail(email?: string): string {
		if (!email) return '—';
		const at = email.indexOf('@');
		if (at <= 1) return email;
		const local = email.slice(0, at);
		const masked = local.length <= 2 ? local : local[0] + '***' + local[local.length - 1];
		return masked + email.slice(at);
	}

	const statusBadgeClass = $derived.by<string>(() => {
		const s = detail?.status ?? subscription?.status ?? '';
		switch (s) {
			case 'active':
				return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
			case 'cancelled':
				return 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400';
			case 'expired':
				return 'border-zinc-400/40 bg-zinc-400/10 text-muted-foreground';
			case 'revoked':
				return 'border-destructive/40 bg-destructive/10 text-destructive';
			default:
				return 'border-border bg-muted text-muted-foreground';
		}
	});
</script>

<StandardDrawer
	bind:open
	width="md"
	showHeader={false}
	title={$_('admin.subscriptions.detailTitle', { default: 'Subscription detail' })}
	data-testid="sub-detail-drawer"
	class="gap-0 p-0"
>
	<!-- Head -->
	<div class="flex items-center justify-between border-b border-border bg-muted px-4 py-3">
		<div class="min-w-0">
			<h2 class="truncate text-sm font-semibold tracking-tight text-foreground">
				{$_('admin.subscriptions.detailTitle', { default: 'Subscription detail' })}
			</h2>
			<div
				class="truncate font-mono text-[11px] text-muted-foreground"
				title={String(subscription?.id ?? '')}
			>
				#{subscription?.id ?? '—'}
			</div>
		</div>
		<Button
			variant="ghost"
			size="icon"
			class="h-8 w-8 text-muted-foreground hover:bg-card hover:text-foreground"
			aria-label={$_('common.close', { default: 'Close' })}
			data-testid="sub-detail-close"
			onclick={close}
		>
			<X class="h-4 w-4" />
		</Button>
	</div>

	<!-- Body -->
	<div class="flex-1 overflow-y-auto px-4 py-4">
		{#if loading}
			<div class="space-y-3" data-testid="sub-detail-loading">
				<div class="h-5 w-1/3 animate-pulse rounded bg-muted"></div>
						<div class="h-24 w-full animate-pulse rounded bg-muted"></div>
						<div class="h-32 w-full animate-pulse rounded bg-muted"></div>
					</div>
				{:else if loadError}
					<div
						class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
						data-testid="sub-detail-error"
					>
						<div class="mb-2 flex items-center gap-2 font-medium">
							<AlertTriangle class="h-4 w-4" />
							<span>{loadError}</span>
						</div>
						{#if subscription}
							<Button
								variant="outline"
								size="sm"
								class="h-7 border-destructive/40 px-2 hover:bg-destructive/20"
								onclick={() => loadDetail(subscription!.id)}
							>
								{$_('common.confirm', { default: 'Retry' })}
							</Button>
						{/if}
					</div>
				{:else if detail}
					<!-- Status pill -->
					<div class="mb-4 flex items-center gap-2">
						<span
							class="rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider {statusBadgeClass}"
							data-testid="sub-detail-status"
						>
							{detail.status}
						</span>
						{#if detail.platform}
							<span
								class="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
							>
								{detail.platform}
							</span>
						{/if}
					</div>

					<!-- User -->
					<section class="mb-4 rounded-md border border-border bg-muted/40 p-3">
						<h3
							class="m-0 mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
						>
							{$_('admin.subscriptions.userBlock', { default: 'User' })}
						</h3>
						<dl class="grid grid-cols-[80px,1fr] gap-y-1 text-xs">
							<dt class="text-muted-foreground">
								{$_('admin.subscriptions.userId', { default: 'User ID' })}
							</dt>
							<dd class="font-mono text-foreground" data-testid="sub-detail-user-id">
								{detail.user_id}
							</dd>
							<dt class="text-muted-foreground">
								{$_('admin.subscriptions.userEmail', { default: 'Email' })}
							</dt>
							<dd class="font-mono text-foreground" data-testid="sub-detail-user-email">
								{maskEmail(detail.user_email)}
							</dd>
						</dl>
					</section>

					<!-- Plan -->
					<section class="mb-4 rounded-md border border-border bg-muted/40 p-3">
						<h3
							class="m-0 mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
						>
							{$_('admin.subscriptions.planBlock', { default: 'Plan' })}
						</h3>
						<dl class="grid grid-cols-[80px,1fr] gap-y-1 text-xs">
							<dt class="text-muted-foreground">
								{$_('admin.subscriptions.planName', { default: 'Plan' })}
							</dt>
							<dd class="font-medium text-foreground" data-testid="sub-detail-plan-name">
								{detail.plan_name ?? '—'}
							</dd>
							<dt class="text-muted-foreground">
								{$_('admin.subscriptions.groupName', { default: 'Group' })}
							</dt>
							<dd class="text-foreground">{detail.group_name ?? '—'}</dd>
							<dt class="text-muted-foreground">
								{$_('admin.subscriptions.pricePaid', { default: 'Price paid' })}
							</dt>
							<dd class="font-mono tabular-nums text-foreground">
								{fmtMoney(detail.price_paid, detail.currency)}
							</dd>
							<dt class="text-muted-foreground">
								{$_('admin.subscriptions.mtdCost', { default: 'MTD cost' })}
							</dt>
							<dd class="font-mono tabular-nums text-foreground">
								{fmtMoney(detail.mtd_cost, detail.currency)}
							</dd>
						</dl>
					</section>

					<!-- Timeline -->
					<section class="mb-4 rounded-md border border-border bg-muted/40 p-3">
						<h3
							class="m-0 mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
						>
							{$_('admin.subscriptions.timelineBlock', { default: 'Timeline' })}
						</h3>
						<dl class="grid grid-cols-[80px,1fr] gap-y-1 text-xs">
							<dt class="text-muted-foreground">
								{$_('admin.subscriptions.startedAt', { default: 'Started' })}
							</dt>
							<dd class="font-mono text-foreground">{fmtDate(detail.started_at)}</dd>
							<dt class="text-muted-foreground">
								{$_('admin.subscriptions.expiresAt', { default: 'Expires' })}
							</dt>
							<dd class="font-mono text-foreground">{fmtDate(detail.expires_at)}</dd>
							{#if detail.cancelled_at}
								<dt class="text-muted-foreground">
									{$_('admin.subscriptions.cancelledAt', { default: 'Cancelled' })}
								</dt>
								<dd class="font-mono text-foreground">{fmtDate(detail.cancelled_at)}</dd>
							{/if}
						</dl>
					</section>

				{/if}
			</div>

			<!-- Footer actions -->
			{#if detail}
				<div class="flex flex-col gap-2 border-t border-border bg-card px-4 py-3">
					{#if extendOpen}
						<div
							class="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-2"
							data-testid="sub-detail-extend-panel"
						>
							<label
								for="sub-detail-extend-date"
								class="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"
							>
								{$_('admin.subscriptions.newExpiresAt', { default: 'New expiry date' })}
							</label>
							<Input
								id="sub-detail-extend-date"
								type="date"
								class="h-8 px-2 text-xs"
								bind:value={extendDate}
								data-testid="sub-detail-extend-date"
							/>
							<div class="flex justify-end gap-2">
								<Button
									variant="outline"
									size="sm"
									class="h-7 px-2"
									onclick={() => (extendOpen = false)}
									disabled={extending}
								>
									{$_('common.cancel', { default: 'Cancel' })}
								</Button>
								<Button
									size="sm"
									class="h-7 px-2"
									onclick={confirmExtend}
									disabled={extending || !extendDate}
									data-testid="sub-detail-extend-confirm"
								>
									{extending
										? $_('common.submitting', { default: 'Submitting…' })
										: $_('admin.subscriptions.extendConfirm', { default: 'Extend' })}
								</Button>
							</div>
						</div>
					{/if}

					{#if revokeConfirmOpen}
						<div
							class="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2"
							data-testid="sub-detail-cancel-panel"
						>
							<p class="m-0 flex items-center gap-1.5 text-xs text-destructive">
								<AlertTriangle class="h-3.5 w-3.5" />
								{$_('admin.subscriptions.forceCancel', { default: 'Force cancel' })}
								<span class="font-mono">#{detail.id}</span>?
							</p>
							<div class="flex justify-end gap-2">
								<Button
									variant="outline"
									size="sm"
									class="h-7 px-2"
									onclick={closeRevokeConfirm}
									disabled={revoking}
								>
									{$_('common.cancel', { default: 'Cancel' })}
								</Button>
								<Button
									variant="destructive"
									size="sm"
									class="h-7 px-2"
									onclick={confirmRevoke}
									disabled={revoking}
									data-testid="sub-detail-cancel-confirm"
								>
									{revoking
										? $_('common.submitting', { default: 'Submitting…' })
										: $_('admin.subscriptions.cancelConfirm', { default: 'Force cancel' })}
								</Button>
							</div>
						</div>
					{/if}

					<div class="flex flex-wrap items-center justify-end gap-2">
						<Button
							variant="outline"
							size="sm"
							class="px-2.5"
							onclick={() => loadDetail(detail!.id)}
							data-testid="sub-detail-refresh"
						>
							<RefreshCw class="h-3.5 w-3.5" />
							{$_('common.refresh', { default: 'Refresh' })}
						</Button>
						<Button
							variant="outline"
							size="sm"
							class="px-2.5"
							onclick={() => (extendOpen = !extendOpen)}
							data-testid="sub-detail-extend-btn"
						>
							<Calendar class="h-3.5 w-3.5" />
							{$_('admin.subscriptions.extendBtn', { default: 'Extend' })}
						</Button>
						<Button
							variant="destructive"
							size="sm"
							class="px-2.5"
							onclick={openRevokeConfirm}
							data-testid="sub-detail-cancel-btn"
						>
							<Trash2 class="h-3.5 w-3.5" />
							{$_('admin.subscriptions.forceCancel', { default: 'Force cancel' })}
						</Button>
					</div>
				</div>
			{/if}
</StandardDrawer>
