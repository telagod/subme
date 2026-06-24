<script lang="ts" module>
	// Preset shape for opening the request-details drawer/modal from the filter bar.
	// Owned here until the sibling OpsRequestDetailsModal lands; re-export from there
	// later if you want a single source. Kept loose on purpose (preset is a hint).
	export type OpsRequestDetailsPreset = {
		platform?: string;
		groupId?: number | null;
		timeRange?: string;
		statusClass?: 'request' | 'upstream' | 'all';
	};
</script>

<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { onDestroy } from 'svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import { listAllGroups, type AdminGroup } from '$lib/api/admin/groups';
	import {
		getOpsRealtimeTraffic,
		type OpsDashboardOverview,
		type OpsQueryMode,
		type OpsRealtimeTrafficSummary
	} from '$lib/api/admin/ops';

	// Sentinels: NativeSelect forbids empty value. '' platform <-> '__all__' option.
	const PLATFORM_ALL = '__all__';
	const GROUP_ALL = '__all__';

	type TimeRange = '5m' | '30m' | '1h' | '6h' | '24h' | 'custom';

	type Props = {
		overview: OpsDashboardOverview | null;
		platform: string;
		groupId: number | null;
		timeRange: TimeRange;
		queryMode: OpsQueryMode;
		loading: boolean;
		lastUpdated: Date | null;
		autoRefreshEnabled?: boolean;
		autoRefreshCountdown?: number;
		customStartTime?: string | null;
		customEndTime?: string | null;
		onPlatformChange: (v: string) => void;
		onGroupChange: (v: number | null) => void;
		onTimeRangeChange: (v: string) => void;
		onQueryModeChange: (v: OpsQueryMode) => void;
		onCustomTimeRange: (start: string, end: string) => void;
		onRefresh: () => void;
		onOpenSettings: () => void;
		onOpenAlertRules: () => void;
		onOpenRequestDetails: (preset?: OpsRequestDetailsPreset) => void;
	};

	let {
		overview,
		platform,
		groupId,
		timeRange,
		queryMode,
		loading,
		lastUpdated,
		autoRefreshEnabled = false,
		autoRefreshCountdown,
		customStartTime = null,
		customEndTime = null,
		onPlatformChange,
		onGroupChange,
		onTimeRangeChange,
		onQueryModeChange,
		onCustomTimeRange,
		onRefresh,
		onOpenSettings,
		onOpenAlertRules,
		onOpenRequestDetails
	}: Props = $props();

	// ── Platform / group / time-range / query-mode select bindings ──────────────

	// Bound to NativeSelect (must be non-empty). Map sentinel <-> '' on change.
	let platformSelect = $derived(platform === '' ? PLATFORM_ALL : platform);
	let groupSelect = $derived(groupId == null ? GROUP_ALL : String(groupId));

	function handlePlatformChange(v: string) {
		onPlatformChange(v === PLATFORM_ALL ? '' : v);
	}

	function handleGroupChange(v: string) {
		if (v === GROUP_ALL) {
			onGroupChange(null);
			return;
		}
		const id = Number.parseInt(v, 10);
		onGroupChange(Number.isFinite(id) && id > 0 ? id : null);
	}

	function handleQueryModeChange(v: string) {
		onQueryModeChange((v as OpsQueryMode) || 'auto');
	}

	function handleTimeRangeChange(v: string) {
		if (v === 'custom') {
			// Seed custom inputs with existing range, else last hour.
			const now = new Date();
			const start = customStartTime
				? toLocalInput(customStartTime)
				: toLocalInput(new Date(now.getTime() - 60 * 60 * 1000).toISOString());
			const end = customEndTime ? toLocalInput(customEndTime) : toLocalInput(now.toISOString());
			customStartInput = start;
			customEndInput = end;
			customError = '';
			customOpen = true;
			return;
		}
		onTimeRangeChange(v);
	}

	const platformOptions = $derived([
		{ value: PLATFORM_ALL, label: $_('common.all', { default: '全部' }) },
		{ value: 'openai', label: 'OpenAI' },
		{ value: 'anthropic', label: 'Anthropic' },
		{ value: 'gemini', label: 'Gemini' },
		{ value: 'antigravity', label: 'Antigravity' }
	]);

	const queryModeOptions = $derived([
		{ value: 'auto', label: $_('admin.ops.queryMode.auto', { default: '自动' }) },
		{ value: 'raw', label: $_('admin.ops.queryMode.raw', { default: '原始' }) },
		{ value: 'preagg', label: $_('admin.ops.queryMode.preagg', { default: '预聚合' }) }
	]);

	const timeRangeOptions = $derived([
		{ value: '5m', label: $_('admin.ops.timeRange.5m', { default: '5m' }) },
		{ value: '30m', label: $_('admin.ops.timeRange.30m', { default: '30m' }) },
		{ value: '1h', label: $_('admin.ops.timeRange.1h', { default: '1h' }) },
		{ value: '6h', label: $_('admin.ops.timeRange.6h', { default: '6h' }) },
		{ value: '24h', label: $_('admin.ops.timeRange.24h', { default: '24h' }) },
		{
			value: 'custom',
			label:
				timeRange === 'custom' && customStartTime && customEndTime
					? `${$_('admin.ops.timeRange.custom', { default: '自定义' })} (${formatCustomLabel(customStartTime, customEndTime)})`
					: $_('admin.ops.timeRange.custom', { default: '自定义' })
		}
	]);

	// ── Groups (self-loaded, filtered by platform) ──────────────────────────────

	let groups = $state<AdminGroup[]>([]);
	let groupsError = $state(false);

	async function loadGroups() {
		try {
			groupsError = false;
			groups = (await listAllGroups()) ?? [];
		} catch (err) {
			console.error('[OpsFilterBar] failed to load groups', err);
			groups = [];
			groupsError = true;
		}
	}

	const groupOptions = $derived.by(() => {
		const filtered = platform ? groups.filter((g) => g.platform === platform) : groups;
		return [
			{ value: GROUP_ALL, label: $_('common.all', { default: '全部' }) },
			...filtered.map((g) => ({ value: String(g.id), label: g.name }))
		];
	});

	// If the selected group no longer belongs to the active platform, clear it.
	$effect(() => {
		if (!platform || groupId == null) return;
		const current = groups.find((g) => g.id === groupId);
		if (current && current.platform !== platform) {
			onGroupChange(null);
		}
	});

	loadGroups();

	// ── Custom time range popover ───────────────────────────────────────────────

	let customOpen = $state(false);
	let customStartInput = $state('');
	let customEndInput = $state('');
	let customError = $state('');

	// '2026-06-20T13:45:00Z' -> 'YYYY-MM-DDTHH:mm' for <input type=datetime-local>.
	function toLocalInput(iso: string): string {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '';
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	function formatCustomLabel(startIso: string, endIso: string): string {
		const fmt = (iso: string) => {
			const d = new Date(iso);
			if (Number.isNaN(d.getTime())) return '?';
			const pad = (n: number) => String(n).padStart(2, '0');
			return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
		};
		return `${fmt(startIso)} ~ ${fmt(endIso)}`;
	}

	function confirmCustom() {
		if (!customStartInput || !customEndInput) {
			customError = $_('admin.ops.customTimeRange.required', {
				default: '开始和结束时间均为必填。'
			});
			return;
		}
		const startMs = new Date(customStartInput).getTime();
		const endMs = new Date(customEndInput).getTime();
		if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
			customError = $_('admin.ops.customTimeRange.invalid', { default: '日期无效。' });
			return;
		}
		if (startMs >= endMs) {
			customError = $_('admin.ops.customTimeRange.order', {
				default: '开始时间必须早于结束时间。'
			});
			return;
		}
		// Emit custom range first so the parent can build correct params when it
		// reacts to the timeRange flip to 'custom'.
		onCustomTimeRange(new Date(startMs).toISOString(), new Date(endMs).toISOString());
		onTimeRangeChange('custom');
		customOpen = false;
	}

	function cancelCustom() {
		customOpen = false;
	}

	// ── Status / timestamp labels ───────────────────────────────────────────────

	const lastUpdatedLabel = $derived.by(() => {
		if (!lastUpdated) return $_('common.unknown', { default: '未知' });
		const pad = (n: number) => String(n).padStart(2, '0');
		const d = lastUpdated;
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
	});

	// ── Optional realtime QPS/TPS mini-readout ──────────────────────────────────
	// Polls the realtime-traffic endpoint on the parent's refresh cadence. The
	// endpoint self-reports enabled=false when ops realtime monitoring is off, in
	// which case we stop polling and hide the readout (no WS, no fullscreen here).

	let realtime = $state<OpsRealtimeTrafficSummary | null>(null);
	let realtimeEnabled = $state(true);
	let realtimeLoading = false;

	function num(v: number | undefined | null): number {
		return typeof v === 'number' && Number.isFinite(v) ? v : 0;
	}

	const qpsLabel = $derived(num(realtime?.qps?.current).toFixed(1));
	const tpsLabel = $derived(num(realtime?.tps?.current).toFixed(0));

	async function loadRealtime() {
		if (realtimeLoading || !realtimeEnabled) return;
		realtimeLoading = true;
		try {
			const res = await getOpsRealtimeTraffic({
				window: '1m',
				platform: platform || undefined,
				group_id: groupId == null ? undefined : groupId
			});
			if (res?.enabled === false) {
				realtimeEnabled = false;
				realtime = null;
				return;
			}
			realtime = res?.summary ?? null;
		} catch (err) {
			console.error('[OpsFilterBar] failed to load realtime traffic', err);
			realtime = null;
		} finally {
			realtimeLoading = false;
		}
	}

	// Refresh realtime when filters change.
	$effect(() => {
		// Touch deps so the effect re-runs on filter changes.
		void platform;
		void groupId;
		if (realtimeEnabled) loadRealtime();
	});

	// Follow the parent refresh cadence: reload when the countdown hits its boundary.
	let lastCountdown = $state<number | undefined>(undefined);
	$effect(() => {
		const c = autoRefreshCountdown;
		if (autoRefreshEnabled && !loading && c === 0 && lastCountdown !== 0) {
			loadRealtime();
		}
		lastCountdown = c;
	});

	onDestroy(() => {
		realtimeLoading = false;
	});
