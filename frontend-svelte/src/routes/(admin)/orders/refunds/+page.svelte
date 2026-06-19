<script lang="ts">
	/**
	 * Admin · Orders · Refunds queue（admin/orders/refunds）
	 *
	 * 设计：
	 *   - Queue rows: id / order / user / amount / reason / requested_at / status / actions
	 *   - Status filter Select 用 '__all__' 哨兵（pending / approved / rejected /
	 *     completed / failed）。
	 *   - 行数 ≥ VIRTUAL_THRESHOLD（50） → VirtualTable lazy island，否则平铺。
	 *   - Approve 路径：从行携带 plumbing —— 把 queue row adapt 成 RefundDialog
	 *     需要的 AdminSubscription shape，调 M11 RefundDialog 复用退款表单 UI。
	 *     RefundDialog 走 subscriptions surface 的 refundSub 端点；这里仅作为
	 *     表单壳子复用，避免 UI 重写。审批同时落库的 reviewer note 由 reason
	 *     字段承载。Approval succeeds → onRefunded → 触发 approveRefund(id)，
	 *     在 queue 上将该项标记为 approved，再 reload。
	 *   - Reject 路径：内置 ConfirmDialog（bits-ui），requires non-empty reason
	 *     ≥ 4 chars，调 rejectRefund(id, reason)。
	 *
	 * 红线（M11/M12 沿用）：
	 *   - 所有 Select 用 '__all__' 哨兵；禁 value=""。
	 *   - 本页**不**引用计费核心、渠道定价、价格查询 service。
	 *   - RefundDialog 重用 M11 实现（subscriptions-admin/RefundDialog.svelte）。
	 *     If a future batch moves it to lib/features/refunds/, update this import
	 *     plus the matching subs/list pages — the contract is the same.
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import {
		RefreshCw,
		AlertTriangle,
		ChevronLeft,
		ChevronRight,
		Inbox,
		CheckCircle2,
		XCircle,
		Eye
	} from '@lucide/svelte';
	import { Dialog } from 'bits-ui';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import RefundDialog from '$lib/features/monetization/subscriptions-admin/RefundDialog.svelte';
	import {
		listRefundQueue,
		approveRefund,
		rejectRefund,
		type AdminRefundRequest,
		type AdminRefundFilter,
		type RefundRequestStatus
	} from '$lib/api/admin/refunds';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import type { AdminSubscription } from '$lib/api/admin/subscriptions';

	const ALL = '__all__';
	const VIRTUAL_THRESHOLD = 50;
	const PAGE_SIZE = 20;

	const REFUND_STATUSES: RefundRequestStatus[] = [
		'pending',
		'approved',
		'rejected',
		'completed',
		'failed'
	];

	let rows = $state<AdminRefundRequest[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let loadError = $state<string | null>(null);

	// 默认进入 pending；管理员的常用过滤项。
	let statusFilter = $state<string>('pending');
	let searchInput = $state('');
	let startDate = $state('');
	let endDate = $state('');

	let page = $state(1);
	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));

	// Approve via RefundDialog reuse
	let refundOpen = $state(false);
	let refundSubject = $state<AdminSubscription | null>(null);
	let pendingApproveId = $state<number | string | null>(null);

	// Reject confirm dialog state
	let rejectOpen = $state(false);
	let rejectTarget = $state<AdminRefundRequest | null>(null);
	let rejectReason = $state('');
	let rejectError = $state<string | null>(null);
	let rejectSubmitting = $state(false);

	// Detail drawer (lightweight inline; M12 has AdminOrderDetail for orders)
	let detailOpen = $state(false);
	let detailRow = $state<AdminRefundRequest | null>(null);

	async function loadQueue() {
		loading = true;
		loadError = null;
		try {
			const filter: AdminRefundFilter = {
				page,
				page_size: PAGE_SIZE,
				status: statusFilter === ALL ? undefined : statusFilter,
				keyword: searchInput.trim() || undefined,
				start_date: startDate || undefined,
				end_date: endDate || undefined,
				sort_by: 'requested_at',
				sort_order: 'desc'
			};
			const resp = await listRefundQueue(filter);
			rows = resp.data;
			total = resp.total;
		} catch (err) {
			const e = err as Error;
			loadError = e?.message ?? 'load failed';
			rows = [];
			total = 0;
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void loadQueue();
	});

	function applyFilters() {
		page = 1;
		void loadQueue();
	}

	const statusOptions = $derived.by<Array<{ value: string; label: string }>>(() => {
		const all = {
			value: ALL,
			label: $_('admin.refunds.statusAll', { default: 'All statuses' })
		};
		return [
			all,
			...REFUND_STATUSES.map((s) => ({
				value: s,
				label: $_(`admin.refunds.status.${s}`, { default: s })
			}))
		];
	});

	/**
	 * adaptRequestForRefundDialog — bridge AdminRefundRequest →
	 * AdminSubscription shape so the M11 RefundDialog form contract can be
	 * reused without duplicating UI. Only the minimum fields the dialog reads
	 * are populated (id, remaining_value, price_paid, currency, user_email);
	 * everything else is safe defaults. Wire endpoint stays
	 * /api/admin/subscriptions/:id/refund — which is acceptable because here
	 * the dialog is a *form shell* whose successful close triggers the queue's
	 * approveRefund flush (see openApprove). If a future iteration introduces
	 * a refund-queue-native dialog, replace this adapter wholesale.
	 */
	function adaptRequestForRefundDialog(r: AdminRefundRequest): AdminSubscription {
		return {
			id: r.id,
			user_id: r.user_id,
			user_email: r.user_email,
			plan_id: r.plan_id,
			plan_name: r.plan_name,
			status: 'active',
			started_at: r.requested_at,
			expires_at: r.requested_at,
			cancelled_at: null,
			price_paid: r.amount,
			currency: r.currency,
			remaining_value: r.amount
		};
	}

	function openApprove(r: AdminRefundRequest) {
		pendingApproveId = r.id;
		refundSubject = adaptRequestForRefundDialog(r);
		refundOpen = true;
	}

	async function handleRefunded() {
		// RefundDialog signaled a successful refund (subscriptions side). Flush
		// the queue mark + reload so the row drops out of the pending tab.
		if (pendingApproveId == null) {
			void loadQueue();
			return;
		}
		const id = pendingApproveId;
		pendingApproveId = null;
		try {
			await approveRefund(id);
			showSuccess(
				$_('admin.refunds.approveSuccess', { default: 'Refund approved' })
			);
		} catch (err) {
			const e = err as Error;
			showError(
				$_('admin.refunds.approveError', {
					default: 'Approve failed: {error}',
					values: { error: e?.message ?? 'unknown' }
				})
			);
		} finally {
			void loadQueue();
		}
	}

	function openReject(r: AdminRefundRequest) {
		rejectTarget = r;
		rejectReason = '';
		rejectError = null;
		rejectOpen = true;
	}

	async function confirmReject() {
		if (!rejectTarget || rejectSubmitting) return;
		const trimmed = rejectReason.trim();
		if (trimmed.length < 4) {
			rejectError = $_('admin.refunds.rejectReasonRequired', {
				default: 'Reason is required (≥ 4 characters)'
			});
			return;
		}
		rejectSubmitting = true;
		try {
			await rejectRefund(rejectTarget.id, trimmed);
			showSuccess(
				$_('admin.refunds.rejectSuccess', { default: 'Refund rejected' })
			);
			rejectOpen = false;
			rejectTarget = null;
			rejectReason = '';
			void loadQueue();
		} catch (err) {
			const e = err as Error;
			showError(
				$_('admin.refunds.rejectError', {
					default: 'Reject failed: {error}',
					values: { error: e?.message ?? 'unknown' }
				})
			);
		} finally {
			rejectSubmitting = false;
		}
	}

	function openDetail(r: AdminRefundRequest) {
		detailRow = r;
		detailOpen = true;
	}

	function maskEmail(email?: string): string {
		if (!email) return '—';
		const at = email.indexOf('@');
		if (at <= 1) return email;
		const local = email.slice(0, at);
		const masked = local.length <= 2 ? local : local[0] + '***' + local[local.length - 1];
		return masked + email.slice(at);
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

	function statusClass(s: string): string {
		switch (s) {
			case 'pending':
				return 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400';
			case 'approved':
				return 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400';
			case 'completed':
				return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
			case 'rejected':
				return 'border-zinc-400/40 bg-zinc-400/10 text-muted-foreground';
			case 'failed':
				return 'border-destructive/40 bg-destructive/10 text-destructive';
			default:
				return 'border-border bg-muted text-muted-foreground';
		}
	}

	function handleRowKey(e: KeyboardEvent, r: AdminRefundRequest) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			openDetail(r);
		}
	}

	function rowKey(r: AdminRefundRequest): string {
		return String(r.id);
	}

	function canActOn(s: string): boolean {
		return s === 'pending';
	}

	function handleKeywordKey(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			applyFilters();
		}
	}

	// Summary stats over current page rows
	const pendingCount = $derived(rows.filter((r) => r.status === 'pending').length);
	const totalRequested = $derived(
		rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
	);

	const useVirtual = $derived(rows.length > VIRTUAL_THRESHOLD);
