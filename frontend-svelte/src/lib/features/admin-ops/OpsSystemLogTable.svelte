<script lang="ts" module>
	/**
	 * OpsSystemLogTable · admin Ops 系统日志表（indexed system-logs section）
	 *
	 * Vue 参照：
	 *   - frontend/src/views/admin/ops/components/OpsSystemLogTable.vue（行/列/徽章/过滤器/清理语义）
	 *   - frontend/src/views/admin/ops/components/OpsRuntimeSettingsCard.vue（运行时日志配置那部分）
	 *
	 * 自洽 self-fetching 表：listOpsSystemLogs（level/component/request_id/q/time_range 过滤）
	 * + getOpsSystemLogSinkHealth（队列/写入/丢弃/失败健康徽章）
	 * + getOpsRuntimeLogConfig（内联运行时日志配置表单）。
	 * 清理按钮 → confirm StandardDialog → cleanupOpsSystemLogs(payload)。
	 * 运行时配置 inline form（level / sampling / caller / stacktrace_level / retention_days）
	 *   → updateOpsRuntimeLogConfig / resetOpsRuntimeLogConfig。
	 * refreshToken 变更 → 重拉 logs + health。
	 *
	 * 红线遵循：
	 *   - 仅复用 lib/ui/* primitives（Button / NativeSelect / Input / Checkbox / Card /
	 *     Badge / Alert / VirtualTable / StandardDialog），绝不手搓。
	 *   - 调色板只用 Zinc / 语义 token（bg-card / text-muted-foreground / border-border /
	 *     destructive / amber-500 …），无裸 hex。
	 *   - NativeSelect 一律 sentinel，禁空 value（level 用 __all__ 哨兵）；装配查询/清理
	 *     payload 时还原成后端键（__all__ → 不下发）。
	 *   - i18n 走 $_('admin.ops.<key>', { default }) ，default 兜底防硬编码英文 finding，
	 *     不改 locales/*.ts（避免 clobber）。
	 *   - 无 chart.js（本组件纯表格 + 表单，不引图表，规避 TDZ vendor-chunk 陷阱）。
	 *   - 页级 opsMonitoringEnabled gate 是 ROUTE 的职责（与 OpsHealthCard /
	 *     OpsAlertRulesCard 同约定）；本 section 不自带 feature-flag 读取。
	 *
	 * module 块导出纯函数供 co-located 测试直接验证，无需挂载组件。
	 */
	import type {
		OpsLogLevel,
		OpsRuntimeLogConfig,
		OpsStacktraceLevel,
		OpsSystemLog,
		OpsSystemLogCleanupRequest,
		OpsSystemLogQuery,
		OpsSystemLogTimeRange
	} from '$lib/api/admin/ops';

	// ── Filter sentinels（NativeSelect 禁空 value） ───────────────────────────────
	export const ALL = '__all__';

	export type LevelSentinel = string; // ALL | 'debug' | 'info' | 'warn' | 'error'

	export interface OpsSystemLogFilterState {
		time_range: OpsSystemLogTimeRange;
		start_time: string; // datetime-local 原始值
		end_time: string;
		level: LevelSentinel;
		component: string;
		request_id: string;
		client_request_id: string;
		user_id: string;
		account_id: string;
		platform: string;
		model: string;
		q: string;
	}

	export const TIME_RANGES: OpsSystemLogTimeRange[] = [
		'5m',
		'30m',
		'1h',
		'6h',
		'24h',
		'7d',
		'30d'
	];

	export const LOG_LEVELS: OpsLogLevel[] = ['debug', 'info', 'warn', 'error'];
	export const STACKTRACE_LEVELS: OpsStacktraceLevel[] = ['none', 'error', 'fatal'];

	export function defaultFilters(platform = ''): OpsSystemLogFilterState {
		return {
			time_range: '1h',
			start_time: '',
			end_time: '',
			level: ALL,
			component: '',
			request_id: '',
			client_request_id: '',
			user_id: '',
			account_id: '',
			platform: platform.trim(),
			model: '',
			q: ''
		};
	}

	export function defaultRuntimeConfig(): OpsRuntimeLogConfig {
		return {
			level: 'info',
			enable_sampling: false,
			sampling_initial: 100,
			sampling_thereafter: 100,
			caller: true,
			stacktrace_level: 'error',
			retention_days: 30
		};
	}

	/** datetime-local / ISO → RFC3339；无效或空返回 undefined。 */
	export function toRFC3339(value: string): string | undefined {
		if (!value) return undefined;
		const d = new Date(value);
		if (Number.isNaN(d.getTime())) return undefined;
		return d.toISOString();
	}

	/** 相对窗口（5m/30m/1h/6h/24h/7d/30d）→ 毫秒；未知返回 null。 */
	export function timeRangeToMs(r: string): number | null {
		const m: Record<string, number> = {
			'5m': 5 * 60_000,
			'30m': 30 * 60_000,
			'1h': 60 * 60_000,
			'6h': 6 * 60 * 60_000,
			'24h': 24 * 60 * 60_000,
			'7d': 7 * 24 * 60 * 60_000,
			'30d': 30 * 24 * 60 * 60_000
		};
		return m[r] ?? null;
	}

	function parsePositiveInt(raw: string): number | undefined {
		const t = raw.trim();
		if (!t) return undefined;
		const v = Number.parseInt(t, 10);
		return Number.isFinite(v) && v > 0 ? v : undefined;
	}

	/**
	 * 把 UI 过滤器（含 ALL 哨兵）还原成后端 OpsSystemLogQuery。
	 * 关键点：level === ALL → 不下发 level；空字段一律省略。
	 */
	export function buildLogQuery(opts: {
		filters: OpsSystemLogFilterState;
		page: number;
		pageSize: number;
	}): OpsSystemLogQuery {
		const { filters, page, pageSize } = opts;
		const q: OpsSystemLogQuery = {
			page,
			page_size: pageSize,
			time_range: filters.time_range
		};

		const start = toRFC3339(filters.start_time);
		const end = toRFC3339(filters.end_time);
		if (start) q.start_time = start;
		if (end) q.end_time = end;

		if (filters.level !== ALL && filters.level.trim()) q.level = filters.level.trim();
		if (filters.component.trim()) q.component = filters.component.trim();
		if (filters.request_id.trim()) q.request_id = filters.request_id.trim();
		if (filters.client_request_id.trim()) q.client_request_id = filters.client_request_id.trim();

		const userId = parsePositiveInt(filters.user_id);
		if (userId != null) q.user_id = userId;
		const accountId = parsePositiveInt(filters.account_id);
		if (accountId != null) q.account_id = accountId;

		if (filters.platform.trim()) q.platform = filters.platform.trim();
		if (filters.model.trim()) q.model = filters.model.trim();
		if (filters.q.trim()) q.q = filters.q.trim();
		return q;
	}

	/**
	 * 装配 cleanup payload。后端 cleanup endpoint 不认 time_range 字符串，只认绝对
	 * start_time/end_time；所以优先用用户显式填的绝对时间，都没填就把 time_range
	 * 推导成绝对窗口（[now-span, now]）。
	 * 返回 { payload, hasAny }：hasAny=false 时调用方应拒绝清理（防后端 400）。
	 */
	export function buildCleanupPayload(
		filters: OpsSystemLogFilterState,
		now: number = Date.now()
	): { payload: OpsSystemLogCleanupRequest; hasAny: boolean } {
		let startISO = toRFC3339(filters.start_time);
		let endISO = toRFC3339(filters.end_time);
		if (!startISO && !endISO) {
			const span = timeRangeToMs(filters.time_range);
			if (span != null) {
				startISO = new Date(now - span).toISOString();
				endISO = new Date(now).toISOString();
			}
		}

		const payload: OpsSystemLogCleanupRequest = {
			start_time: startISO,
			end_time: endISO,
			level: filters.level !== ALL && filters.level.trim() ? filters.level.trim() : undefined,
			component: filters.component.trim() || undefined,
			request_id: filters.request_id.trim() || undefined,
			client_request_id: filters.client_request_id.trim() || undefined,
			user_id: parsePositiveInt(filters.user_id),
			account_id: parsePositiveInt(filters.account_id),
			platform: filters.platform.trim() || undefined,
			model: filters.model.trim() || undefined,
			q: filters.q.trim() || undefined
		};

		const hasAny = Object.values(payload).some((v) => v !== undefined && v !== '');
		return { payload, hasAny };
	}

	/** level → 语义徽章 tone（无裸 hex，纯 token）。 */
	export function levelTone(level: string | undefined): string {
		const v = String(level ?? '').toLowerCase();
		if (v === 'error' || v === 'fatal')
			return 'border-destructive/35 bg-destructive/10 text-destructive';
		if (v === 'warn' || v === 'warning')
			return 'border-amber-500/35 bg-amber-500/10 text-amber-600';
		if (v === 'debug') return 'border-border bg-muted text-muted-foreground';
		return 'border-primary/35 bg-primary/10 text-primary';
	}

	/** ISO → 本地完整时间字符串。 */
	export function formatTime(value: string | undefined): string {
		if (!value) return '-';
		const d = new Date(value);
		if (Number.isNaN(d.getTime())) return value;
		return d.toLocaleString();
	}

	function extraString(extra: Record<string, unknown> | undefined, key: string): string {
		if (!extra) return '';
		const v = extra[key];
		if (v == null) return '';
		if (typeof v === 'string') return v.trim();
		if (typeof v === 'number' || typeof v === 'boolean') return String(v);
		return '';
	}

	/**
	 * 把一条日志拼成单行可读详情：message + access 字段 + 关联 id + 错误。
	 * 与 Vue formatSystemLogDetail 同语义，交给 CSS 自动换行。
	 */
	export function formatSystemLogDetail(row: OpsSystemLog): string {
		const parts: string[] = [];
		const msg = String(row.message ?? '').trim();
		if (msg) parts.push(msg);

		const extra = (row.extra ?? {}) as Record<string, unknown>;
		const accessParts: string[] = [];
		const statusCode = extraString(extra, 'status_code');
		const latencyMs = extraString(extra, 'latency_ms');
		const method = extraString(extra, 'method');
		const path = extraString(extra, 'path');
		const clientIP = extraString(extra, 'client_ip');
		const protocol = extraString(extra, 'protocol');
		if (statusCode) accessParts.push(`status=${statusCode}`);
		if (latencyMs) accessParts.push(`latency_ms=${latencyMs}`);
		if (method) accessParts.push(`method=${method}`);
		if (path) accessParts.push(`path=${path}`);
		if (clientIP) accessParts.push(`ip=${clientIP}`);
		if (protocol) accessParts.push(`proto=${protocol}`);
		if (accessParts.length > 0) parts.push(accessParts.join(' '));

		const corrParts: string[] = [];
		if (row.request_id) corrParts.push(`req=${row.request_id}`);
		if (row.client_request_id) corrParts.push(`client_req=${row.client_request_id}`);
		if (row.user_id != null) corrParts.push(`user=${row.user_id}`);
		if (row.account_id != null) corrParts.push(`acc=${row.account_id}`);
		if (row.platform) corrParts.push(`platform=${row.platform}`);
		if (row.model) corrParts.push(`model=${row.model}`);
		if (corrParts.length > 0) parts.push(corrParts.join(' '));

		const errors = extraString(extra, 'errors');
		if (errors) parts.push(`errors=${errors}`);
		const err = extraString(extra, 'err') || extraString(extra, 'error');
		if (err) parts.push(`error=${err}`);

		return parts.join('  ');
	}

	/** 数字输入归一为正整数，clamp 到 [min, max]。 */
	export function clampInt(value: number | string, min: number, max: number): number {
		const n =
			typeof value === 'number' ? value : Number.parseInt(String(value ?? '').trim(), 10);
		if (!Number.isFinite(n)) return min;
		return Math.min(max, Math.max(min, Math.trunc(n)));
	}
