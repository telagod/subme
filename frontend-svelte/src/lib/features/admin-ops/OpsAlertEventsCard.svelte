<script lang="ts">
	/**
	 * OpsAlertEventsCard · admin Ops 告警事件卡片（Phase C M13）
	 *
	 * Vue ref: frontend/src/views/admin/ops/components/OpsAlertEventsCard.vue (05c44218)
	 *
	 * 自洽（self-contained）：
	 *   - 自取 alert-events（listOpsAlertEvents），不依赖父级数据，仅可选 refreshToken 触发重拉。
	 *   - 过滤器：status / severity（NativeSelect + sentinel __all__）、time-range。
	 *   - 游标分页：before_id + before_fired_at（cursor pagination，PAGE_SIZE=10）。
	 *   - 行点击 → 打开内置详情 Drawer（本组件自有，非父级注入）。
	 *   - Drawer 动作：
	 *       Silence  → createOpsAlertSilence(...) → 重拉 detail
	 *       Resolve  → updateOpsAlertEventStatus(id, 'manual_resolved') → 重拉 detail + 首页
	 *   - 详情含同维度历史（同 rule_id + platform + group_id），best-effort 过滤。
	 *
	 * 红线遵循：
	 *   - 仅复用 lib/ui/* primitives（Card / NativeSelect / Button / Badge / StandardDrawer），不手搓。
	 *   - NativeSelect sentinel __all__，绝不空值。
	 *   - Zinc 调色板 + 语义 token（destructive / amber-500 / emerald-500 / muted），无裸 hex。
	 *   - i18n 全走 $_('admin.ops.<key>', { default }) —— 不改 locales。
	 *   - 无 chart（本 section 是纯表格，Vue ref 同样无图），故不引 chart.js。
	 */
	import { _ } from 'svelte-i18n';
	import { RefreshCw, Ban, CheckCircle2, ExternalLink, Loader2 } from '@lucide/svelte';
	import {
		listOpsAlertEvents,
		getOpsAlertEvent,
		updateOpsAlertEventStatus,
		createOpsAlertSilence,
		type AlertEvent,
		type AlertEventsQuery
	} from '$lib/api/admin/ops';
	import { formatDateTime } from '$lib/features/admin-ops/ops';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import StandardDrawer from '$lib/ui/StandardDrawer.svelte';

	type Props = {
		refreshToken?: number;
		platformFilter?: string;
		groupIdFilter?: number | null;
	};

	let { refreshToken = 0, platformFilter = '', groupIdFilter = null }: Props = $props();

	const PAGE_SIZE = 10;
	const ALL = '__all__';

	// ── Filters (sentinel __all__, never empty string) ──────────────────────────
	let timeRange = $state<string>('24h');
	let severity = $state<string>(ALL);
	let status = $state<string>(ALL);

	const timeRangeOptions = $derived([
		{ value: '5m', label: $_('admin.ops.timeRange.5m', { default: '5m' }) },
		{ value: '30m', label: $_('admin.ops.timeRange.30m', { default: '30m' }) },
		{ value: '1h', label: $_('admin.ops.timeRange.1h', { default: '1h' }) },
		{ value: '6h', label: $_('admin.ops.timeRange.6h', { default: '6h' }) },
		{ value: '24h', label: $_('admin.ops.timeRange.24h', { default: '24h' }) },
		{ value: '7d', label: $_('admin.ops.timeRange.7d', { default: '7d' }) },
		{ value: '30d', label: $_('admin.ops.timeRange.30d', { default: '30d' }) }
	]);

	const severityOptions = $derived([
		{ value: ALL, label: $_('common.all', { default: '全部' }) },
		{ value: 'P0', label: 'P0' },
		{ value: 'P1', label: 'P1' },
		{ value: 'P2', label: 'P2' },
		{ value: 'P3', label: 'P3' }
	]);

	const statusOptions = $derived([
		{ value: ALL, label: $_('common.all', { default: '全部' }) },
		{ value: 'firing', label: $_('admin.ops.alertEvents.status.firing', { default: '触发中' }) },
		{
			value: 'resolved',
			label: $_('admin.ops.alertEvents.status.resolved', { default: '已解决' })
		},
		{
			value: 'manual_resolved',
			label: $_('admin.ops.alertEvents.status.manualResolved', { default: '已手动解决' })
		}
	]);

	// ── List state ───────────────────────────────────────────────────────────────
	let events = $state<AlertEvent[]>([]);
	let loading = $state(false);
	let loadingMore = $state(false);
	let loadError = $state<string | null>(null);
	let hasMore = $state(true);

	function buildQuery(overrides: Partial<AlertEventsQuery> = {}): AlertEventsQuery {
		const q: AlertEventsQuery = {
			limit: PAGE_SIZE,
			time_range: timeRange
		};
		if (severity !== ALL) q.severity = severity;
		if (status !== ALL) q.status = status;
		if (platformFilter) q.platform = platformFilter;
		if (typeof groupIdFilter === 'number' && groupIdFilter > 0) q.group_id = groupIdFilter;
		return { ...q, ...overrides };
	}

	async function loadFirstPage() {
		loading = true;
		loadError = null;
		try {
			const data = await listOpsAlertEvents(buildQuery());
			events = data;
			hasMore = data.length === PAGE_SIZE;
		} catch (err) {
			loadError =
				(err as Error)?.message ??
				$_('admin.ops.alertEvents.loadFailed', { default: '加载告警事件失败' });
			events = [];
			hasMore = false;
		} finally {
			loading = false;
		}
	}

	async function loadMore() {
		if (loadingMore || loading || !hasMore) return;
		const last = events[events.length - 1];
		if (!last) return;
		loadingMore = true;
		try {
			const data = await listOpsAlertEvents(
				buildQuery({ before_fired_at: last.fired_at || last.created_at, before_id: last.id })
			);
			if (!data.length) {
				hasMore = false;
				return;
			}
			events = [...events, ...data];
			if (data.length < PAGE_SIZE) hasMore = false;
		} catch {
			hasMore = false;
		} finally {
			loadingMore = false;
		}
	}

	function onScroll(e: Event) {
		const el = e.currentTarget as HTMLElement | null;
		if (!el) return;
		if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) void loadMore();
	}

	// Filters change → reset + reload. refreshToken (parent) → reload first page.
	let lastFilterKey = $state('');
	let lastRefresh = $state<number>(-1);
	$effect(() => {
		const key = `${timeRange}|${severity}|${status}|${platformFilter}|${groupIdFilter}`;
		const refreshChanged = refreshToken !== lastRefresh;
		if (key !== lastFilterKey || refreshChanged) {
			lastFilterKey = key;
			lastRefresh = refreshToken;
			events = [];
			hasMore = true;
			void loadFirstPage();
		}
	});

	// ── Detail drawer (owned) ─────────────────────────────────────────────────────
	let detailOpen = $state(false);
	let selected = $state<AlertEvent | null>(null);
	let detailLoading = $state(false);
	let actionLoading = $state(false);

	let history = $state<AlertEvent[]>([]);
	let historyLoading = $state(false);
	let historyRange = $state<string>('7d');
	const historyRangeOptions = $derived([
		{ value: '7d', label: $_('admin.ops.timeRange.7d', { default: '7d' }) },
		{ value: '30d', label: $_('admin.ops.timeRange.30d', { default: '30d' }) }
	]);

	let silenceDuration = $state<string>('1h');
	const silenceDurationOptions = $derived([
		{ value: '1h', label: $_('admin.ops.timeRange.1h', { default: '1h' }) },
		{ value: '24h', label: $_('admin.ops.timeRange.24h', { default: '24h' }) },
		{ value: '7d', label: $_('admin.ops.timeRange.7d', { default: '7d' }) }
	]);

	function dimString(event: AlertEvent | null | undefined, key: string): string {
		const v = event?.dimensions?.[key];
		if (v == null) return '';
		if (typeof v === 'string') return v;
		if (typeof v === 'number' || typeof v === 'boolean') return String(v);
		return '';
	}

	function dimGroupId(event: AlertEvent | null | undefined): number | undefined {
		const raw = event?.dimensions?.group_id;
		return typeof raw === 'number' ? raw : undefined;
	}

	function dimensionsSummary(event: AlertEvent): string {
		const parts: string[] = [];
		const platform = dimString(event, 'platform');
		if (platform) parts.push(`platform=${platform}`);
		const groupId = event.dimensions?.group_id;
		if (groupId != null && groupId !== '') parts.push(`group_id=${String(groupId)}`);
		const region = dimString(event, 'region');
		if (region) parts.push(`region=${region}`);
		return parts.length ? parts.join(' ') : '—';
	}

	function formatDurationMs(ms: number): string {
		const safe = Math.max(0, Math.floor(ms));
		const sec = Math.floor(safe / 1000);
		if (sec < 60) return `${sec}s`;
		const min = Math.floor(sec / 60);
		if (min < 60) return `${min}m`;
		const hr = Math.floor(min / 60);
		if (hr < 24) return `${hr}h`;
		return `${Math.floor(hr / 24)}d`;
	}

	function statusLabel(s: string | undefined): string {
		const v = String(s ?? '')
			.trim()
			.toLowerCase();
		if (!v) return '—';
		if (v === 'firing') return $_('admin.ops.alertEvents.status.firing', { default: '触发中' });
		if (v === 'resolved') return $_('admin.ops.alertEvents.status.resolved', { default: '已解决' });
		if (v === 'manual_resolved')
			return $_('admin.ops.alertEvents.status.manualResolved', { default: '已手动解决' });
		return v.toUpperCase();
	}

	function durationLabel(event: AlertEvent): string {
		const fired = new Date(event.fired_at || event.created_at);
		if (Number.isNaN(fired.getTime())) return '—';
		const s = String(event.status ?? '')
			.trim()
			.toLowerCase();
		if (event.resolved_at) {
			const resolved = new Date(event.resolved_at);
			if (!Number.isNaN(resolved.getTime())) {
				const prefix =
					s === 'manual_resolved'
						? $_('admin.ops.alertEvents.status.manualResolved', { default: '已手动解决' })
						: $_('admin.ops.alertEvents.status.resolved', { default: '已解决' });
				return `${prefix} ${formatDurationMs(resolved.getTime() - fired.getTime())}`;
			}
		}
		return `${$_('admin.ops.alertEvents.status.firing', { default: '触发中' })} ${formatDurationMs(Date.now() - fired.getTime())}`;
	}

	// Severity badge tone (Zinc + semantic tokens, no raw hex)
	function severityTone(sev: string | undefined): string {
		const v = String(sev ?? '').toLowerCase();
		if (v === 'p0' || v === 'critical')
			return 'border-destructive/40 bg-destructive/15 text-destructive';
		if (v === 'p1' || v === 'warning')
			return 'border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400';
		if (v === 'p2' || v === 'info')
			return 'border-blue-500/40 bg-blue-500/15 text-blue-600 dark:text-blue-400';
		return 'border-border bg-muted text-muted-foreground';
	}

	function statusTone(s: string | undefined): string {
		const v = String(s ?? '').toLowerCase();
		if (v === 'firing') return 'border-destructive/40 bg-destructive/15 text-destructive';
		if (v === 'resolved')
			return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
		return 'border-border bg-muted text-muted-foreground';
	}

	async function openDetail(row: AlertEvent) {
		detailOpen = true;
		selected = row;
		detailLoading = true;
		historyLoading = true;
		try {
			selected = await getOpsAlertEvent(row.id);
		} catch (err) {
			showError(
				(err as Error)?.message ??
					$_('admin.ops.alertEvents.detail.loadFailed', { default: '加载详情失败' })
			);
		} finally {
			detailLoading = false;
		}
		await loadHistory();
	}

	function closeDetail() {
		detailOpen = false;
		selected = null;
		history = [];
	}

	async function loadHistory() {
		const ev = selected;
		if (!ev) {
			history = [];
			historyLoading = false;
			return;
		}
		historyLoading = true;
		try {
			const platform = dimString(ev, 'platform');
			const items = await listOpsAlertEvents({
				limit: 20,
				time_range: historyRange,
				platform: platform || undefined,
				group_id: dimGroupId(ev)
			});
			// best-effort: narrow to same rule_id + platform + group_id
			history = items.filter((it) => {
				if (it.rule_id !== ev.rule_id) return false;
				if (dimString(it, 'platform') !== dimString(ev, 'platform')) return false;
				return (it.dimensions?.group_id ?? null) === (ev.dimensions?.group_id ?? null);
			});
		} catch {
			history = [];
		} finally {
			historyLoading = false;
		}
	}

	// historyRange change (while open) → reload history
	let lastHistoryRange = $state('7d');
	$effect(() => {
		const r = historyRange;
		if (detailOpen && r !== lastHistoryRange) {
			lastHistoryRange = r;
			void loadHistory();
		}
		if (!detailOpen) lastHistoryRange = r;
	});

	function untilRfc3339(duration: string): string {
		const now = Date.now();
		const ms =
			duration === '24h'
				? 24 * 60 * 60 * 1000
				: duration === '7d'
					? 7 * 24 * 60 * 60 * 1000
					: 60 * 60 * 1000;
		return new Date(now + ms).toISOString();
	}

	async function silenceAlert() {
		const ev = selected;
		if (!ev || actionLoading) return;
		actionLoading = true;
		try {
			await createOpsAlertSilence({
				rule_id: ev.rule_id,
				platform: dimString(ev, 'platform') || '',
				group_id: dimGroupId(ev),
				region: dimString(ev, 'region') || undefined,
				until: untilRfc3339(silenceDuration),
				reason: `silence from UI (${silenceDuration})`
			});
			showSuccess(
				$_('admin.ops.alertEvents.detail.silenceSuccess', { default: '告警已静默' })
			);
		} catch (err) {
			showError(
				(err as Error)?.message ??
					$_('admin.ops.alertEvents.detail.silenceFailed', { default: '静默告警失败' })
			);
		} finally {
			actionLoading = false;
		}
	}

	async function manualResolve() {
		const ev = selected;
		if (!ev || actionLoading) return;
		actionLoading = true;
		try {
			await updateOpsAlertEventStatus(ev.id, 'manual_resolved');
			showSuccess(
				$_('admin.ops.alertEvents.detail.manualResolvedSuccess', { default: '告警已解决' })
			);
			// refetch detail + first page to reflect new status
			selected = await getOpsAlertEvent(ev.id);
			await loadFirstPage();
			await loadHistory();
		} catch (err) {
			showError(
				(err as Error)?.message ??
					$_('admin.ops.alertEvents.detail.manualResolvedFailed', {
						default: '解决告警失败'
					})
			);
		} finally {
			actionLoading = false;
		}
	}

	const isEmpty = $derived(events.length === 0 && !loading && !loadError);
