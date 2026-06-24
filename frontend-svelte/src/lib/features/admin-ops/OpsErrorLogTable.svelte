<script lang="ts" module>
	/**
	 * OpsErrorLogTable · admin Ops 错误日志表（Phase C M13）
	 *
	 * Vue 参照：
	 *   - frontend/src/views/admin/ops/components/OpsErrorLogTable.vue（行/列/徽章语义）
	 *   - frontend/src/views/admin/ops/components/OpsErrorDetailsModal.vue（过滤器 + fetch 参数装配）
	 *
	 * 自洽 reusable 表：按 errorType 调 listOpsRequestErrors / listOpsUpstreamErrors，
	 * 过滤器（status_codes / view / resolved / q / model）+ 分页，行点击 emit
	 * onOpenErrorDetail，行内 resolve → resolveOps*Error → refetch。
	 *
	 * 红线遵循：
	 *   - 仅复用 lib/ui/* primitives（Button / NativeSelect / Input / VirtualTable / Badge / Alert），不手搓。
	 *   - 调色板只用 Zinc / 语义 token（bg-card / text-muted-foreground / border-border …），无裸 hex。
	 *   - NativeSelect 一律 sentinel，禁空 value（__all__ 等）；查询装配时还原成后端键。
	 *   - i18n 走 $_('admin.ops.<key>', { default }) ，default 兜底防硬编码英文 finding。
	 *   - 无 chart.js（本组件纯表格，不引图表，规避 TDZ vendor-chunk 陷阱）。
	 *
	 * module 块导出纯函数供 co-located 测试直接验证，无需挂载组件。
	 */

	// ── Filter sentinels（NativeSelect 禁空 value） ───────────────────────────────
	export const ALL = '__all__';

	export type StatusSentinel = string; // ALL | '400'..'529' | 'other'
	export type ResolvedSentinel = string; // ALL | 'true' | 'false'
	export type ViewSentinel = 'errors' | 'excluded' | 'all';

	export interface OpsErrorFilterState {
		q: string;
		model: string;
		status: StatusSentinel;
		resolved: ResolvedSentinel;
		view: ViewSentinel;
	}

	/** 已知 status code 选项（与 Vue 参照一致），外加 ALL + other 哨兵。 */
	export const STATUS_CODES = [400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504, 529];

	export function defaultFilters(): OpsErrorFilterState {
		return { q: '', model: '', status: ALL, resolved: ALL, view: 'errors' };
	}

	/**
	 * 把 UI 过滤器哨兵还原成后端 OpsErrorListQueryParams。
	 * 关键点：ALL 哨兵 → 不下发该键；'other' → status_codes_other=true。
	 */
	export function buildErrorQueryParams(opts: {
		filters: OpsErrorFilterState;
		page: number;
		pageSize: number;
		timeRange: string;
		platform?: string;
		groupId?: number | null;
	}): Record<string, unknown> {
		const { filters, page, pageSize, timeRange, platform, groupId } = opts;
		const params: Record<string, unknown> = {
			page,
			page_size: pageSize,
			time_range: timeRange,
			view: filters.view
		};

		const plat = String(platform ?? '').trim();
		if (plat) params.platform = plat;
		if (typeof groupId === 'number' && groupId > 0) params.group_id = groupId;

		const q = filters.q.trim();
		if (q) params.q = q;

		const model = filters.model.trim();
		if (model) params.model = model;

		if (filters.status === 'other') params.status_codes_other = true;
		else if (filters.status !== ALL) params.status_codes = filters.status;

		if (filters.resolved !== ALL) params.resolved = filters.resolved === 'true';

		return params;
	}

	/** 状态码 → 语义徽章 class（无裸 hex，纯 token）。 */
	export function statusTone(code: number | undefined | null): string {
		const c = code ?? 0;
		if (c >= 500) return 'bg-destructive/15 text-destructive border-destructive/30';
		if (c >= 400) return 'bg-amber-500/15 text-amber-600 border-amber-500/30';
		return 'bg-muted text-muted-foreground border-border';
	}

	/** phase + owner → 类型徽章（label key + tone）。与 Vue getTypeBadge 同语义。 */
	export function typeBadge(log: { phase?: string; error_owner?: string }): {
		key: string;
		fallback: string;
		tone: string;
	} {
		const phase = String(log.phase ?? '').toLowerCase();
		const owner = String(log.error_owner ?? '').toLowerCase();
		if (phase === 'upstream' && owner === 'provider')
			return {
				key: 'admin.ops.errorLog.typeUpstream',
				fallback: 'upstream',
				tone: 'bg-destructive/15 text-destructive border-destructive/30'
			};
		if (phase === 'request' && owner === 'client')
			return {
				key: 'admin.ops.errorLog.typeRequest',
				fallback: 'request',
				tone: 'bg-amber-500/15 text-amber-600 border-amber-500/30'
			};
		if (phase === 'auth' && owner === 'client')
			return {
				key: 'admin.ops.errorLog.typeAuth',
				fallback: 'auth',
				tone: 'bg-primary/15 text-primary border-primary/30'
			};
		if (phase === 'routing' && owner === 'platform')
			return {
				key: 'admin.ops.errorLog.typeRouting',
				fallback: 'routing',
				tone: 'bg-muted text-muted-foreground border-border'
			};
		if (phase === 'internal' && owner === 'platform')
			return {
				key: 'admin.ops.errorLog.typeInternal',
				fallback: 'internal',
				tone: 'bg-muted text-muted-foreground border-border'
			};
		const fb = phase || owner || 'unknown';
		return { key: '', fallback: fb, tone: 'bg-muted text-muted-foreground border-border' };
	}

	/** 上游 model 优先；否则 requested；否则 model。 */
	export function displayModel(log: {
		upstream_model?: string;
		requested_model?: string;
		model?: string;
	}): string {
		return (
			String(log.upstream_model ?? '').trim() ||
			String(log.requested_model ?? '').trim() ||
			String(log.model ?? '').trim()
		);
	}

	/** 提取人类可读 message：JSON → error.message/message/detail；常见网络错误归一；截断。 */
	export function smartMessage(
		msg: string | undefined,
		t?: (k: string, fallback: string) => string
	): string {
		if (!msg) return '';
		const tr = t ?? ((_k: string, fb: string) => fb);
		if (msg.startsWith('{') || msg.startsWith('[')) {
			try {
				const obj = JSON.parse(msg) as Record<string, unknown>;
				const err = obj?.error as Record<string, unknown> | undefined;
				if (err?.message) return String(err.message);
				if (obj?.message) return String(obj.message);
				if (obj?.detail) return String(obj.detail);
				if (typeof obj === 'object') return JSON.stringify(obj).substring(0, 150);
			} catch {
				// fallthrough
			}
		}
		if (msg.includes('context deadline exceeded'))
			return tr('admin.ops.errorLog.commonErrors.contextDeadlineExceeded', 'context deadline exceeded');
		if (msg.includes('connection refused'))
			return tr('admin.ops.errorLog.commonErrors.connectionRefused', 'connection refused');
		if (msg.toLowerCase().includes('rate limit'))
			return tr('admin.ops.errorLog.commonErrors.rateLimit', 'rate limited');
		return msg.length > 200 ? msg.substring(0, 200) + '…' : msg;
	}

	/** ISO → 本地 HH:MM:SS（与 Vue 表只显示时间部分一致）。 */
	export function formatTime(iso: string | undefined): string {
		if (!iso) return '-';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '-';
		return d.toLocaleTimeString(undefined, { hour12: false });
	}