</script>

<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import {
		listOpsSystemLogs,
		getOpsSystemLogSinkHealth,
		cleanupOpsSystemLogs,
		getOpsRuntimeLogConfig,
		updateOpsRuntimeLogConfig,
		resetOpsRuntimeLogConfig,
		type OpsSystemLogSinkHealth
	} from '$lib/api/admin/ops';

	type Props = {
		platformFilter?: string;
		refreshToken?: number;
	};

	let { platformFilter = '', refreshToken = 0 }: Props = $props();

	const tr = (k: string, fallback: string) => $_(k, { default: fallback });

	// ── List state ─────────────────────────────────────────────────────────────
	let filters = $state<OpsSystemLogFilterState>(defaultFilters(platformFilter));
	let rows = $state<OpsSystemLog[]>([]);
	let total = $state(0);
	let page = $state(1);
	const pageSize = 20;
	let loading = $state(false);
	let error = $state<string | null>(null);

	const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)));

	// ── Sink health ──────────────────────────────────────────────────────────--
	let health = $state<OpsSystemLogSinkHealth>({
		queue_depth: 0,
		queue_capacity: 0,
		dropped_count: 0,
		write_failed_count: 0,
		written_count: 0,
		avg_write_delay_ms: 0
	});

	// ── Runtime log config ───────────────────────────────────────────────────--
	let runtime = $state(defaultRuntimeConfig());
	let runtimeLoading = $state(false);
	let runtimeSaving = $state(false);
	let runtimeError = $state<string | null>(null);
	let runtimeNotice = $state<string | null>(null);

	// ── Cleanup confirm dialog ────────────────────────────────────────────────-
	let cleanupOpen = $state(false);
	let cleanupBusy = $state(false);

	// ── refreshToken 触发重拉（首拉也走这里：token 初值会被 effect 读到一次） ───
	let lastRefreshToken = -1;
	$effect(() => {
		if (refreshToken !== lastRefreshToken) {
			lastRefreshToken = refreshToken;
			void fetchLogs();
			void fetchHealth();
		}
	});

	// 首次挂载：拉运行时配置一次。
	$effect(() => {
		void loadRuntime();
	});

	// platformFilter 后到（异步 app config）时，若用户尚未自定义 platform，则同步进过滤器并重拉。
	let appliedPlatform = platformFilter;
	$effect(() => {
		const next = platformFilter.trim();
		if (next && next !== appliedPlatform && !filters.platform) {
			appliedPlatform = next;
			filters.platform = next;
			page = 1;
			void fetchLogs();
		}
	});

	async function fetchLogs() {
		loading = true;
		error = null;
		try {
			const res = await listOpsSystemLogs(buildLogQuery({ filters, page, pageSize }));
			rows = res.items ?? [];
			total = res.total ?? 0;
		} catch (e) {
			rows = [];
			total = 0;
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	async function fetchHealth() {
		try {
			health = await getOpsSystemLogSinkHealth();
		} catch {
			// 健康指标读取失败不影响主流程，静默忽略。
		}
	}

	async function loadRuntime() {
		runtimeLoading = true;
		runtimeError = null;
		try {
			runtime = { ...defaultRuntimeConfig(), ...(await getOpsRuntimeLogConfig()) };
		} catch (e) {
			runtimeError = e instanceof Error ? e.message : String(e);
		} finally {
			runtimeLoading = false;
		}
	}

	async function saveRuntime() {
		runtimeSaving = true;
		runtimeError = null;
		runtimeNotice = null;
		try {
			runtime = {
				...runtime,
				...(await updateOpsRuntimeLogConfig({
					level: runtime.level,
					enable_sampling: runtime.enable_sampling,
					sampling_initial: clampInt(runtime.sampling_initial, 1, 1_000_000),
					sampling_thereafter: clampInt(runtime.sampling_thereafter, 1, 1_000_000),
					caller: runtime.caller,
					stacktrace_level: runtime.stacktrace_level,
					retention_days: clampInt(runtime.retention_days, 1, 3650)
				}))
			};
			runtimeNotice = tr('admin.ops.systemLog.runtimeSaved', 'Runtime log config applied');
		} catch (e) {
			runtimeError = e instanceof Error ? e.message : String(e);
		} finally {
			runtimeSaving = false;
		}
	}

	let resetConfirmOpen = $state(false);

	async function doResetRuntime() {
		resetConfirmOpen = false;
		runtimeSaving = true;
		runtimeError = null;
		runtimeNotice = null;
		try {
			runtime = { ...defaultRuntimeConfig(), ...(await resetOpsRuntimeLogConfig()) };
			runtimeNotice = tr(
				'admin.ops.systemLog.runtimeReset',
				'Reverted to startup log config'
			);
			await fetchHealth();
		} catch (e) {
			runtimeError = e instanceof Error ? e.message : String(e);
		} finally {
			runtimeSaving = false;
		}
	}

	// ── Filters apply / reset ─────────────────────────────────────────────────-
	function applyFilters() {
		page = 1;
		void fetchLogs();
	}

	function resetFilters() {
		filters = defaultFilters(platformFilter);
		appliedPlatform = platformFilter;
		page = 1;
		void fetchLogs();
	}

	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	function onSearchInput() {
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			page = 1;
			void fetchLogs();
		}, 350);
	}
	function onSearchEnter() {
		if (searchTimer) {
			clearTimeout(searchTimer);
			searchTimer = null;
		}
		page = 1;
		void fetchLogs();
	}

	function prevPage() {
		if (page > 1) {
			page -= 1;
			void fetchLogs();
		}
	}
	function nextPage() {
		if (page < totalPages) {
			page += 1;
			void fetchLogs();
		}
	}

	// ── Cleanup ───────────────────────────────────────────────────────────────-
	function openCleanup() {
		error = null;
		cleanupOpen = true;
	}

	async function confirmCleanup() {
		const { payload, hasAny } = buildCleanupPayload(filters);
		if (!hasAny) {
			cleanupOpen = false;
			error = tr(
				'admin.ops.systemLog.cleanupNeedsFilter',
				'At least one filter is required to clean up logs'
			);
			return;
		}
		cleanupBusy = true;
		try {
			const res = await cleanupOpsSystemLogs(payload);
			cleanupOpen = false;
			error = null;
			runtimeNotice = $_('admin.ops.systemLog.cleanupDone', {
				default: '清理完成，已删除 {n} 条日志',
				values: { n: res.deleted ?? 0 }
			});
			page = 1;
			await Promise.all([fetchLogs(), fetchHealth()]);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			cleanupBusy = false;
		}
	}

	// ── Select options（全部哨兵，禁空 value） ─────────────────────────────────--
	const timeRangeOptions = $derived(TIME_RANGES.map((v) => ({ value: v, label: v })));
	const levelFilterOptions = $derived([
		{ value: ALL, label: tr('common.all', 'All') },
		...LOG_LEVELS.map((v) => ({ value: v, label: v }))
	]);
	const runtimeLevelOptions = $derived(LOG_LEVELS.map((v) => ({ value: v, label: v })));
	const stacktraceOptions = $derived(STACKTRACE_LEVELS.map((v) => ({ value: v, label: v })));
