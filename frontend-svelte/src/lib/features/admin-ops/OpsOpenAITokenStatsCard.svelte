<script lang="ts">
	/**
	 * OpsOpenAITokenStatsCard · OpenAI token 吞吐分模型统计卡（自取数）
	 *
	 * Vue 对照源：frontend/src/views/admin/ops/components/OpsOpenAITokenStatsCard.vue
	 *
	 * 行为：
	 *   - 自带时间范围 NativeSelect（30m/1h/1d/15d/30d，默认 30d）
	 *   - view-mode 切换：topn（Top N，单页全量）/ pagination（分页 + VirtualTable）
	 *   - 拉取 openai-token-stats；refreshToken 变化时强制重取
	 *   - 列：model / request_count / avg_tokens_per_sec / avg_first_token_ms /
	 *        total_output_tokens / avg_duration_ms（外加 requests_with_first_token）
	 *
	 * 红线遵循：
	 *   - Zinc-only：仅用 ui primitive + 语义色 token（无 raw hex）
	 *   - NativeSelect sentinel：本组件取值全是非空字符串枚举，天然合规
	 *   - VirtualTable 仅在 pagination 模式渲染（自身 dynamic-import 虚拟化，lazy island）
	 *   - i18n 走 $_('admin.ops.<key>', { default })，不改 locales 文件
	 *   - 本卡无 chart
	 */
	import { _ } from 'svelte-i18n';
	import {
		getOpsOpenAITokenStats,
		type OpsOpenAITokenStatsItem,
		type OpsOpenAITokenStatsParams,
		type OpsOpenAITokenStatsResponse
	} from '$lib/api/admin/ops';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';

	type TimeRange = '30m' | '1h' | '1d' | '15d' | '30d';
	type ViewMode = 'topn' | 'pagination';

	type Props = {
		platformFilter?: string;
		groupIdFilter?: number | null;
		refreshToken: number;
	};

	let { platformFilter = '', groupIdFilter = null, refreshToken }: Props = $props();

	// ── 本卡自有控件状态 ────────────────────────────────────────────────
	let timeRange = $state<TimeRange>('30d');
	let viewMode = $state<ViewMode>('topn');
	let topN = $state(20);
	let page = $state(1);
	let pageSize = $state(20);

	// ── 请求/数据状态 ──────────────────────────────────────────────────
	let loading = $state(false);
	let errorMessage = $state('');
	let response = $state<OpsOpenAITokenStatsResponse | null>(null);

	const items = $derived<OpsOpenAITokenStatsItem[]>(response?.items ?? []);
	const total = $derived(response?.total ?? 0);
	const totalPages = $derived.by(() => {
		if (viewMode !== 'pagination') return 1;
		const size = pageSize > 0 ? pageSize : 20;
		return Math.max(1, Math.ceil(total / size));
	});

	const timeRangeOptions = $derived([
		{ value: '30m', label: $_('admin.ops.timeRange.30m', { default: '最近 30 分钟' }) },
		{ value: '1h', label: $_('admin.ops.timeRange.1h', { default: '最近 1 小时' }) },
		{ value: '1d', label: $_('admin.ops.timeRange.1d', { default: '最近 1 天' }) },
		{ value: '15d', label: $_('admin.ops.timeRange.15d', { default: '最近 15 天' }) },
		{ value: '30d', label: $_('admin.ops.timeRange.30d', { default: '最近 30 天' }) }
	]);

	const viewModeOptions = $derived([
		{
			value: 'topn',
			label: $_('admin.ops.openaiTokenStats.viewModeTopN', { default: '前 N 名' })
		},
		{
			value: 'pagination',
			label: $_('admin.ops.openaiTokenStats.viewModePagination', { default: '分页' })
		}
	]);

	const topNOptions = [
		{ value: '10', label: 'Top 10' },
		{ value: '20', label: 'Top 20' },
		{ value: '50', label: 'Top 50' },
		{ value: '100', label: 'Top 100' }
	];

	const pageSizeOptions = [
		{ value: '10', label: '10' },
		{ value: '20', label: '20' },
		{ value: '50', label: '50' },
		{ value: '100', label: '100' }
	];

	// ── 格式化（对照 Vue：rate 两位小数；int 整数千分位）────────────────
	const intFmt = new Intl.NumberFormat('en');

	function formatRate(v?: number | null): string {
		if (typeof v !== 'number' || !Number.isFinite(v)) return '-';
		return v.toFixed(2);
	}

	function formatInt(v?: number | null): string {
		if (typeof v !== 'number' || !Number.isFinite(v)) return '-';
		return intFmt.format(Math.round(v));
	}

	function buildParams(): OpsOpenAITokenStatsParams {
		const params: OpsOpenAITokenStatsParams = {
			time_range: timeRange,
			platform: platformFilter || undefined,
			group_id:
				typeof groupIdFilter === 'number' && groupIdFilter > 0 ? groupIdFilter : undefined
		};
		if (viewMode === 'topn') {
			params.top_n = topN;
		} else {
			params.page = page;
			params.page_size = pageSize;
		}
		return params;
	}

	// 并发守卫：只认最后一次发起的请求结果，丢弃过期响应。
	let requestSeq = 0;

	async function loadData() {
		const seq = ++requestSeq;
		loading = true;
		errorMessage = '';
		try {
			let res = await getOpsOpenAITokenStats(buildParams());
			if (seq !== requestSeq) return;
			response = res;
			// 防御：total 变化导致当前页越界时回退末页再取一次。
			if (viewMode === 'pagination') {
				const pages = Math.max(1, Math.ceil((res.total ?? 0) / (pageSize > 0 ? pageSize : 20)));
				if (page > pages) {
					page = pages;
					res = await getOpsOpenAITokenStats(buildParams());
					if (seq !== requestSeq) return;
					response = res;
				}
			}
		} catch (err) {
			if (seq !== requestSeq) return;
			response = null;
			errorMessage =
				err instanceof Error && err.message
					? err.message
					: $_('admin.ops.openaiTokenStats.failedToLoad', {
							default: '加载令牌统计失败'
						});
		} finally {
			if (seq === requestSeq) loading = false;
		}
	}

	// 取数副作用：跟踪所有入参（含 refreshToken）。
	// 切筛选时若停留在非首页，先复位 page，待下一轮（仅 page 变）再发请求，
	// 避免一次交互触发两次请求 —— 对照 Vue watch 的同款防抖逻辑。
	let prevKey: string | null = null;
	$effect(() => {
		// 显式读取以建立依赖
		const key = JSON.stringify({
			timeRange,
			viewMode,
			topN,
			page,
			pageSize,
			platformFilter,
			groupIdFilter,
			refreshToken
		});

		const prev = prevKey ? (JSON.parse(prevKey) as Record<string, unknown>) : null;
		prevKey = key;

		const filtersChanged =
			!prev ||
			prev.timeRange !== timeRange ||
			prev.viewMode !== viewMode ||
			prev.pageSize !== pageSize ||
			prev.platformFilter !== platformFilter ||
			prev.groupIdFilter !== groupIdFilter ||
			prev.refreshToken !== refreshToken;

		if (viewMode === 'pagination' && filtersChanged && page !== 1) {
			page = 1;
			return;
		}

		void loadData();
	});

	function onPrevPage() {
		if (viewMode !== 'pagination') return;
		if (page > 1) page -= 1;
	}

	function onNextPage() {
		if (viewMode !== 'pagination') return;
		if (page < totalPages) page += 1;
	}
