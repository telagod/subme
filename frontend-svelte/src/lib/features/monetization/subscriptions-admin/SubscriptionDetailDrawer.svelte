<script lang="ts">
	/**
	 * SubscriptionDetailDrawer · 管理员订阅详情面板（M22）
	 *
	 * 设计：
	 *   - bits-ui Sheet（Dialog.Root + 右侧贴边 Content）。
	 *   - $effect 监听 open + subscription.id 变化 → 拉 detail + audit log。
	 *   - actions：
	 *       Force Cancel → 内联确认 → forceCancelSub(id, reason)
	 *       Refund       → 触发 onRequestRefund 给父
	 *       Extend       → 内联 date input → extendSub(id, newExpiresAt)
	 *   - 红线：subscription surface only —— 严禁引用计费核心、渠道定价、价格查询 service。
	 */
	import { Dialog } from 'bits-ui';
	import { _ } from 'svelte-i18n';
	import { X, AlertTriangle, RefreshCw, Banknote, Calendar, Trash2 } from '@lucide/svelte';
	import {
		getAdminSub,
		getAuditLog,
		forceCancelSub,
		extendSub,
		type AdminSubscription,
		type AdminSubAuditEntry
	} from '$lib/api/admin/subscriptions';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';

	type Props = {
		open: boolean;
		subscription: AdminSubscription | null;
		onChanged?: () => void;
		onRequestRefund?: (sub: AdminSubscription) => void;
	};

	let {
		open = $bindable(false),
		subscription = null,
		onChanged,
		onRequestRefund
	}: Props = $props();

	let detail = $state<AdminSubscription | null>(null);
	let auditLog = $state<AdminSubAuditEntry[]>([]);
	let loading = $state(false);
	let loadError = $state<string | null>(null);

	// 强制取消确认
	let cancelConfirmOpen = $state(false);
	let cancelReason = $state('');
	let cancelling = $state(false);

	// 延期
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
			auditLog = [];
			cancelConfirmOpen = false;
			cancelReason = '';
			extendOpen = false;
			extendDate = '';
			loadError = null;
		}
	});

	async function loadDetail(id: number | string) {
		loading = true;
		loadError = null;
		try {
			const [d, log] = await Promise.all([
				getAdminSub(id),
				getAuditLog(id).catch(() => [])
			]);
			detail = d;
			auditLog = log;
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

	function openCancelConfirm() {
		cancelConfirmOpen = true;
		cancelReason = '';
	}

	function closeCancelConfirm() {
		if (cancelling) return;
		cancelConfirmOpen = false;
	}

	async function confirmForceCancel() {
		if (!detail || cancelling) return;
		const trimmed = cancelReason.trim();
		if (trimmed.length < 4) {
			showError(
				$_('admin.subscriptions.cancelReasonRequired', {
					default: 'Reason is required (≥ 4 characters)'
				})
			);
			return;
		}
		cancelling = true;
		try {
			await forceCancelSub(detail.id, trimmed);
			showSuccess(
				$_('admin.subscriptions.cancelSuccess', {
					default: 'Subscription cancelled'
				})
			);
			cancelConfirmOpen = false;
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
			cancelling = false;
		}
	}

	async function confirmExtend() {
		if (!detail || extending || !extendDate) return;
		extending = true;
		try {
			// 转换为 ISO 8601 (UTC)
			const newExpires = new Date(`${extendDate}T23:59:59Z`).toISOString();
			await extendSub(detail.id, newExpires);
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

	function handleRefund() {
		if (!detail) return;
		onRequestRefund?.(detail);
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

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
			data-testid="sub-detail-overlay"
		/>
		<Dialog.Content
			class="fixed right-0 top-0 z-50 flex h-full w-full max-w-[560px] flex-col border-l border-border bg-card shadow-2xl"
			data-testid="sub-detail-drawer"
		>
			<!-- Head -->
			<div class="flex items-center justify-between border-b border-border bg-muted px-4 py-3">
				<div class="min-w-0">
					<Dialog.Title class="truncate text-sm font-semibold tracking-tight text-foreground">
						{$_('admin.subscriptions.detailTitle', { default: 'Subscription detail' })}
					</Dialog.Title>
					<div
						class="truncate font-mono text-[11px] text-muted-foreground"
						title={String(subscription?.id ?? '')}
					>
						#{subscription?.id ?? '—'}
					</div>
				</div>
				<button
					type="button"
					class="rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"
					aria-label={$_('common.close', { default: 'Close' })}
					data-testid="sub-detail-close"
					onclick={close}
				>
					<X class="h-4 w-4" />
				</button>
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
							<button
								type="button"
								class="rounded border border-destructive/40 px-2 py-1 text-xs hover:bg-destructive/20"
								onclick={() => loadDetail(subscription!.id)}
							>
								{$_('common.confirm', { default: 'Retry' })}
							</button>
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

					<!-- Audit log -->
					<section class="mb-4 rounded-md border border-border bg-muted/40 p-3">
						<h3
							class="m-0 mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
						>
							{$_('admin.subscriptions.auditLog', { default: 'Audit log' })}
						</h3>
						{#if auditLog.length === 0}
							<p
								class="m-0 text-xs text-muted-foreground"
								data-testid="sub-detail-audit-empty"
							>
								{$_('admin.subscriptions.auditEmpty', { default: 'No audit entries yet.' })}
							</p>
						{:else}
							<ol class="m-0 flex flex-col gap-2 p-0 list-none" data-testid="sub-detail-audit-log">
								{#each auditLog as entry (entry.id)}
									<li
										class="rounded border border-border bg-card p-2 text-xs"
										data-testid="sub-detail-audit-entry"
									>
										<div class="flex items-center justify-between gap-2">
											<span class="font-mono font-semibold text-foreground">
												{entry.action}
											</span>
											<span class="font-mono text-[10.5px] text-muted-foreground">
												{fmtDate(entry.created_at)}
											</span>
										</div>
										{#if entry.actor}
											<div class="mt-0.5 text-[11px] text-muted-foreground">
												{$_('admin.subscriptions.auditActor', { default: 'By' })}: {entry.actor}
											</div>
										{/if}
										{#if entry.reason}
											<div class="mt-1 text-[11px] text-foreground">{entry.reason}</div>
										{/if}
									</li>
								{/each}
							</ol>
						{/if}
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
							<input
								id="sub-detail-extend-date"
								type="date"
								class="h-8 rounded-md border border-border bg-background px-2 text-xs"
								bind:value={extendDate}
								data-testid="sub-detail-extend-date"
							/>
							<div class="flex justify-end gap-2">
								<button
									type="button"
									class="inline-flex h-7 items-center rounded-md border border-border bg-background px-2 text-xs hover:bg-muted"
									onclick={() => (extendOpen = false)}
									disabled={extending}
								>
									{$_('common.cancel', { default: 'Cancel' })}
								</button>
								<button
									type="button"
									class="inline-flex h-7 items-center rounded-md bg-primary px-2 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
									onclick={confirmExtend}
									disabled={extending || !extendDate}
									data-testid="sub-detail-extend-confirm"
								>
									{extending
										? $_('common.submitting', { default: 'Submitting…' })
										: $_('admin.subscriptions.extendConfirm', { default: 'Extend' })}
								</button>
							</div>
						</div>
					{/if}

					{#if cancelConfirmOpen}
						<div
							class="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2"
							data-testid="sub-detail-cancel-panel"
						>
							<label
								for="sub-detail-cancel-reason"
								class="text-[10.5px] font-semibold uppercase tracking-wider text-destructive"
							>
								{$_('admin.subscriptions.cancelReason', { default: 'Cancel reason' })}
							</label>
							<textarea
								id="sub-detail-cancel-reason"
								rows="2"
								class="rounded-md border border-border bg-background px-2 py-1 text-xs"
								bind:value={cancelReason}
								data-testid="sub-detail-cancel-reason"
								placeholder={$_('admin.subscriptions.cancelReasonPlaceholder', {
									default: 'Required (≥ 4 chars)'
								})}
							></textarea>
							<div class="flex justify-end gap-2">
								<button
									type="button"
									class="inline-flex h-7 items-center rounded-md border border-border bg-background px-2 text-xs hover:bg-muted"
									onclick={closeCancelConfirm}
									disabled={cancelling}
								>
									{$_('common.cancel', { default: 'Cancel' })}
								</button>
								<button
									type="button"
									class="inline-flex h-7 items-center rounded-md bg-destructive px-2 text-xs text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
									onclick={confirmForceCancel}
									disabled={cancelling}
									data-testid="sub-detail-cancel-confirm"
								>
									{cancelling
										? $_('common.submitting', { default: 'Submitting…' })
										: $_('admin.subscriptions.cancelConfirm', { default: 'Force cancel' })}
								</button>
							</div>
						</div>
					{/if}

					<div class="flex flex-wrap items-center justify-end gap-2">
						<button
							type="button"
							class="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs hover:bg-muted"
							onclick={() => loadDetail(detail!.id)}
							data-testid="sub-detail-refresh"
						>
							<RefreshCw class="h-3.5 w-3.5" />
							{$_('common.refresh', { default: 'Refresh' })}
						</button>
						<button
							type="button"
							class="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs hover:bg-muted"
							onclick={() => (extendOpen = !extendOpen)}
							data-testid="sub-detail-extend-btn"
						>
							<Calendar class="h-3.5 w-3.5" />
							{$_('admin.subscriptions.extendBtn', { default: 'Extend' })}
						</button>
						<button
							type="button"
							class="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs hover:bg-muted"
							onclick={handleRefund}
							data-testid="sub-detail-refund-btn"
						>
							<Banknote class="h-3.5 w-3.5" />
							{$_('admin.subscriptions.refundBtn', { default: 'Refund' })}
						</button>
						<button
							type="button"
							class="inline-flex h-8 items-center gap-1 rounded-md bg-destructive px-2.5 text-xs text-destructive-foreground hover:bg-destructive/90"
							onclick={openCancelConfirm}
							data-testid="sub-detail-cancel-btn"
						>
							<Trash2 class="h-3.5 w-3.5" />
							{$_('admin.subscriptions.forceCancel', { default: 'Force cancel' })}
						</button>
					</div>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
