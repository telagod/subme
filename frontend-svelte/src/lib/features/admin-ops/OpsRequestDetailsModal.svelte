<script lang="ts" module>
	/**
	 * OpsRequestDetailsModal · admin Ops 请求下钻弹窗（Phase C M13）
	 *
	 * Vue 参照：
	 *   - frontend/src/views/admin/ops/components/OpsRequestDetailsModal.vue
	 *     （preset 过滤器 + 时间窗装配 + 行/列/徽章语义 + 错误行下钻）
	 *
	 * 单错误 modal 由上层路由托管：错误行点「查看错误」→ onOpenErrorDetail(error_id)，
	 * 本弹窗先 onClose() 再交棒（与 Vue close()+emit('openErrorDetail') 同序）。
	 *
	 * 红线遵循：
	 *   - 仅复用 lib/ui/* primitives（StandardDialog / Button / Badge / VirtualTable / Alert），不手搓。
	 *   - 调色板只用 Zinc / 语义 token（bg-card / text-muted-foreground / border-border …），无裸 hex。
	 *   - i18n 走 $_('admin.ops.<key>', { default }) ，default 兜底防硬编码英文 finding。
	 *   - 本组件纯表格下钻，**不引 chart.js**（无图表 → 天然规避 TDZ vendor-chunk 陷阱）。
	 *
	 * preset 形态由本文件 **导出**，供路由按钮装配（慢请求 / 错误请求 / 全部请求 等）。
	 * module 块导出纯函数供 co-located 测试直接验证，无需挂载组件。
	 */
	import type { OpsRequestDetailsParams } from '$lib/api/admin/ops';

	/** preset kind / sort：从 listOpsRequestDetails 入参类型派生，避免双源漂移。 */
	export type OpsRequestDetailsKind = NonNullable<OpsRequestDetailsParams['kind']>;
	export type OpsRequestDetailsSort = NonNullable<OpsRequestDetailsParams['sort']>;

	/** 路由按钮装配的下钻 preset（标题 + 后端过滤维度）。 */
	export interface OpsRequestDetailsPreset {
		title: string;
		kind?: OpsRequestDetailsKind;
		sort?: OpsRequestDetailsSort;
		min_duration_ms?: number;
		max_duration_ms?: number;
	}

	/** time_range（如 '5m' / '6h'）→ 分钟（端口自 opsFormatters.parseTimeRangeMinutes，避免跨 Vue util 依赖）。 */
	export function parseTimeRangeMinutes(range: string): number {
		const trimmed = (range || '').trim();
		if (!trimmed) return 60;
		if (trimmed.endsWith('m')) {
			const v = Number.parseInt(trimmed.slice(0, -1), 10);
			return Number.isFinite(v) && v > 0 ? v : 60;
		}
		if (trimmed.endsWith('h')) {
			const v = Number.parseInt(trimmed.slice(0, -1), 10);
			return Number.isFinite(v) && v > 0 ? v * 60 : 60;
		}
		if (trimmed.endsWith('d')) {
			const v = Number.parseInt(trimmed.slice(0, -1), 10);
			return Number.isFinite(v) && v > 0 ? v * 24 * 60 : 60;
		}
		return 60;
	}

	/** 由 timeRange 推 start_time/end_time（end=now，start=now-窗口；ISO 字符串）。 */
	export function buildTimeWindow(
		timeRange: string,
		now: Date = new Date()
	): { start_time: string; end_time: string } {
		const minutes = parseTimeRangeMinutes(timeRange);
		const start = new Date(now.getTime() - minutes * 60 * 1000);
		return { start_time: start.toISOString(), end_time: now.toISOString() };
	}

	/**
	 * 把 preset + 上层过滤 + 分页装配成 listOpsRequestDetails 入参。
	 * 关键点：kind/sort 缺省回落 'all' / 'created_at_desc'；platform 空串不下发；
	 * group_id 仅 >0 下发；min/max_duration_ms 仅 number 时下发。
	 */
	export function buildRequestDetailsParams(opts: {
		preset: OpsRequestDetailsPreset;
		timeRange: string;
		platform?: string;
		groupId?: number | null;
		page: number;
		pageSize: number;
		now?: Date;
	}): OpsRequestDetailsParams {
		const { preset, timeRange, platform, groupId, page, pageSize, now } = opts;
		const params: OpsRequestDetailsParams = {
			...buildTimeWindow(timeRange, now ?? new Date()),
			page,
			page_size: pageSize,
			kind: preset.kind ?? 'all',
			sort: preset.sort ?? 'created_at_desc'
		};

		const plat = String(platform ?? '').trim();
		if (plat) params.platform = plat;
		if (typeof groupId === 'number' && groupId > 0) params.group_id = groupId;

		if (typeof preset.min_duration_ms === 'number') params.min_duration_ms = preset.min_duration_ms;
		if (typeof preset.max_duration_ms === 'number') params.max_duration_ms = preset.max_duration_ms;

		return params;
	}

	/** 时长 → 'NNN ms'；非 number → '-'。 */
	export function formatDurationMs(ms: number | null | undefined): string {
		return typeof ms === 'number' && Number.isFinite(ms) ? `${ms} ms` : '-';
	}

	/** status_code → 语义徽章 class（无裸 hex，纯 token）。与 OpsErrorLogTable.statusTone 同语义。 */
	export function statusTone(code: number | null | undefined): string {
		const c = code ?? 0;
		if (c >= 500) return 'bg-destructive/15 text-destructive border-destructive/30';
		if (c >= 400) return 'bg-amber-500/15 text-amber-600 border-amber-500/30';
		if (c > 0) return 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30';
		return 'bg-muted text-muted-foreground border-border';
	}

	/** ISO → 本地日期时间；无效/空 → '-'。 */
	export function formatDateTime(value: string | null | undefined): string {
		if (!value) return '-';
		const d = new Date(value);
		if (Number.isNaN(d.getTime())) return '-';
		return d.toLocaleString(undefined, { hour12: false });
	}