</script>

<Card class="p-6" data-testid="ops-alert-events-card">
	<!-- Header toolbar -->
	<div class="mb-4 flex flex-wrap items-start justify-between gap-3">
		<div>
			<h3 class="text-sm font-bold text-foreground">
				{$_('admin.ops.alertEvents.title', { default: '告警事件' })}
			</h3>
			<p class="mt-1 text-xs text-muted-foreground">
				{$_('admin.ops.alertEvents.description', {
					default: '近期告警触发记录，含静默和手动解决操作。'
				})}
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-1.5">
			<NativeSelect
				bind:value={timeRange}
				options={timeRangeOptions}
				class="h-9 w-[110px]"
				aria-label={$_('admin.ops.alertEvents.filter.timeRange', { default: '时间范围' })}
				data-testid="ops-alert-events-filter-time"
			/>
			<NativeSelect
				bind:value={severity}
				options={severityOptions}
				class="h-9 w-[100px]"
				aria-label={$_('admin.ops.alertEvents.filter.severity', { default: '严重度' })}
				data-testid="ops-alert-events-filter-severity"
			/>
			<NativeSelect
				bind:value={status}
				options={statusOptions}
				class="h-9 w-[140px]"
				aria-label={$_('admin.ops.alertEvents.filter.status', { default: '状态' })}
				data-testid="ops-alert-events-filter-status"
			/>
			<Button
				variant="outline"
				size="sm"
				disabled={loading}
				onclick={() => loadFirstPage()}
				data-testid="ops-alert-events-refresh"
			>
				<RefreshCw class={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
				{$_('common.refresh', { default: '刷新' })}
			</Button>
		</div>
	</div>

	{#if loading}
		<div
			class="flex items-center gap-2 text-sm text-muted-foreground"
			role="status"
			data-testid="ops-alert-events-loading"
		>
			<Loader2 class="h-4 w-4 animate-spin" />
			{$_('admin.ops.alertEvents.loading', { default: '加载中…' })}
		</div>
	{:else if loadError}
		<div
			class="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
			role="alert"
			data-testid="ops-alert-events-error"
		>
			{loadError}
		</div>
	{:else if isEmpty}
		<div
			class="rounded-lg border border-dashed border-border p-7 text-center text-sm text-muted-foreground"
			data-testid="ops-alert-events-empty"
		>
			{$_('admin.ops.alertEvents.empty', { default: '该范围内无告警事件。' })}
		</div>
	{:else}
		<div class="overflow-hidden rounded-lg border border-border">
			<div class="max-h-[600px] overflow-y-auto" onscroll={onScroll}>
				<table class="w-full border-collapse text-xs">
					<thead class="sticky top-0 z-10 border-b border-border bg-muted">
						<tr>
							<th class="px-3.5 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
								{$_('admin.ops.alertEvents.table.time', { default: '时间' })}
							</th>
							<th class="px-3.5 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
								{$_('admin.ops.alertEvents.table.severity', { default: '严重度' })}
							</th>
							<th class="px-3.5 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
								{$_('admin.ops.alertEvents.table.platform', { default: '平台' })}
							</th>
							<th class="px-3.5 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
								{$_('admin.ops.alertEvents.table.ruleId', { default: '规则' })}
							</th>
							<th class="px-3.5 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
								{$_('admin.ops.alertEvents.table.title', { default: '标题' })}
							</th>
							<th class="px-3.5 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
								{$_('admin.ops.alertEvents.table.duration', { default: '时长' })}
							</th>
							<th class="px-3.5 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
								{$_('admin.ops.alertEvents.table.dimensions', { default: '维度' })}
							</th>
							<th class="px-3.5 py-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
								{$_('admin.ops.alertEvents.table.email', { default: '邮箱' })}
							</th>
						</tr>
					</thead>
					<tbody>
						{#each events as row (row.id)}
							<tr
								role="button"
								tabindex="0"
								class="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
								title={row.title || ''}
								onclick={() => openDetail(row)}
								onkeydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										openDetail(row);
									}
								}}
								data-testid="ops-alert-events-row"
							>
								<td class="whitespace-nowrap px-3.5 py-2.5 text-muted-foreground">
									{formatDateTime(row.fired_at || row.created_at)}
								</td>
								<td class="whitespace-nowrap px-3.5 py-2.5">
									<div class="flex items-center gap-1.5">
										<Badge variant="outline" class={`border ${severityTone(row.severity)}`}>
											{row.severity || '—'}
										</Badge>
										<Badge variant="outline" class={`border ${statusTone(row.status)}`}>
											{statusLabel(row.status)}
										</Badge>
									</div>
								</td>
								<td class="whitespace-nowrap px-3.5 py-2.5 text-muted-foreground">
									{dimString(row, 'platform') || '—'}
								</td>
								<td class="whitespace-nowrap px-3.5 py-2.5 text-muted-foreground">
									<span class="font-mono">#{row.rule_id}</span>
								</td>
								<td class="min-w-[260px] px-3.5 py-2.5">
									<div class="max-w-[360px] truncate font-semibold text-foreground">
										{row.title || '—'}
									</div>
									{#if row.description}
										<div class="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
											{row.description}
										</div>
									{/if}
								</td>
								<td class="whitespace-nowrap px-3.5 py-2.5 text-muted-foreground">
									{durationLabel(row)}
								</td>
								<td class="whitespace-nowrap px-3.5 py-2.5 text-[11px] text-muted-foreground">
									{dimensionsSummary(row)}
								</td>
								<td class="whitespace-nowrap px-3.5 py-2.5 text-right">
									<span class="inline-flex items-center justify-end gap-1.5 text-[11px] font-semibold">
										{#if row.email_sent}
											<CheckCircle2 class="h-3.5 w-3.5 text-emerald-500" />
											<span class="text-muted-foreground">
												{$_('admin.ops.alertEvents.table.emailSent', { default: '已发送' })}
											</span>
										{:else}
											<Ban class="h-3.5 w-3.5 text-muted-foreground" />
											<span class="text-muted-foreground">
												{$_('admin.ops.alertEvents.table.emailIgnored', { default: '已忽略' })}
											</span>
										{/if}
									</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
				{#if loadingMore}
					<div
						class="flex items-center justify-center gap-2 p-2.5 text-[11px] text-muted-foreground"
						role="status"
						data-testid="ops-alert-events-loading-more"
					>
						<Loader2 class="h-3 w-3 animate-spin" />
						{$_('admin.ops.alertEvents.loading', { default: '加载中…' })}
					</div>
				{:else if !hasMore && events.length > 0}
					<div class="p-2.5 text-center text-[11px] text-muted-foreground">—</div>
				{/if}
			</div>
		</div>
	{/if}
</Card>

<!-- Detail drawer (owned) -->
<StandardDrawer
	bind:open={detailOpen}
	width="lg"
	title={$_('admin.ops.alertEvents.detail.title', { default: '告警事件' })}
	description={$_('admin.ops.alertEvents.detail.subtitle', {
		default: '静默规则或将此告警标记为手动解决。'
	})}
	data-testid="ops-alert-event-detail-drawer"
>
	<div class="mt-4 flex-1 overflow-y-auto pr-1">
		{#if detailLoading}
			<div
				class="flex items-center justify-center gap-2 py-9 text-sm text-muted-foreground"
				data-testid="ops-alert-event-detail-loading"
			>
				<Loader2 class="h-4 w-4 animate-spin" />
				{$_('admin.ops.alertEvents.detail.loading', { default: '加载中…' })}
			</div>
		{:else if !selected}
			<div class="py-9 text-center text-sm text-muted-foreground">
				{$_('admin.ops.alertEvents.detail.empty', { default: '未选择告警。' })}
			</div>
		{:else}
			<div class="flex flex-col gap-4">
				<!-- Summary + actions -->
				<div class="rounded-lg border border-border bg-muted/50 p-3.5">
					<div class="flex flex-wrap items-start justify-between gap-2.5">
						<div>
							<div class="flex flex-wrap items-center gap-1.5">
								<Badge variant="outline" class={`border ${severityTone(selected.severity)}`}>
									{selected.severity || '—'}
								</Badge>
								<Badge variant="outline" class={`border ${statusTone(selected.status)}`}>
									{statusLabel(selected.status)}
								</Badge>
							</div>
							<div class="mt-2 text-sm font-semibold text-foreground">
								{selected.title || '—'}
							</div>
							{#if selected.description}
								<div class="mt-1 whitespace-pre-wrap text-[11.5px] text-muted-foreground">
									{selected.description}
								</div>
							{/if}
						</div>
						<div class="flex flex-wrap items-center gap-1.5">
							<div
								class="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5"
							>
								<span class="text-[11px] font-semibold text-muted-foreground">
									{$_('admin.ops.alertEvents.detail.silence', { default: '静默' })}
								</span>
								<NativeSelect
									bind:value={silenceDuration}
									options={silenceDurationOptions}
									class="h-8 w-[90px]"
									aria-label={$_('admin.ops.alertEvents.detail.silence', { default: '静默' })}
									data-testid="ops-alert-event-silence-duration"
								/>
								<Button
									variant="outline"
									size="sm"
									disabled={actionLoading}
									onclick={silenceAlert}
									data-testid="ops-alert-event-silence-apply"
								>
									<Ban class="mr-1 h-3.5 w-3.5" />
									{$_('common.apply', { default: '应用' })}
								</Button>
							</div>
							<Button
								variant="outline"
								size="sm"
								disabled={actionLoading}
								onclick={manualResolve}
								data-testid="ops-alert-event-resolve"
							>
								<CheckCircle2 class="mr-1 h-3.5 w-3.5" />
								{$_('admin.ops.alertEvents.detail.manualResolve', { default: '解决' })}
							</Button>
						</div>
					</div>
				</div>

				<!-- Meta grid -->
				<div class="grid grid-cols-2 gap-2.5">
					<div class="rounded-lg border border-border bg-card p-3">
						<div class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
							{$_('admin.ops.alertEvents.detail.firedAt', { default: '触发于' })}
						</div>
						<div class="mt-1 text-[13px] font-medium text-foreground">
							{formatDateTime(selected.fired_at || selected.created_at)}
						</div>
					</div>
					<div class="rounded-lg border border-border bg-card p-3">
						<div class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
							{$_('admin.ops.alertEvents.detail.resolvedAt', { default: '解决于' })}
						</div>
						<div class="mt-1 text-[13px] font-medium text-foreground">
							{selected.resolved_at ? formatDateTime(selected.resolved_at) : '—'}
						</div>
					</div>
					<div class="rounded-lg border border-border bg-card p-3">
						<div class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
							{$_('admin.ops.alertEvents.detail.ruleId', { default: '规则' })}
						</div>
						<div class="mt-1 flex flex-wrap items-center gap-1.5">
							<span class="font-mono text-[13px] font-bold text-foreground">#{selected.rule_id}</span>
							<a
								class="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-[10px] text-muted-foreground no-underline transition-colors hover:text-foreground"
								href={`/admin/ops?open_alert_rules=1&alert_rule_id=${selected.rule_id}`}
							>
								<ExternalLink class="h-3 w-3" />
								{$_('admin.ops.alertEvents.detail.viewRule', { default: '查看规则' })}
							</a>
						</div>
					</div>
					<div class="rounded-lg border border-border bg-card p-3">
						<div class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
							{$_('admin.ops.alertEvents.detail.dimensions', { default: '维度' })}
						</div>
						<div class="mt-1 text-xs text-muted-foreground">
							{#if dimString(selected, 'platform')}
								<div>platform={dimString(selected, 'platform')}</div>
							{/if}
							{#if selected.dimensions?.group_id}
								<div>group_id={String(selected.dimensions.group_id)}</div>
							{/if}
							{#if dimString(selected, 'region')}
								<div>region={dimString(selected, 'region')}</div>
							{/if}
						</div>
					</div>
				</div>

				<!-- History -->
				<div class="rounded-lg border border-border bg-card p-3.5">
					<div class="mb-3 flex flex-wrap items-center justify-between gap-2.5">
						<div>
							<div class="text-[13px] font-bold text-foreground">
								{$_('admin.ops.alertEvents.detail.historyTitle', { default: '近期记录' })}
							</div>
							<div class="mt-0.5 text-[11px] text-muted-foreground">
								{$_('admin.ops.alertEvents.detail.historyHint', {
									default: '相同规则和维度。'
								})}
							</div>
						</div>
						<NativeSelect
							bind:value={historyRange}
							options={historyRangeOptions}
							class="h-8 w-[120px]"
							aria-label={$_('admin.ops.alertEvents.detail.historyTitle', {
								default: '近期记录'
							})}
							data-testid="ops-alert-event-history-range"
						/>
					</div>
					{#if historyLoading}
						<div class="py-5 text-center text-[11.5px] text-muted-foreground">
							{$_('admin.ops.alertEvents.detail.historyLoading', { default: '加载中…' })}
						</div>
					{:else if history.length === 0}
						<div class="py-5 text-center text-[11.5px] text-muted-foreground">
							{$_('admin.ops.alertEvents.detail.historyEmpty', { default: '暂无记录。' })}
						</div>
					{:else}
						<div class="overflow-hidden rounded-lg border border-border">
							<table class="w-full border-collapse text-[11.5px]">
								<thead class="border-b border-border bg-muted">
									<tr>
										<th class="px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
											{$_('admin.ops.alertEvents.table.time', { default: '时间' })}
										</th>
										<th class="px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
											{$_('admin.ops.alertEvents.table.status', { default: '状态' })}
										</th>
										<th class="px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
											{$_('admin.ops.alertEvents.table.metric', { default: '指标' })}
										</th>
									</tr>
								</thead>
								<tbody>
									{#each history as it (it.id)}
										<tr class="border-b border-border last:border-0">
											<td class="px-3 py-1.5 text-muted-foreground">
												{formatDateTime(it.fired_at || it.created_at)}
											</td>
											<td class="px-3 py-1.5">
												<Badge variant="outline" class={`border ${statusTone(it.status)}`}>
													{statusLabel(it.status)}
												</Badge>
											</td>
											<td class="px-3 py-1.5 text-muted-foreground">
												{#if typeof it.metric_value === 'number' && typeof it.threshold_value === 'number'}
													{it.metric_value.toFixed(2)} / {it.threshold_value.toFixed(2)}
												{:else}
													—
												{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</StandardDrawer>
