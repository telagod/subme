<script lang="ts">
	/**
	 * OpsErrorDistributionChart · admin Ops 仪表盘 lazy doughnut island
	 *
	 * 还原 Vue 源：frontend/src/views/admin/ops/components/OpsErrorDistributionChart.vue
	 *   - items[].status_code → 归类成 upstream(502/503/504) / client(4xx) / system(500) / other
	 *   - 计数维度取 item.sla（SLA-relevant errors），与 Vue 源一致
	 *   - Doughnut(cutout 65%) + 自绘 legend + top reason + 总数徽标
	 *   - onOpenDetails → 父级打开 request-errors 抽屉/弹窗
	 *
	 * LAZY 规约（memory: vendor-chunk-tdz-trap）：
	 *   chart.js / svelte-chartjs **只在 onMount 里 dynamic import**，绝不顶层 import，
	 *   否则 rollup 会把 chart.js 吸进 eager vendor，触 check-chunks 红线 + TDZ 白屏。
	 *   SSR 兜底：typeof window 拦截预渲染期加载。
	 *
	 * 调色：canvas 不能读 CSS var，dataset 颜色须为字面值——与同仓 TimeseriesChart /
	 *   UsageChart 既有 lazy chart 一致（hex 仅存在于 chart.js dataset config，markup 全走
	 *   Zinc token，不出现 raw hex）。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import Card from '$lib/ui/Card.svelte';
	import Button from '$lib/ui/Button.svelte';
	import type { OpsErrorDistributionResponse } from '$lib/api/admin/ops';

	let {
		data,
		loading = false,
		onOpenDetails
	}: {
		data: OpsErrorDistributionResponse | null;
		loading?: boolean;
		onOpenDetails?: () => void;
	} = $props();

	// chart.js dataset 字面色（canvas 不支持 CSS var）。语义与 Vue 源对齐：
	//   warn=upstream · accent=client · bad=system · muted=other。
	const CAT_COLORS = {
		upstream: '#e0b34e',
		client: '#5ca8ff',
		system: '#f25c69',
		other: '#97a0af'
	} as const;

	type ChartState = 'ready' | 'loading' | 'empty';

	interface ErrorCategory {
		label: string;
		count: number;
		color: string;
	}

	const totalSlaErrors = $derived(
		(data?.items ?? []).reduce((acc, item) => acc + Number(item.sla || 0), 0)
	);

	const hasData = $derived(totalSlaErrors > 0);

	const chartState: ChartState = $derived(hasData ? 'ready' : loading ? 'loading' : 'empty');

	const categories = $derived.by<ErrorCategory[]>(() => {
		if (!data) return [];

		let upstream = 0; // 502, 503, 504
		let client = 0; // 4xx
		let system = 0; // 500
		let other = 0;

		for (const item of data.items ?? []) {
			const code = Number(item.status_code ?? 0);
			const count = Number(item.sla ?? 0);
			if (!Number.isFinite(code) || !Number.isFinite(count)) continue;

			if (code === 502 || code === 503 || code === 504) upstream += count;
			else if (code >= 400 && code < 500) client += count;
			else if (code === 500) system += count;
			else other += count;
		}

		const out: ErrorCategory[] = [];
		if (upstream > 0)
			out.push({
				label: $_('admin.ops.upstream', { default: '上游' }),
				count: upstream,
				color: CAT_COLORS.upstream
			});
		if (client > 0)
			out.push({
				label: $_('admin.ops.client', { default: '客户端' }),
				count: client,
				color: CAT_COLORS.client
			});
		if (system > 0)
			out.push({
				label: $_('admin.ops.system', { default: '系统' }),
				count: system,
				color: CAT_COLORS.system
			});
		if (other > 0)
			out.push({
				label: $_('admin.ops.other', { default: '其他' }),
				count: other,
				color: CAT_COLORS.other
			});
		return out;
	});

	const topReason = $derived.by<ErrorCategory | null>(() => {
		if (categories.length === 0) return null;
		return categories.reduce((prev, cur) => (cur.count > prev.count ? cur : prev));
	});

	const chartData = $derived.by(() => {
		if (!hasData || categories.length === 0) return null;
		return {
			labels: categories.map((c) => c.label),
			datasets: [
				{
					data: categories.map((c) => c.count),
					backgroundColor: categories.map((c) => c.color),
					borderWidth: 0
				}
			]
		};
	});

	const chartOptions = {
		responsive: true,
		maintainAspectRatio: false,
		cutout: '65%',
		plugins: {
			legend: { display: false },
			tooltip: {
				backgroundColor: '#18181b', // zinc-900
				titleColor: '#fafafa', // zinc-50
				bodyColor: '#a1a1aa' // zinc-400
			}
		}
	};

	let DoughnutCmp: unknown = $state(null);
	let chartReady = $state(false);
	let chartError = $state<string | null>(null);

	onMount(() => {
		let cancelled = false;
		if (typeof window === 'undefined') return;

		(async () => {
			try {
				const cjs = await import('chart.js/auto');
				const scjs = await import('svelte-chartjs');
				if (cancelled) return;
				void cjs;
				DoughnutCmp = scjs.Doughnut;
				chartReady = true;
			} catch (err) {
				if (cancelled) return;
				chartError = (err as Error)?.message ?? 'chart load failed';
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	function handleOpenDetails() {
		onOpenDetails?.();
	}
</script>

<Card class="flex h-full flex-col" data-testid="ops-error-distribution">
	<div class="mb-3.5 flex shrink-0 items-center justify-between">
		<h3 class="flex items-center gap-2 text-[13px] font-bold text-foreground">
			<svg
				class="shrink-0 text-primary"
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
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/>
			</svg>
			{$_('admin.ops.errorDistribution', { default: '错误分布' })}
		</h3>
		<Button
			type="button"
			variant="outline"
			size="sm"
			class="h-auto px-2 py-0.5 text-[11px]"
			disabled={chartState !== 'ready'}
			data-testid="ops-error-distribution-details"
			onclick={handleOpenDetails}
		>
			{$_('admin.ops.requestDetails.details', { default: '详情' })}
		</Button>
	</div>

	<div class="relative min-h-0 flex-1">
		{#if chartError}
			<div
				class="flex h-full items-center justify-center text-[13px] text-destructive"
				data-testid="ops-error-distribution-error"
			>
				{$_('admin.ops.charts.failed', { default: '加载图表失败' })}
			</div>
		{:else if chartState === 'ready' && chartData}
			<div class="flex h-full flex-col" data-testid="ops-error-distribution-ready">
				<div class="min-h-0 flex-1">
					{#if chartReady && DoughnutCmp}
						{@const DC = DoughnutCmp as unknown as import('svelte').Component<{
							data: NonNullable<typeof chartData>;
							options: typeof chartOptions;
						}>}
						<DC data={chartData} options={chartOptions} />
					{:else}
						<div
							class="flex h-full items-center justify-center text-[13px] text-muted-foreground"
							data-testid="ops-error-distribution-loading"
						>
							{$_('common.loading', { default: '加载中…' })}
						</div>
					{/if}
				</div>
				<div class="mt-3 flex flex-col items-center gap-1.5">
					{#if topReason}
						<div class="text-[11.5px] font-bold text-foreground">
							{$_('admin.ops.top', { default: '前' })}:
							<span style:color={topReason.color}>{topReason.label}</span>
						</div>
					{/if}
					<div class="flex flex-wrap justify-center gap-2">
						{#each categories as item (item.label)}
							<div class="flex items-center gap-[5px] text-[11px]">
								<span
									class="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
									style:background-color={item.color}
								></span>
								<span class="text-muted-foreground">{item.label}</span>
								<span class="font-medium text-foreground">{item.count}</span>
							</div>
						{/each}
					</div>
					<div class="text-[11px] text-muted-foreground" data-testid="ops-error-distribution-total">
						{$_('admin.ops.total', { default: '总计' })}: {totalSlaErrors}
					</div>
				</div>
			</div>
		{:else if chartState === 'loading'}
			<div
				class="flex h-full animate-pulse items-center justify-center text-[13px] text-muted-foreground"
				data-testid="ops-error-distribution-loading"
			>
				{$_('common.loading', { default: '加载中…' })}
			</div>
		{:else}
			<div
				class="flex h-full flex-col items-center justify-center gap-1 text-center"
				data-testid="ops-error-distribution-empty"
			>
				<div class="text-[13px] font-medium text-foreground">
					{$_('common.noData', { default: '暂无数据' })}
				</div>
				<div class="text-[12px] text-muted-foreground">
					{$_('admin.ops.charts.emptyError', { default: '该范围内无错误' })}
				</div>
			</div>
		{/if}
	</div>
</Card>

<style>
	:global([data-testid='ops-error-distribution'] canvas) {
		max-height: 100% !important;
	}
</style>