</script>

<script lang="ts">
	import { _ } from 'svelte-i18n';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import { listOpsRequestDetails, type OpsRequestDetail } from '$lib/api/admin/ops';

	type Props = {
		open: boolean;
		timeRange: string;
		preset: OpsRequestDetailsPreset;
		platform?: string;
		groupId?: number | null;
		onClose: () => void;
		onOpenErrorDetail: (id: number) => void;
	};

	let {
		open,
		timeRange,
		preset,
		platform,
		groupId = null,
		onClose,
		onOpenErrorDetail
	}: Props = $props();

	const tr = (k: string, fallback: string) => $_(k, { default: fallback });

	// ── Local state ────────────────────────────────────────────────────────────
	let rows = $state<OpsRequestDetail[]>([]);
	let total = $state(0);
	let page = $state(1);
	const pageSize = 10;
	let loading = $state(false);
	let error = $state<string | null>(null);

	const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)));

	const rangeLabel = $derived.by(() => {
		const minutes = parseTimeRangeMinutes(timeRange);
		if (minutes >= 60)
			return tr('admin.ops.requestDetails.rangeHours', `Last ${Math.round(minutes / 60)}h`);
		return tr('admin.ops.requestDetails.rangeMinutes', `Last ${minutes}m`);
	});

	// ── Fetch ──────────────────────────────────────────────────────────────────
	async function fetchData() {
		loading = true;
		error = null;
		try {
			const params = buildRequestDetailsParams({
				preset,
				timeRange,
				platform,
				groupId,
				page,
				pageSize
			});
			const res = await listOpsRequestDetails(params);
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

	// open 翻转为 true → 复位分页并拉取；上层过滤维度（timeRange/platform/groupId/preset）
	// 变更亦在打开态下复位首页重拉。page 由翻页 handler 单独触发，不在此 effect 内。
	let prevOpen = false;
	let prevSig = '';
	$effect(() => {
		const sig = JSON.stringify({
			timeRange,
			platform,
			groupId,
			kind: preset.kind,
			sort: preset.sort,
			min: preset.min_duration_ms,
			max: preset.max_duration_ms
		});

		if (open && !prevOpen) {
			// 刚打开：复位并拉取
			page = 1;
			fetchData();
		} else if (open && sig !== prevSig) {
			// 打开态下过滤维度变了：复位首页重拉
			page = 1;
			fetchData();
		}

		prevOpen = open;
		prevSig = sig;
	});

	function handleOpenChange(next: boolean) {
		if (!next) onClose();
	}

	function refresh() {
		fetchData();
	}

	function prevPage() {
		if (page > 1) {
			page -= 1;
			fetchData();
		}
	}
	function nextPage() {
		if (page < totalPages) {
			page += 1;
			fetchData();
		}
	}

	function openErrorDetail(errorId: number | null | undefined) {
		if (!errorId) return;
		onClose();
		onOpenErrorDetail(errorId);
	}
</script>

<StandardDialog
	{open}
	width="lg"
	showHeader={false}
	title={preset.title || tr('admin.ops.requestDetails.title', 'Request details')}
	onOpenChange={handleOpenChange}
	class="!max-w-5xl"
	data-testid="ops-request-details-modal"
>
	<div class="flex h-[70vh] min-h-0 flex-col">
		<!-- Header -->
		<div class="mb-3 flex shrink-0 items-start justify-between gap-3">
			<div class="min-w-0">
				<h2 class="truncate text-lg font-semibold text-foreground">
					{preset.title || tr('admin.ops.requestDetails.title', 'Request details')}
				</h2>
				<p class="mt-0.5 text-[11px] text-muted-foreground">
					{tr('admin.ops.requestDetails.rangeLabel', 'Window')}: {rangeLabel}
				</p>
			</div>
			<div class="flex shrink-0 items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					class="h-8"
					disabled={loading}
					onclick={refresh}
				>
					{tr('common.refresh', 'Refresh')}
				</Button>
				<Button variant="ghost" size="sm" class="h-8" onclick={onClose}>
					{tr('common.close', 'Close')}
				</Button>
			</div>
		</div>

		{#if error}
			<Alert variant="destructive" class="mb-3">
				{tr('admin.ops.requestDetails.failedToLoad', 'Failed to load request details')}: {error}
			</Alert>
		{/if}

		<!-- Table -->
		<div class="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
			<VirtualTable
				{rows}
				{loading}
				rowHeight={44}
				class="h-full"
				getRowKey={(_r, i) => i}
			>
				{#snippet header()}
					<div
						class="grid grid-cols-[150px_90px_minmax(120px,1.4fr)_120px_100px_100px_minmax(150px,1.6fr)_96px] items-center gap-2 border-b border-border bg-muted px-3 py-2 text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground"
					>
						<span>{tr('admin.ops.requestDetails.table.time', 'Time')}</span>
						<span>{tr('admin.ops.requestDetails.table.kind', 'Kind')}</span>
						<span>{tr('admin.ops.requestDetails.table.model', 'Model')}</span>
						<span>{tr('admin.ops.requestDetails.table.platform', 'Platform')}</span>
						<span>{tr('admin.ops.requestDetails.table.duration', 'Duration')}</span>
						<span>{tr('admin.ops.requestDetails.table.status', 'Status')}</span>
						<span>{tr('admin.ops.requestDetails.table.requestId', 'Request ID')}</span>
						<span class="text-right">{tr('admin.ops.requestDetails.table.actions', 'Actions')}</span>
					</div>
				{/snippet}

				{#snippet row({ row: item })}
					<div
						class="grid grid-cols-[150px_90px_minmax(120px,1.4fr)_120px_100px_100px_minmax(150px,1.6fr)_96px] items-center gap-2 border-b border-border px-3 py-2 text-[11.5px]"
					>
						<span class="font-mono tabular-nums text-[10.5px] text-muted-foreground">
							{formatDateTime(item.created_at)}
						</span>

						<span>
							<Badge variant={item.kind === 'error' ? 'destructive' : 'secondary'}>
								{item.kind === 'error'
									? tr('admin.ops.requestDetails.kind.error', 'Error')
									: tr('admin.ops.requestDetails.kind.success', 'Success')}
							</Badge>
						</span>

						<span
							class="overflow-hidden text-ellipsis whitespace-nowrap font-mono tabular-nums text-[10.5px] text-muted-foreground"
							title={item.model || ''}
						>
							{item.model || '-'}
						</span>

						<span class="overflow-hidden">
							<Badge variant="outline" class="text-[9.5px] font-semibold uppercase">
								{(item.platform || 'unknown').toUpperCase()}
							</Badge>
						</span>

						<span class="tabular-nums text-muted-foreground">
							{formatDurationMs(item.duration_ms)}
						</span>

						<span>
							<span
								class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold {statusTone(
									item.status_code
								)}"
							>
								{item.status_code ?? '-'}
							</span>
						</span>

						<span
							class="overflow-hidden text-ellipsis whitespace-nowrap font-mono tabular-nums text-[10.5px] text-muted-foreground"
							title={item.request_id || ''}
						>
							{item.request_id || '-'}
						</span>

						<span class="flex items-center justify-end">
							{#if item.kind === 'error' && item.error_id}
								<Button
									variant="outline"
									size="sm"
									class="h-7 border-destructive/25 px-2 text-[10px] text-destructive hover:bg-destructive/10 hover:text-destructive"
									onclick={() => openErrorDetail(item.error_id)}
								>
									{tr('admin.ops.requestDetails.viewError', 'View error')}
								</Button>
							{:else}
								<span class="text-[11px] text-muted-foreground">-</span>
							{/if}
						</span>
					</div>
				{/snippet}

				{#snippet empty()}
					<div class="px-6 py-12 text-center">
						<div class="text-[13px] font-medium text-muted-foreground">
							{tr('admin.ops.requestDetails.empty', 'No requests found')}
						</div>
						<div class="mt-1 text-[11px] text-muted-foreground/70">
							{tr(
								'admin.ops.requestDetails.emptyHint',
								'Try widening the time range or relaxing the filter.'
							)}
						</div>
					</div>
				{/snippet}
			</VirtualTable>
		</div>

		<!-- Pagination -->
		<div class="mt-3 flex shrink-0 items-center justify-between text-xs text-muted-foreground">
			<span>
				{tr('admin.ops.requestDetails.totalCount', 'Total')}: {total}
			</span>
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
	</div>
</StandardDialog>