</script>

<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import {
		listOpsRequestErrors,
		listOpsUpstreamErrors,
		resolveOpsRequestError,
		resolveOpsUpstreamError,
		type OpsErrorLog
	} from '$lib/api/admin/ops';

	type Props = {
		errorType: 'request' | 'upstream';
		timeRange: string;
		platform?: string;
		groupId?: number | null;
		onOpenErrorDetail: (id: number, errorType: 'request' | 'upstream') => void;
	};

	let { errorType, timeRange, platform, groupId = null, onOpenErrorDetail }: Props = $props();

	// ── Local state ──────────────────────────────────────────────────────────
	let filters = $state<OpsErrorFilterState>(defaultFilters());
	let rows = $state<OpsErrorLog[]>([]);
	let total = $state(0);
	let page = $state(1);
	const pageSize = 20;
	let loading = $state(false);
	let error = $state<string | null>(null);
	let resolvingId = $state<number | null>(null);

	const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)));

	const tr = (k: string, fallback: string) => $_(k, { default: fallback });

	// ── Fetch ────────────────────────────────────────────────────────────────
	async function fetchLogs() {
		loading = true;
		error = null;
		try {
			const params = buildErrorQueryParams({
				filters,
				page,
				pageSize,
				timeRange,
				platform,
				groupId
			});
			const lister = errorType === 'upstream' ? listOpsUpstreamErrors : listOpsRequestErrors;
			const res = await lister(params);
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

	// 过滤器 / 分页 / 上层 props（timeRange/platform/groupId/errorType）变更 → 重拉。
	// page 不重置由翻页路径触发；其它过滤器变更走 applyFilters 把 page 归 1。
	$effect(() => {
		// 依赖收集：上层 props + 当前 page。过滤器变更由显式 handler 触发 fetch。
		void errorType;
		void timeRange;
		void platform;
		void groupId;
		void page;
		fetchLogs();
	});

	let searchTimer: ReturnType<typeof setTimeout> | null = null;

	function applyFilters() {
		page = 1;
		fetchLogs();
	}

	function onSearchInput() {
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			page = 1;
			fetchLogs();
		}, 350);
	}

	function onSearchEnter() {
		if (searchTimer) {
			clearTimeout(searchTimer);
			searchTimer = null;
		}
		page = 1;
		fetchLogs();
	}

	function resetFilters() {
		filters = defaultFilters();
		applyFilters();
	}

	function openDetail(id: number) {
		onOpenErrorDetail(id, errorType);
	}

	async function toggleResolve(log: OpsErrorLog, ev: MouseEvent) {
		ev.stopPropagation();
		if (resolvingId != null) return;
		resolvingId = log.id;
		try {
			const next = !log.resolved;
			const resolver =
				errorType === 'upstream' ? resolveOpsUpstreamError : resolveOpsRequestError;
			await resolver(log.id, next);
			await fetchLogs();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			resolvingId = null;
		}
	}

	function prevPage() {
		if (page > 1) page -= 1;
	}
	function nextPage() {
		if (page < totalPages) page += 1;
	}

	// ── Select options（全部哨兵，禁空 value） ─────────────────────────────────
	const statusOptions = $derived([
		{ value: ALL, label: tr('common.all', 'All') },
		...STATUS_CODES.map((c) => ({ value: String(c), label: String(c) })),
		{ value: 'other', label: tr('admin.ops.errorDetails.statusCodeOther', 'Other') }
	]);

	const resolvedOptions = $derived([
		{ value: ALL, label: tr('common.all', 'All') },
		{ value: 'false', label: tr('admin.ops.errorLog.unresolved', 'Unresolved') },
		{ value: 'true', label: tr('admin.ops.errorLog.resolved', 'Resolved') }
	]);

	const viewOptions = $derived([
		{ value: 'errors', label: tr('admin.ops.errorDetails.viewErrors', 'Errors') },
		{ value: 'excluded', label: tr('admin.ops.errorDetails.viewExcluded', 'Excluded') },
		{ value: 'all', label: tr('common.all', 'All') }
	]);