</script>

<section
	class="rounded-xl border border-border bg-card p-5"
	data-testid="ops-filter-bar"
	aria-label={$_('admin.ops.title', { default: '运维监控' })}
>
	<div class="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
		<!-- Title + status line -->
		<div>
			<h1 class="m-0 flex items-center gap-2 text-lg font-extrabold tracking-tight text-foreground">
				<svg
					class="shrink-0 text-foreground"
					width="22"
					height="22"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
					/>
				</svg>
				{$_('admin.ops.title', { default: '运维监控' })}
			</h1>

			<div class="mt-1 flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground">
				<span class="inline-flex items-center gap-1.5">
					<span
						class="inline-block h-[7px] w-[7px] shrink-0 rounded-full {loading
							? 'bg-muted-foreground'
							: 'bg-foreground'}"
						aria-hidden="true"
					></span>
					{loading
						? $_('admin.ops.loadingText', { default: '加载中…' })
						: $_('admin.ops.ready', { default: '就绪' })}
				</span>
				<span aria-hidden="true">·</span>
				<span data-testid="ops-last-updated">
					{$_('common.refresh', { default: '刷新' })}: {lastUpdatedLabel}
				</span>
				{#if autoRefreshEnabled && autoRefreshCountdown !== undefined}
					<span aria-hidden="true">·</span>
					<Badge variant="outline" data-testid="ops-auto-refresh-countdown">
						{$_('admin.ops.autoRefreshIn', {
							default: '{n}s',
							values: { n: autoRefreshCountdown }
						})}
					</Badge>
				{/if}
				{#if realtimeEnabled && realtime}
					<span aria-hidden="true">·</span>
					<span class="font-mono tabular-nums" data-testid="ops-realtime-readout">
						QPS {qpsLabel} · TPS {tpsLabel}
					</span>
				{/if}
			</div>
		</div>

		<!-- Filters + actions -->
		<div class="flex flex-wrap items-center gap-2.5">
			<NativeSelect
				value={platformSelect}
				options={platformOptions}
				class="w-full sm:w-[140px]"
				aria-label={$_('admin.ops.filter.platform', { default: '平台' })}
				data-testid="ops-platform-select"
				onchange={(e) => handlePlatformChange((e.currentTarget as HTMLSelectElement).value)}
			/>

			<NativeSelect
				value={groupSelect}
				options={groupOptions}
				class="w-full sm:w-[160px]"
				disabled={groupsError}
				aria-label={$_('admin.ops.filter.group', { default: '分组' })}
				data-testid="ops-group-select"
				onchange={(e) => handleGroupChange((e.currentTarget as HTMLSelectElement).value)}
			/>

			<NativeSelect
				value={queryMode}
				options={queryModeOptions}
				class="w-full sm:w-[150px]"
				aria-label={$_('admin.ops.filter.queryMode', { default: '查询模式' })}
				data-testid="ops-query-mode-select"
				onchange={(e) => handleQueryModeChange((e.currentTarget as HTMLSelectElement).value)}
			/>

			<NativeSelect
				value={timeRange}
				options={timeRangeOptions}
				class="w-full sm:w-[170px]"
				aria-label={$_('admin.ops.filter.timeRange', { default: '时间范围' })}
				data-testid="ops-time-range-select"
				onchange={(e) => handleTimeRangeChange((e.currentTarget as HTMLSelectElement).value)}
			/>

			<Button
				variant="outline"
				size="icon"
				disabled={loading}
				title={$_('common.refresh', { default: '刷新' })}
				aria-label={$_('common.refresh', { default: '刷新' })}
				data-testid="ops-refresh-btn"
				onclick={onRefresh}
			>
				<svg
					width="15"
					height="15"
					class={loading ? 'animate-spin' : ''}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
					/>
				</svg>
			</Button>

			<div class="h-4 w-px shrink-0 bg-border" aria-hidden="true"></div>

			<Button
				variant="outline"
				size="sm"
				title={$_('admin.ops.requestDetails.title', { default: '请求详情' })}
				data-testid="ops-open-request-details-btn"
				onclick={() => onOpenRequestDetails()}
			>
				{$_('admin.ops.requestDetails.details', { default: '详情' })}
			</Button>

			<Button
				variant="outline"
				size="sm"
				title={$_('admin.ops.alertRules.title', { default: '告警规则' })}
				data-testid="ops-open-alert-rules-btn"
				onclick={onOpenAlertRules}
			>
				<svg
					width="14"
					height="14"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
					/>
				</svg>
				<span>{$_('admin.ops.alertRules.manage', { default: '告警规则' })}</span>
			</Button>

			<Button
				variant="outline"
				size="sm"
				title={$_('admin.ops.settings.title', { default: '设置' })}
				data-testid="ops-open-settings-btn"
				onclick={onOpenSettings}
			>
				<svg
					width="14"
					height="14"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
					/>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
					/>
				</svg>
				<span>{$_('common.settings', { default: '设置' })}</span>
			</Button>
		</div>
	</div>
</section>

<!-- Custom time range popover -->
<StandardDialog
	bind:open={customOpen}
	width="sm"
	title={$_('admin.ops.timeRange.custom', { default: '自定义时间范围' })}
	data-testid="ops-custom-time-dialog"
>
	<div class="mt-4 flex flex-col gap-3.5">
		<div>
			<label
				class="mb-1 block text-sm text-muted-foreground"
				for="ops-custom-start"
			>
				{$_('admin.ops.customTimeRange.startTime', { default: '开始时间' })}
			</label>
			<Input id="ops-custom-start" type="datetime-local" bind:value={customStartInput} />
		</div>
		<div>
			<label class="mb-1 block text-sm text-muted-foreground" for="ops-custom-end">
				{$_('admin.ops.customTimeRange.endTime', { default: '结束时间' })}
			</label>
			<Input id="ops-custom-end" type="datetime-local" bind:value={customEndInput} />
		</div>
		{#if customError}
			<p class="text-sm text-destructive" data-testid="ops-custom-time-error">{customError}</p>
		{/if}
		<div class="flex justify-end gap-2 pt-1.5">
			<Button variant="outline" size="sm" onclick={cancelCustom}>
				{$_('common.cancel', { default: '取消' })}
			</Button>
			<Button size="sm" data-testid="ops-custom-time-confirm" onclick={confirmCustom}>
				{$_('common.confirm', { default: '确认' })}
			</Button>
		</div>
	</div>
</StandardDialog>