</script>

<Card padded={false} class="p-5" data-testid="ops-system-log-table">
	<!-- Header + sink health -->
	<div class="mb-4 flex flex-wrap items-center justify-between gap-2.5">
		<div>
			<h3 class="text-sm font-bold text-foreground">
				{tr('admin.ops.systemLog.title', 'System logs')}
			</h3>
			<p class="mt-0.5 text-[11.5px] text-muted-foreground">
				{tr(
					'admin.ops.systemLog.subtitle',
					'Newest first; supports filtering, search and conditional cleanup.'
				)}
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-1.5 text-[11.5px]">
			<Badge variant="outline" class="text-muted-foreground">
				{tr('admin.ops.systemLog.queue', 'Queue')}
				{health.queue_depth}/{health.queue_capacity}
			</Badge>
			<Badge variant="outline" class="text-muted-foreground">
				{tr('admin.ops.systemLog.written', 'Written')}
				{health.written_count}
			</Badge>
			<Badge variant="outline" class="border-amber-500/35 bg-amber-500/10 text-amber-600">
				{tr('admin.ops.systemLog.dropped', 'Dropped')}
				{health.dropped_count}
			</Badge>
			<Badge variant="outline" class="border-destructive/35 bg-destructive/10 text-destructive">
				{tr('admin.ops.systemLog.failed', 'Failed')}
				{health.write_failed_count}
			</Badge>
		</div>
	</div>

	<!-- Runtime log config (inline form) -->
	<div class="mb-4 rounded-xl border border-border bg-muted/30 p-3">
		<div class="mb-2 flex items-center justify-between">
			<div class="text-[11.5px] font-semibold text-muted-foreground">
				{tr('admin.ops.systemLog.runtimeTitle', 'Runtime log config (live)')}
			</div>
			{#if runtimeLoading}
				<span class="text-[11px] text-muted-foreground">{tr('common.loading', 'Loading…')}</span>
			{/if}
		</div>

		<div class="grid gap-2.5" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr));">
			<label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
				{tr('admin.ops.systemLog.level', 'Level')}
				<NativeSelect
					bind:value={runtime.level}
					options={runtimeLevelOptions}
					class="h-8 text-xs"
				/>
			</label>
			<label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
				{tr('admin.ops.systemLog.stacktraceLevel', 'Stacktrace level')}
				<NativeSelect
					bind:value={runtime.stacktrace_level}
					options={stacktraceOptions}
					class="h-8 text-xs"
				/>
			</label>
			<label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
				{tr('admin.ops.systemLog.samplingInitial', 'Sampling initial')}
				<Input bind:value={runtime.sampling_initial} type="number" min="1" class="h-8 text-xs" />
			</label>
			<label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
				{tr('admin.ops.systemLog.samplingThereafter', 'Sampling thereafter')}
				<Input
					bind:value={runtime.sampling_thereafter}
					type="number"
					min="1"
					class="h-8 text-xs"
				/>
			</label>
			<label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
				{tr('admin.ops.systemLog.retentionDays', 'Retention days')}
				<Input
					bind:value={runtime.retention_days}
					type="number"
					min="1"
					max="3650"
					class="h-8 text-xs"
				/>
			</label>
		</div>

		<div class="mt-2.5 flex flex-wrap items-center justify-between gap-2.5">
			<div class="flex flex-wrap gap-3.5">
				<label
					class="inline-flex cursor-pointer items-center gap-1.5 text-[11.5px] text-muted-foreground"
				>
					<Checkbox bind:checked={runtime.caller} />
					{tr('admin.ops.systemLog.caller', 'caller')}
				</label>
				<label
					class="inline-flex cursor-pointer items-center gap-1.5 text-[11.5px] text-muted-foreground"
				>
					<Checkbox bind:checked={runtime.enable_sampling} />
					{tr('admin.ops.systemLog.sampling', 'sampling')}
				</label>
			</div>
			<div class="flex flex-wrap gap-1.5">
				<Button
					variant="outline"
					size="sm"
					class="h-7 border-primary/35 bg-primary/10 px-3 text-[11px] text-primary hover:bg-primary/20"
					disabled={runtimeSaving}
					onclick={saveRuntime}
				>
					{runtimeSaving
						? tr('common.saving', 'Saving…')
						: tr('admin.ops.systemLog.saveRuntime', 'Save & apply')}
				</Button>
				<Button
					variant="outline"
					size="sm"
					class="h-7 px-2.5 text-[11px]"
					disabled={runtimeSaving}
					onclick={() => (resetConfirmOpen = true)}
				>
					{tr('admin.ops.systemLog.resetRuntime', 'Reset to default')}
				</Button>
			</div>
		</div>

		{#if runtimeError}
			<p class="mt-1.5 text-[11px] text-destructive">
				{tr('admin.ops.systemLog.runtimeError', 'Runtime log config error')}: {runtimeError}
			</p>
		{/if}
		{#if runtimeNotice}
			<p class="mt-1.5 text-[11px] text-primary">{runtimeNotice}</p>
		{/if}
		{#if health.last_error}
			<p class="mt-1.5 text-[11px] text-destructive">
				{tr('admin.ops.systemLog.lastWriteError', 'Last write error')}: {health.last_error}
			</p>
		{/if}
	</div>

	<!-- Filters -->
	<div class="mb-3 grid gap-2.5" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr));">
		<label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
			{tr('admin.ops.systemLog.timeRange', 'Time range')}
			<NativeSelect
				bind:value={filters.time_range}
				options={timeRangeOptions}
				class="h-8 text-xs"
				onchange={applyFilters}
			/>
		</label>
		<label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
			{tr('admin.ops.systemLog.startTime', 'Start time (optional)')}
			<Input bind:value={filters.start_time} type="datetime-local" class="h-8 text-xs" />
		</label>
		<label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
			{tr('admin.ops.systemLog.endTime', 'End time (optional)')}
			<Input bind:value={filters.end_time} type="datetime-local" class="h-8 text-xs" />
		</label>
		<label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
			{tr('admin.ops.systemLog.level', 'Level')}
			<NativeSelect
				bind:value={filters.level}
				options={levelFilterOptions}
				class="h-8 text-xs"
				onchange={applyFilters}
			/>
		</label>
		<label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
			{tr('admin.ops.systemLog.component', 'Component')}
			<Input
				bind:value={filters.component}
				type="text"
				placeholder={tr('admin.ops.systemLog.componentPlaceholder', 'e.g. http.access')}
				class="h-8 text-xs"
				oninput={onSearchInput}
				onkeydown={(e: KeyboardEvent) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						onSearchEnter();
					}
				}}
			/>
		</label>
		<label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
			{tr('admin.ops.systemLog.requestId', 'request_id')}
			<Input
				bind:value={filters.request_id}
				type="text"
				class="h-8 text-xs"
				oninput={onSearchInput}
				onkeydown={(e: KeyboardEvent) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						onSearchEnter();
					}
				}}
			/>
		</label>
		<label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
			{tr('admin.ops.systemLog.clientRequestId', 'client_request_id')}
			<Input bind:value={filters.client_request_id} type="text" class="h-8 text-xs" />
		</label>
		<label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
			{tr('admin.ops.systemLog.userId', 'user_id')}
			<Input bind:value={filters.user_id} type="text" class="h-8 text-xs" />
		</label>
		<label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
			{tr('admin.ops.systemLog.accountId', 'account_id')}
			<Input bind:value={filters.account_id} type="text" class="h-8 text-xs" />
		</label>
		<label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
			{tr('admin.ops.systemLog.platform', 'Platform')}
			<Input bind:value={filters.platform} type="text" class="h-8 text-xs" />
		</label>
		<label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
			{tr('admin.ops.systemLog.model', 'Model')}
			<Input bind:value={filters.model} type="text" class="h-8 text-xs" />
		</label>
		<label class="flex flex-col gap-1 text-[12.5px] font-medium text-muted-foreground">
			{tr('admin.ops.systemLog.keyword', 'Keyword')}
			<Input
				bind:value={filters.q}
				type="text"
				placeholder={tr('admin.ops.systemLog.keywordPlaceholder', 'message / request_id')}
				class="h-8 text-xs"
				oninput={onSearchInput}
				onkeydown={(e: KeyboardEvent) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						onSearchEnter();
					}
				}}
			/>
		</label>
	</div>

	<!-- Action row -->
	<div class="mb-3 flex flex-wrap gap-1.5">
		<Button
			variant="outline"
			size="sm"
			class="h-7 border-primary/35 bg-primary/10 px-3 text-[11px] text-primary hover:bg-primary/20"
			onclick={applyFilters}
		>
			{tr('admin.ops.systemLog.query', 'Query')}
		</Button>
		<Button variant="outline" size="sm" class="h-7 px-2.5 text-[11px]" onclick={resetFilters}>
			{tr('admin.ops.systemLog.reset', 'Reset')}
		</Button>
		<Button
			variant="outline"
			size="sm"
			class="h-7 border-destructive/25 px-2.5 text-[11px] text-destructive hover:border-destructive/50 hover:bg-destructive/10"
			onclick={openCleanup}
		>
			{tr('admin.ops.systemLog.cleanup', 'Clean up by filter')}
		</Button>
		<Button variant="outline" size="sm" class="h-7 px-2.5 text-[11px]" onclick={fetchHealth}>
			{tr('admin.ops.systemLog.refreshHealth', 'Refresh health')}
		</Button>
	</div>

	{#if error}
		<Alert variant="destructive" class="mb-3">
			{tr('admin.ops.systemLog.loadFailed', 'Failed to load system logs')}: {error}
		</Alert>
	{/if}

	<!-- Log table -->
	<div class="h-[480px] overflow-hidden rounded-xl border border-border bg-card">
		<VirtualTable {rows} {loading} rowHeight={56} class="h-full" getRowKey={(r) => r.id}>
			{#snippet header()}
				<div
					class="grid grid-cols-[180px_80px_minmax(200px,1fr)] items-center gap-2 border-b border-border bg-muted px-3 py-2 text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground"
				>
					<span>{tr('admin.ops.systemLog.time', 'Time')}</span>
					<span>{tr('admin.ops.systemLog.levelCol', 'Level')}</span>
					<span>{tr('admin.ops.systemLog.detail', 'Detail')}</span>
				</div>
			{/snippet}

			{#snippet row({ row: log })}
				<div
					class="grid grid-cols-[180px_80px_minmax(200px,1fr)] items-start gap-2 border-b border-border px-3 py-2 text-[11.5px]"
				>
					<span class="font-mono tabular-nums text-[11px] text-muted-foreground">
						{formatTime(log.created_at)}
					</span>
					<span>
						<span
							class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold {levelTone(
								log.level
							)}"
						>
							{log.level}
						</span>
					</span>
					<span class="break-all text-[11.5px] text-muted-foreground">
						{formatSystemLogDetail(log)}
					</span>
				</div>
			{/snippet}

			{#snippet empty()}
				<div class="px-6 py-10 text-center text-sm text-muted-foreground">
					{tr('admin.ops.systemLog.empty', 'No system logs')}
				</div>
			{/snippet}
		</VirtualTable>
	</div>

	<!-- Pagination -->
	<div class="mt-3 flex items-center justify-between text-xs text-muted-foreground">
		<span>{tr('admin.ops.systemLog.total', 'Total')}: {total}</span>
		<div class="flex items-center gap-2">
			<Button
				variant="outline"
				size="sm"
				class="h-8"
				disabled={page <= 1 || loading}
				onclick={prevPage}
			>
				{tr('common.prev', 'Prev')}
			</Button>
			<span class="tabular-nums">{page} / {totalPages}</span>
			<Button
				variant="outline"
				size="sm"
				class="h-8"
				disabled={page >= totalPages || loading}
				onclick={nextPage}
			>
				{tr('common.next', 'Next')}
			</Button>
		</div>
	</div>
</Card>

<!-- Cleanup confirm dialog -->
<StandardDialog
	bind:open={cleanupOpen}
	width="sm"
	title={tr('admin.ops.systemLog.cleanupConfirmTitle', 'Clean up system logs')}
	description={tr(
		'admin.ops.systemLog.cleanupConfirmDesc',
		'Delete system logs matching the current filters? This cannot be undone.'
	)}
	data-testid="ops-system-log-cleanup-dialog"
>
	<div class="mt-4 flex justify-end gap-2">
		<Button variant="outline" size="sm" disabled={cleanupBusy} onclick={() => (cleanupOpen = false)}>
			{tr('common.cancel', 'Cancel')}
		</Button>
		<Button
			variant="outline"
			size="sm"
			class="border-destructive/35 bg-destructive/10 text-destructive hover:bg-destructive/20"
			disabled={cleanupBusy}
			onclick={confirmCleanup}
		>
			{cleanupBusy
				? tr('common.processing', 'Processing…')
				: tr('admin.ops.systemLog.cleanupConfirm', 'Confirm cleanup')}
		</Button>
	</div>
</StandardDialog>

<!-- Reset runtime confirm dialog -->
<StandardDialog
	bind:open={resetConfirmOpen}
	width="sm"
	title={tr('admin.ops.systemLog.resetConfirmTitle', 'Reset runtime log config')}
	description={tr(
		'admin.ops.systemLog.resetConfirmDesc',
		'Roll back to the startup config (env/yaml) and apply immediately?'
	)}
	data-testid="ops-system-log-reset-dialog"
>
	<div class="mt-4 flex justify-end gap-2">
		<Button
			variant="outline"
			size="sm"
			disabled={runtimeSaving}
			onclick={() => (resetConfirmOpen = false)}
		>
			{tr('common.cancel', 'Cancel')}
		</Button>
		<Button variant="outline" size="sm" disabled={runtimeSaving} onclick={doResetRuntime}>
			{tr('admin.ops.systemLog.resetConfirm', 'Confirm reset')}
		</Button>
	</div>
</StandardDialog>