</script>

<Card class="p-4" data-testid="ops-openai-token-stats-card">
	<div class="mb-3.5 flex flex-wrap items-center justify-between gap-2.5">
		<h3 class="flex items-center gap-2 text-sm font-bold text-foreground">
			{$_('admin.ops.openaiTokenStats.title', { default: 'OpenAI 令牌吞吐量' })}
		</h3>
		<div class="flex flex-wrap items-center gap-1.5">
			<NativeSelect
				bind:value={timeRange}
				options={timeRangeOptions}
				class="h-8 w-[136px] text-xs"
				aria-label={$_('admin.ops.timeRange.label', { default: '时间范围' })}
			/>
			<NativeSelect
				bind:value={viewMode}
				options={viewModeOptions}
				class="h-8 w-[136px] text-xs"
				aria-label={$_('admin.ops.openaiTokenStats.viewModeLabel', { default: '视图模式' })}
			/>

			{#if viewMode === 'topn'}
				<NativeSelect
					value={String(topN)}
					options={topNOptions}
					class="h-8 w-[100px] text-xs"
					aria-label={$_('admin.ops.openaiTokenStats.topNLabel', { default: '前 N 名' })}
					onchange={(e) => (topN = Number((e.currentTarget as HTMLSelectElement).value))}
				/>
			{:else}
				<NativeSelect
					value={String(pageSize)}
					options={pageSizeOptions}
					class="h-8 w-20 text-xs"
					aria-label={$_('admin.ops.openaiTokenStats.pageSizeLabel', { default: '每页条数' })}
					onchange={(e) => (pageSize = Number((e.currentTarget as HTMLSelectElement).value))}
				/>
				<Button
					variant="outline"
					size="sm"
					class="px-2.5 text-[11px]"
					disabled={loading || page <= 1}
					onclick={onPrevPage}
				>
					{$_('admin.ops.openaiTokenStats.prevPage', { default: '上一页' })}
				</Button>
				<Button
					variant="outline"
					size="sm"
					class="px-2.5 text-[11px]"
					disabled={loading || page >= totalPages}
					onclick={onNextPage}
				>
					{$_('admin.ops.openaiTokenStats.nextPage', { default: '下一步' })}
				</Button>
				<span class="text-xs text-muted-foreground">
					{$_('admin.ops.openaiTokenStats.pageInfo', {
						default: '第 {page} / {total} 页',
						values: { page, total: totalPages }
					})}
				</span>
			{/if}
		</div>
	</div>

	{#if errorMessage}
		<Alert variant="destructive" class="mb-3 text-[11.5px]" data-testid="ops-openai-token-stats-error">
			{errorMessage}
		</Alert>
	{/if}

	{#if loading}
		<div class="py-7 text-center text-[13px] text-muted-foreground" data-testid="ops-openai-token-stats-loading">
			{$_('admin.ops.loadingText', { default: '加载中…' })}
		</div>
	{:else if items.length === 0}
		<div
			class="rounded-xl border border-border bg-card px-3 py-10 text-center"
			data-testid="ops-openai-token-stats-empty"
		>
			<p class="text-sm font-medium text-foreground">
				{$_('common.noData', { default: '暂无数据' })}
			</p>
			<p class="mt-1 text-xs text-muted-foreground">
				{$_('admin.ops.openaiTokenStats.empty', {
					default: '该范围内无令牌吞吐量记录。'
				})}
			</p>
		</div>
	{:else if viewMode === 'pagination'}
		<!-- 分页模式：VirtualTable（lazy island 虚拟化）。 -->
		<div class="overflow-hidden rounded-xl border border-border bg-card">
			<VirtualTable
				rows={items}
				rowHeight={36}
				getRowKey={(r) => r.model}
				class="max-h-[420px]"
			>
				{#snippet header()}
					<div
						class="grid grid-cols-7 gap-2 border-b border-border bg-muted px-2.5 py-[7px] text-xs font-semibold text-muted-foreground"
					>
						<span>{$_('admin.ops.openaiTokenStats.table.model', { default: '模型' })}</span>
						<span>{$_('admin.ops.openaiTokenStats.table.requestCount', { default: '请求数' })}</span>
						<span>{$_('admin.ops.openaiTokenStats.table.avgTokensPerSec', { default: '平均 tok/s' })}</span>
						<span>{$_('admin.ops.openaiTokenStats.table.avgFirstTokenMs', { default: '平均 TTFT (ms)' })}</span>
						<span>{$_('admin.ops.openaiTokenStats.table.totalOutputTokens', { default: '输出令牌' })}</span>
						<span>{$_('admin.ops.openaiTokenStats.table.avgDurationMs', { default: '平均时长 (ms)' })}</span>
						<span>{$_('admin.ops.openaiTokenStats.table.requestsWithFirstToken', { default: '含 TTFT' })}</span>
					</div>
				{/snippet}
				{#snippet row({ row })}
					<div
						class="grid grid-cols-7 items-center gap-2 border-b border-border px-2.5 py-[7px] text-xs last:border-b-0"
					>
						<span class="font-medium text-foreground">{row.model}</span>
						<span class="text-muted-foreground">{formatInt(row.request_count)}</span>
						<span class="text-muted-foreground">{formatRate(row.avg_tokens_per_sec)}</span>
						<span class="text-muted-foreground">{formatRate(row.avg_first_token_ms)}</span>
						<span class="text-muted-foreground">{formatInt(row.total_output_tokens)}</span>
						<span class="text-muted-foreground">{formatInt(row.avg_duration_ms)}</span>
						<span class="text-muted-foreground">{formatInt(row.requests_with_first_token)}</span>
					</div>
				{/snippet}
			</VirtualTable>
		</div>
	{:else}
		<!-- Top N 模式：单页全量普通表格。 -->
		<div class="overflow-hidden rounded-xl border border-border bg-card">
			<div class="max-h-[420px] overflow-auto">
				<table class="min-w-full border-collapse text-left text-xs">
					<thead class="sticky top-0 z-10 border-b border-border bg-muted">
						<tr>
							<th class="px-2.5 py-[7px] font-semibold text-muted-foreground">
								{$_('admin.ops.openaiTokenStats.table.model', { default: '模型' })}
							</th>
							<th class="px-2.5 py-[7px] font-semibold text-muted-foreground">
								{$_('admin.ops.openaiTokenStats.table.requestCount', { default: '请求数' })}
							</th>
							<th class="px-2.5 py-[7px] font-semibold text-muted-foreground">
								{$_('admin.ops.openaiTokenStats.table.avgTokensPerSec', { default: '平均 tok/s' })}
							</th>
							<th class="px-2.5 py-[7px] font-semibold text-muted-foreground">
								{$_('admin.ops.openaiTokenStats.table.avgFirstTokenMs', { default: '平均 TTFT (ms)' })}
							</th>
							<th class="px-2.5 py-[7px] font-semibold text-muted-foreground">
								{$_('admin.ops.openaiTokenStats.table.totalOutputTokens', { default: '输出令牌' })}
							</th>
							<th class="px-2.5 py-[7px] font-semibold text-muted-foreground">
								{$_('admin.ops.openaiTokenStats.table.avgDurationMs', { default: '平均时长 (ms)' })}
							</th>
							<th class="px-2.5 py-[7px] font-semibold text-muted-foreground">
								{$_('admin.ops.openaiTokenStats.table.requestsWithFirstToken', { default: '含 TTFT' })}
							</th>
						</tr>
					</thead>
					<tbody>
						{#each items as row (row.model)}
							<tr class="border-b border-border last:border-b-0">
								<td class="px-2.5 py-[7px] font-medium text-foreground">{row.model}</td>
								<td class="px-2.5 py-[7px] text-muted-foreground">{formatInt(row.request_count)}</td>
								<td class="px-2.5 py-[7px] text-muted-foreground">{formatRate(row.avg_tokens_per_sec)}</td>
								<td class="px-2.5 py-[7px] text-muted-foreground">{formatRate(row.avg_first_token_ms)}</td>
								<td class="px-2.5 py-[7px] text-muted-foreground">{formatInt(row.total_output_tokens)}</td>
								<td class="px-2.5 py-[7px] text-muted-foreground">{formatInt(row.avg_duration_ms)}</td>
								<td class="px-2.5 py-[7px] text-muted-foreground">{formatInt(row.requests_with_first_token)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="mt-2.5 px-1 text-[11px] text-muted-foreground">
				{$_('admin.ops.openaiTokenStats.totalModels', {
					default: '{total} models',
					values: { total }
				})}
			</div>
		</div>
	{/if}
</Card>