</script>

<div class="flex h-full min-h-0 flex-col gap-3" data-testid="ops-error-log-table">
	<!-- Filters -->
	<div class="flex flex-wrap items-end gap-2">
		<div class="flex flex-col gap-1">
			<span class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
				{tr('admin.ops.errorLog.search', 'Search')}
			</span>
			<Input
				bind:value={filters.q}
				class="h-9 w-56"
				placeholder={tr('admin.ops.errorLog.searchPlaceholder', 'request id / message…')}
				oninput={onSearchInput}
				onkeydown={(e: KeyboardEvent) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						onSearchEnter();
					}
				}}
			/>
		</div>

		<div class="flex flex-col gap-1">
			<span class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
				{tr('admin.ops.errorLog.model', 'Model')}
			</span>
			<Input
				bind:value={filters.model}
				class="h-9 w-40"
				placeholder={tr('admin.ops.errorLog.modelPlaceholder', 'model…')}
				oninput={onSearchInput}
				onkeydown={(e: KeyboardEvent) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						onSearchEnter();
					}
				}}
			/>
		</div>

		<div class="flex flex-col gap-1">
			<span class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
				{tr('admin.ops.errorLog.status', 'Status')}
			</span>
			<NativeSelect
				bind:value={filters.status}
				options={statusOptions}
				class="h-9 w-32"
				onchange={applyFilters}
			/>
		</div>

		<div class="flex flex-col gap-1">
			<span class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
				{tr('admin.ops.errorLog.resolvedFilter', 'Resolved')}
			</span>
			<NativeSelect
				bind:value={filters.resolved}
				options={resolvedOptions}
				class="h-9 w-32"
				onchange={applyFilters}
			/>
		</div>

		<div class="flex flex-col gap-1">
			<span class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
				{tr('admin.ops.errorLog.view', 'View')}
			</span>
			<NativeSelect
				bind:value={filters.view}
				options={viewOptions}
				class="h-9 w-32"
				onchange={applyFilters}
			/>
		</div>

		<Button variant="ghost" size="sm" class="h-9" onclick={resetFilters}>
			{tr('admin.ops.errorLog.reset', 'Reset')}
		</Button>
	</div>

	{#if error}
		<Alert variant="destructive">
			{tr('admin.ops.errorLog.loadFailed', 'Failed to load error logs')}: {error}
		</Alert>
	{/if}

	<!-- Header row (sticky semantics handled by VirtualTable header snippet) -->
	<div class="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
		<VirtualTable
			{rows}
			{loading}
			rowHeight={44}
			class="h-full"
			getRowKey={(r) => r.id}
		>
			{#snippet header()}
				<div
					class="grid grid-cols-[110px_110px_minmax(120px,1fr)_120px_130px_minmax(160px,2fr)_96px] items-center gap-2 border-b border-border bg-muted px-3 py-2 text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground"
				>
					<span>{tr('admin.ops.errorLog.time', 'Time')}</span>
					<span>{tr('admin.ops.errorLog.type', 'Type')}</span>
					<span>{tr('admin.ops.errorLog.model', 'Model')}</span>
					<span>{tr('admin.ops.errorLog.platform', 'Platform')}</span>
					<span>{tr('admin.ops.errorLog.status', 'Status')}</span>
					<span>{tr('admin.ops.errorLog.message', 'Message')}</span>
					<span class="text-right">{tr('admin.ops.errorLog.action', 'Action')}</span>
				</div>
			{/snippet}

			{#snippet row({ row: log })}
				{@const tb = typeBadge(log)}
				<div
					role="button"
					tabindex={0}
					class="grid grid-cols-[110px_110px_minmax(120px,1fr)_120px_130px_minmax(160px,2fr)_96px] cursor-pointer items-center gap-2 border-b border-border px-3 py-2 text-[11.5px] transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					onclick={() => openDetail(log.id)}
					onkeydown={(e: KeyboardEvent) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							openDetail(log.id);
						}
					}}
				>
					<span
						class="font-mono tabular-nums text-[11px] text-foreground"
						title={log.request_id || log.client_request_id || ''}
					>
						{formatTime(log.created_at)}
					</span>

					<span
						class="inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold {tb.tone}"
					>
						{tb.key ? tr(tb.key, tb.fallback) : tb.fallback}
					</span>

					<span
						class="overflow-hidden text-ellipsis whitespace-nowrap font-mono tabular-nums text-[10.5px] text-muted-foreground"
						title={displayModel(log)}
					>
						{displayModel(log) || '-'}
					</span>

					<span class="overflow-hidden">
						<Badge variant="outline" class="text-[9.5px] font-semibold uppercase">
							{log.platform || '-'}
						</Badge>
					</span>

					<span class="flex items-center gap-1">
						<span
							class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold {statusTone(
								log.status_code
							)}"
						>
							{log.status_code ?? '-'}
						</span>
						{#if log.resolved}
							<Badge variant="outline" class="text-[9px]">
								{tr('admin.ops.errorLog.resolved', 'Resolved')}
							</Badge>
						{/if}
					</span>

					<span
						class="overflow-hidden text-ellipsis whitespace-nowrap text-[10.5px] font-medium text-muted-foreground"
						title={log.message || ''}
					>
						{smartMessage(log.message, tr) || '-'}
					</span>

					<span class="flex items-center justify-end gap-1">
						<Button
							variant="ghost"
							size="sm"
							class="h-7 px-2 text-[10px]"
							disabled={resolvingId === log.id}
							onclick={(e: MouseEvent) => toggleResolve(log, e)}
						>
							{log.resolved
								? tr('admin.ops.errorLog.unresolve', 'Unresolve')
								: tr('admin.ops.errorLog.markResolved', 'Resolve')}
						</Button>
					</span>
				</div>
			{/snippet}

			{#snippet empty()}
				<div class="px-6 py-10 text-center text-sm text-muted-foreground">
					{tr('admin.ops.errorLog.noErrors', 'No errors found')}
				</div>
			{/snippet}
		</VirtualTable>
	</div>

	<!-- Pagination -->
	<div class="flex items-center justify-between text-xs text-muted-foreground">
		<span>
			{tr('admin.ops.errorLog.totalCount', 'Total')}: {total}
		</span>
		<div class="flex items-center gap-2">
			<Button variant="outline" size="sm" class="h-8" disabled={page <= 1 || loading} onclick={prevPage}>
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
</div>