</script>

<svelte:head>
	<title>{$_('admin.refunds.title', { default: 'Refund queue' })} · sub2api admin</title>
</svelte:head>

<section
	class="flex flex-col gap-4 px-7 pb-16 pt-6 text-foreground"
	data-testid="admin-refunds-page"
>
	<!-- Header -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="m-0 text-xl font-bold tracking-tight text-foreground">
				{$_('admin.refunds.title', { default: 'Refund queue' })}
			</h1>
			<p class="m-0 text-xs text-muted-foreground">
				{$_('admin.refunds.desc', {
					default: 'Review pending refund requests · approve / reject with reason'
				})}
			</p>
		</div>
		<div class="flex shrink-0 gap-2">
			<button
				type="button"
				class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
				disabled={loading}
				onclick={() => loadQueue()}
				data-testid="admin-refunds-refresh"
				title={$_('common.refresh', { default: 'Refresh' })}
				aria-label={$_('common.refresh', { default: 'Refresh' })}
			>
				<RefreshCw class="h-3.5 w-3.5 {loading ? 'animate-spin' : ''}" />
				{$_('common.refresh', { default: 'Refresh' })}
			</button>
		</div>
	</div>

	<!-- Stats bar -->
	<div
		class="flex items-center gap-5 rounded-xl border border-border bg-card px-[18px] py-3 shadow-sm"
		data-testid="admin-refunds-stats"
	>
		<div class="flex items-baseline gap-[7px]">
			<span
				class="font-mono text-[22px] font-bold tabular-nums text-amber-500"
				data-testid="admin-refunds-stat-pending"
			>
				{pendingCount}
			</span>
			<span class="text-[11.5px] text-muted-foreground">
				{$_('admin.refunds.statPending', { default: 'Pending' })}
			</span>
		</div>
		<div class="h-6 w-px bg-border" aria-hidden="true"></div>
		<div class="flex items-baseline gap-[7px]">
			<span
				class="font-mono text-[22px] font-bold tabular-nums text-foreground"
				data-testid="admin-refunds-stat-amount"
			>
				${totalRequested.toFixed(2)}
			</span>
			<span class="text-[11.5px] text-muted-foreground">
				{$_('admin.refunds.statAmount', { default: 'Requested' })}
			</span>
		</div>
		<div class="ml-auto text-xs text-muted-foreground tabular-nums">
			{rows.length} / {total}
		</div>
	</div>

	<!-- Load error -->
	{#if loadError}
		<div
			class="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
			data-testid="admin-refunds-error"
		>
			<AlertTriangle class="h-4 w-4" />
			<span>{loadError}</span>
			<button
				type="button"
				class="ml-auto rounded border border-border bg-background px-2 py-0.5 text-xs hover:bg-muted"
				onclick={() => loadQueue()}
			>
				{$_('common.confirm', { default: 'Retry' })}
			</button>
		</div>
	{/if}

	<!-- Filter bar -->
	<div
		class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2"
		data-testid="admin-refunds-filters"
	>
		<input
			type="search"
			class="h-8 w-56 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary"
			placeholder={$_('admin.refunds.searchPlaceholder', {
				default: 'Search order / user…'
			})}
			bind:value={searchInput}
			onkeydown={handleKeywordKey}
			data-testid="admin-refunds-search"
		/>

		<label class="ml-1 text-xs text-muted-foreground" for="admin-refunds-status-filter">
			{$_('common.status', { default: 'Status' })}
		</label>
		<select
			id="admin-refunds-status-filter"
			class="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary"
			bind:value={statusFilter}
			onchange={applyFilters}
			data-testid="admin-refunds-status-filter"
		>
			{#each statusOptions as o (o.value)}
				<option value={o.value}>{o.label}</option>
			{/each}
		</select>

		<label class="ml-1 text-xs text-muted-foreground" for="admin-refunds-start-date">
			{$_('admin.refunds.startDate', { default: 'From' })}
		</label>
		<input
			id="admin-refunds-start-date"
			type="date"
			class="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary"
			bind:value={startDate}
			onchange={applyFilters}
			data-testid="admin-refunds-start-date"
		/>
		<label class="ml-1 text-xs text-muted-foreground" for="admin-refunds-end-date">
			{$_('admin.refunds.endDate', { default: 'To' })}
		</label>
		<input
			id="admin-refunds-end-date"
			type="date"
			class="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-primary"
			bind:value={endDate}
			onchange={applyFilters}
			data-testid="admin-refunds-end-date"
		/>
	</div>

	<!-- Table -->
	{#if loading && rows.length === 0}
		<div class="flex flex-col gap-2" data-testid="admin-refunds-loading">
			{#each Array(5) as _, i (i)}
				<div class="h-12 animate-pulse rounded-md border border-border bg-muted"></div>
			{/each}
		</div>
	{:else if rows.length > 0}
		<div
			class="overflow-hidden rounded-md border border-border bg-card"
			data-testid="admin-refunds-table-wrapper"
			style="height: 560px;"
		>
			{#if useVirtual}
				<VirtualTable {rows} rowHeight={56} getRowKey={(r) => rowKey(r)}>
					{#snippet header()}
						<div
							class="grid grid-cols-[1.2fr,1.4fr,1fr,1.6fr,1fr,90px,160px] gap-2 border-b border-border bg-muted px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"
						>
							<div>{$_('admin.refunds.colOrderNo', { default: 'Order #' })}</div>
							<div>{$_('admin.refunds.colUser', { default: 'User' })}</div>
							<div class="text-right">{$_('admin.refunds.colAmount', { default: 'Amount' })}</div>
							<div>{$_('admin.refunds.colReason', { default: 'Reason' })}</div>
							<div>{$_('admin.refunds.colRequestedAt', { default: 'Requested at' })}</div>
							<div>{$_('admin.refunds.colStatus', { default: 'Status' })}</div>
							<div class="text-right">{$_('common.actions', { default: 'Actions' })}</div>
						</div>
					{/snippet}
					{#snippet row({ row: r })}
						<div
							role="button"
							tabindex="0"
							class="grid w-full cursor-pointer grid-cols-[1.2fr,1.4fr,1fr,1.6fr,1fr,90px,160px] gap-2 border-b border-border px-3 py-2 text-left text-xs hover:bg-muted"
							onclick={() => openDetail(r)}
							onkeydown={(e) => handleRowKey(e, r)}
							data-testid="admin-refunds-row"
							data-refund-id={r.id}
							data-refund-status={r.status}
						>
							<div class="truncate font-mono text-foreground">
								{r.out_trade_no ?? r.order_id}
							</div>
							<div class="truncate">
								<div class="truncate font-mono text-foreground">{maskEmail(r.user_email)}</div>
								<div class="truncate font-mono text-[10.5px] text-muted-foreground">
									#{r.user_id}
								</div>
							</div>
							<div class="text-right font-mono tabular-nums text-foreground">
								{fmtMoney(r.amount, r.currency)}
							</div>
							<div class="truncate text-muted-foreground" title={r.reason}>
								{r.reason ?? '—'}
							</div>
							<div class="font-mono tabular-nums text-muted-foreground">
								{fmtDate(r.requested_at)}
							</div>
							<div>
								<span
									class="rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider {statusClass(r.status)}"
								>
									{$_(`admin.refunds.status.${r.status}`, { default: r.status })}
								</span>
							</div>
							<div class="flex justify-end gap-1">
								<button
									type="button"
									class="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10.5px] hover:bg-muted"
									onclick={(e) => {
										e.stopPropagation();
										openDetail(r);
									}}
									data-testid="admin-refunds-view"
									title={$_('admin.refunds.view', { default: 'View' })}
									aria-label={$_('admin.refunds.view', { default: 'View' })}
								>
									<Eye class="h-3 w-3" />
								</button>
								{#if canActOn(r.status)}
									<button
										type="button"
										class="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10.5px] text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
										onclick={(e) => {
											e.stopPropagation();
											openApprove(r);
										}}
										data-testid="admin-refunds-approve"
									>
										<CheckCircle2 class="h-3 w-3" />
										{$_('admin.refunds.approve', { default: 'Approve' })}
									</button>
									<button
										type="button"
										class="inline-flex items-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10.5px] text-destructive hover:bg-destructive/20"
										onclick={(e) => {
											e.stopPropagation();
											openReject(r);
										}}
										data-testid="admin-refunds-reject"
									>
										<XCircle class="h-3 w-3" />
										{$_('admin.refunds.reject', { default: 'Reject' })}
									</button>
								{/if}
							</div>
						</div>
					{/snippet}
				</VirtualTable>
			{:else}
				<div class="flex h-full flex-col" data-testid="admin-refunds-table-flat">
					<div
						class="grid grid-cols-[1.2fr,1.4fr,1fr,1.6fr,1fr,90px,160px] gap-2 border-b border-border bg-muted px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"
					>
						<div>{$_('admin.refunds.colOrderNo', { default: 'Order #' })}</div>
						<div>{$_('admin.refunds.colUser', { default: 'User' })}</div>
						<div class="text-right">{$_('admin.refunds.colAmount', { default: 'Amount' })}</div>
						<div>{$_('admin.refunds.colReason', { default: 'Reason' })}</div>
						<div>{$_('admin.refunds.colRequestedAt', { default: 'Requested at' })}</div>
						<div>{$_('admin.refunds.colStatus', { default: 'Status' })}</div>
						<div class="text-right">{$_('common.actions', { default: 'Actions' })}</div>
					</div>
					<div class="flex-1 overflow-y-auto">
						{#each rows as r (rowKey(r))}
							<div
								role="button"
								tabindex="0"
								class="grid w-full cursor-pointer grid-cols-[1.2fr,1.4fr,1fr,1.6fr,1fr,90px,160px] gap-2 border-b border-border px-3 py-2 text-left text-xs hover:bg-muted"
								onclick={() => openDetail(r)}
								onkeydown={(e) => handleRowKey(e, r)}
								data-testid="admin-refunds-row"
								data-refund-id={r.id}
								data-refund-status={r.status}
							>
								<div class="truncate font-mono text-foreground">
									{r.out_trade_no ?? r.order_id}
								</div>
								<div class="truncate">
									<div class="truncate font-mono text-foreground">{maskEmail(r.user_email)}</div>
									<div class="truncate font-mono text-[10.5px] text-muted-foreground">
										#{r.user_id}
									</div>
								</div>
								<div class="text-right font-mono tabular-nums text-foreground">
									{fmtMoney(r.amount, r.currency)}
								</div>
								<div class="truncate text-muted-foreground" title={r.reason}>
									{r.reason ?? '—'}
								</div>
								<div class="font-mono tabular-nums text-muted-foreground">
									{fmtDate(r.requested_at)}
								</div>
								<div>
									<span
										class="rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider {statusClass(r.status)}"
									>
										{$_(`admin.refunds.status.${r.status}`, { default: r.status })}
									</span>
								</div>
								<div class="flex justify-end gap-1">
									<button
										type="button"
										class="inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 py-0.5 text-[10.5px] hover:bg-muted"
										onclick={(e) => {
											e.stopPropagation();
											openDetail(r);
										}}
										data-testid="admin-refunds-view"
										title={$_('admin.refunds.view', { default: 'View' })}
										aria-label={$_('admin.refunds.view', { default: 'View' })}
									>
										<Eye class="h-3 w-3" />
									</button>
									{#if canActOn(r.status)}
										<button
											type="button"
											class="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10.5px] text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
											onclick={(e) => {
												e.stopPropagation();
												openApprove(r);
											}}
											data-testid="admin-refunds-approve"
										>
											<CheckCircle2 class="h-3 w-3" />
											{$_('admin.refunds.approve', { default: 'Approve' })}
										</button>
										<button
											type="button"
											class="inline-flex items-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10.5px] text-destructive hover:bg-destructive/20"
											onclick={(e) => {
												e.stopPropagation();
												openReject(r);
											}}
											data-testid="admin-refunds-reject"
										>
											<XCircle class="h-3 w-3" />
											{$_('admin.refunds.reject', { default: 'Reject' })}
										</button>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		{#if totalPages > 1}
			<div
				class="flex items-center justify-center gap-2 pt-1"
				data-testid="admin-refunds-pagination"
			>
				<button
					type="button"
					class="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs hover:bg-muted disabled:opacity-40"
					disabled={page === 1 || loading}
					onclick={() => {
						page = Math.max(1, page - 1);
						void loadQueue();
					}}
					aria-label={$_('common.back', { default: 'Previous' })}
				>
					<ChevronLeft class="h-3 w-3" />
				</button>
				<span class="text-xs tabular-nums text-muted-foreground">
					{page} / {totalPages}
				</span>
				<button
					type="button"
					class="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs hover:bg-muted disabled:opacity-40"
					disabled={page === totalPages || loading}
					onclick={() => {
						page = Math.min(totalPages, page + 1);
						void loadQueue();
					}}
					aria-label={$_('common.next', { default: 'Next' })}
				>
					<ChevronRight class="h-3 w-3" />
				</button>
			</div>
		{/if}
	{:else if !loading}
		<div
			class="flex flex-col items-center justify-center gap-3 px-6 py-20 text-muted-foreground"
			data-testid="admin-refunds-empty"
		>
			<Inbox class="h-10 w-10 opacity-40" />
			<p class="m-0 text-[13px]">
				{$_('admin.refunds.emptyText', {
					default: 'No refund requests match the current filters.'
				})}
			</p>
		</div>
	{/if}
</section>

<!-- Refund (M11 dialog reused via adapter — see adaptRequestForRefundDialog jsdoc) -->
<RefundDialog
	bind:open={refundOpen}
	subscription={refundSubject}
	onRefunded={handleRefunded}
/>

<!-- Reject confirm dialog -->
<Dialog.Root bind:open={rejectOpen}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
		/>
		<Dialog.Content
			data-testid="admin-refunds-reject-dialog"
			class="fixed left-1/2 top-1/2 z-50 w-full max-w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-lg outline-none"
		>
			<div class="flex items-start gap-3">
				<div
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
				>
					<XCircle class="h-5 w-5" />
				</div>
				<div class="space-y-1.5">
					<Dialog.Title class="text-base font-semibold text-foreground">
						{$_('admin.refunds.rejectTitle', { default: 'Reject refund request' })}
					</Dialog.Title>
					<Dialog.Description class="text-sm text-muted-foreground">
						{$_('admin.refunds.rejectDescription', {
							default: 'The user will see this reason in their order history.'
						})}
					</Dialog.Description>
				</div>
			</div>

			<div class="mt-5 flex flex-col gap-1.5">
				<label
					for="admin-refunds-reject-reason"
					class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
				>
					{$_('admin.refunds.rejectReason', { default: 'Reason' })}
				</label>
				<textarea
					id="admin-refunds-reject-reason"
					rows="3"
					maxlength="500"
					class="rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
					placeholder={$_('admin.refunds.rejectReasonPlaceholder', {
						default: 'Why is this refund being rejected?'
					})}
					bind:value={rejectReason}
					data-testid="admin-refunds-reject-reason-input"
					disabled={rejectSubmitting}
				></textarea>
				{#if rejectError}
					<p
						class="m-0 text-xs text-destructive"
						data-testid="admin-refunds-reject-error"
					>
						{rejectError}
					</p>
				{/if}
			</div>

			<div class="mt-6 flex items-center justify-end gap-2">
				<button
					type="button"
					data-testid="admin-refunds-reject-cancel"
					disabled={rejectSubmitting}
					onclick={() => (rejectOpen = false)}
					class="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
				>
					{$_('common.cancel', { default: 'Cancel' })}
				</button>
				<button
					type="button"
					data-testid="admin-refunds-reject-confirm"
					disabled={rejectSubmitting || !rejectTarget}
					onclick={confirmReject}
					class="inline-flex h-9 items-center justify-center rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{rejectSubmitting
						? $_('admin.refunds.rejectSubmitting', { default: 'Rejecting…' })
						: $_('admin.refunds.reject', { default: 'Reject' })}
				</button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Detail drawer (inline, lightweight) -->
<Dialog.Root bind:open={detailOpen}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
		/>
		<Dialog.Content
			data-testid="admin-refunds-detail-drawer"
			class="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col gap-3 border-l border-border bg-card p-6 shadow-xl outline-none"
		>
			<Dialog.Title class="text-base font-semibold text-foreground">
				{$_('admin.refunds.detailTitle', { default: 'Refund request detail' })}
			</Dialog.Title>
			{#if detailRow}
				<div class="grid grid-cols-[120px,1fr] gap-y-2 text-xs">
					<div class="text-muted-foreground">
						{$_('admin.refunds.colOrderNo', { default: 'Order #' })}
					</div>
					<div class="font-mono text-foreground">
						{detailRow.out_trade_no ?? detailRow.order_id}
					</div>
					<div class="text-muted-foreground">
						{$_('admin.refunds.colUser', { default: 'User' })}
					</div>
					<div class="font-mono text-foreground">
						{detailRow.user_email ?? '—'} <span class="text-muted-foreground">#{detailRow.user_id}</span>
					</div>
					<div class="text-muted-foreground">
						{$_('admin.refunds.colAmount', { default: 'Amount' })}
					</div>
					<div class="font-mono tabular-nums text-foreground">
						{fmtMoney(detailRow.amount, detailRow.currency)}
					</div>
					<div class="text-muted-foreground">
						{$_('admin.refunds.colStatus', { default: 'Status' })}
					</div>
					<div>
						<span
							class="rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider {statusClass(detailRow.status)}"
						>
							{$_(`admin.refunds.status.${detailRow.status}`, { default: detailRow.status })}
						</span>
					</div>
					<div class="text-muted-foreground">
						{$_('admin.refunds.colReason', { default: 'Reason' })}
					</div>
					<div class="text-foreground">{detailRow.reason ?? '—'}</div>
					<div class="text-muted-foreground">
						{$_('admin.refunds.colRequestedAt', { default: 'Requested at' })}
					</div>
					<div class="font-mono tabular-nums text-foreground">
						{fmtDate(detailRow.requested_at)}
					</div>
					{#if detailRow.reviewer}
						<div class="text-muted-foreground">
							{$_('admin.refunds.reviewer', { default: 'Reviewer' })}
						</div>
						<div class="text-foreground">{detailRow.reviewer}</div>
					{/if}
					{#if detailRow.reviewer_note}
						<div class="text-muted-foreground">
							{$_('admin.refunds.reviewerNote', { default: 'Reviewer note' })}
						</div>
						<div class="text-foreground">{detailRow.reviewer_note}</div>
					{/if}
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
