import type {
	DashboardSnapshot,
	DashboardStats,
	GroupStat,
	ModelStat,
	TrendDataPoint,
	UserUsageTrendPoint,
	UserSpendingRankingItem,
	UserUsageTrendDetailPoint
} from '$lib/api/admin/dashboard';

export type { UserSpendingRankingItem, UserUsageTrendDetailPoint };

/** Chart palette for multi-series line charts */
export const CHART_COLORS = [
	'#3b82f6', '#10b981', '#f59e0b', '#ef4444',
	'#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
	'#6366f1', '#84cc16', '#06b6d4', '#e11d48'
];

export function numberValue(value: unknown): number {
	const n = Number(value ?? 0);
	return Number.isFinite(n) ? n : 0;
}

export function formatCompact(value: unknown): string {
	return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(
		numberValue(value)
	);
}

export function formatMoney(value: unknown): string {
	return new Intl.NumberFormat('en', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 4
	}).format(numberValue(value));
}

export function formatCost(value: unknown): string {
	const n = numberValue(value);
	if (n >= 1000) return `${(n / 1000).toFixed(2)}K`;
	if (n >= 1) return n.toFixed(2);
	if (n >= 0.01) return n.toFixed(3);
	return n.toFixed(4);
}

export function formatDuration(ms: unknown): string {
	const n = numberValue(ms);
	if (n <= 0) return '-';
	if (n < 1000) return `${Math.round(n)} ms`;
	return `${(n / 1000).toFixed(1)} s`;
}

export function normalizeStats(snapshot: DashboardSnapshot): DashboardStats {
	return snapshot.stats ?? {};
}

export function topModels(snapshot: DashboardSnapshot, limit = 8): ModelStat[] {
	return [...(snapshot.models ?? [])]
		.sort((a, b) => numberValue(b.actual_cost ?? b.cost) - numberValue(a.actual_cost ?? a.cost))
		.slice(0, limit);
}

export function topGroups(snapshot: DashboardSnapshot, limit = 8): GroupStat[] {
	return [...(snapshot.groups ?? [])]
		.sort((a, b) => numberValue(b.requests) - numberValue(a.requests))
		.slice(0, limit);
}

export function topUsers(snapshot: DashboardSnapshot, limit = 8): UserUsageTrendPoint[] {
	return [...(snapshot.users_trend ?? [])]
		.sort((a, b) => numberValue(b.actual_cost ?? b.cost) - numberValue(a.actual_cost ?? a.cost))
		.slice(0, limit);
}

export function recentTrend(snapshot: DashboardSnapshot, limit = 10): TrendDataPoint[] {
	return [...(snapshot.trend ?? [])].slice(-limit);
}

/**
 * Build user trend chart data from detail points grouped by user.
 * Returns { labels, datasets } ready for ChartIsland type="line".
 */
export function buildUserTrendChartData(
	points: UserUsageTrendDetailPoint[]
): { labels: string[]; datasets: Record<string, unknown>[] } {
	if (!points.length) return { labels: [], datasets: [] };

	const userGroups = new Map<number, { name: string; data: Map<string, number> }>();
	const allDates = new Set<string>();

	for (const p of points) {
		allDates.add(p.date);
		if (!userGroups.has(p.user_id)) {
			const name = p.username?.trim() || p.email?.trim() || `User #${p.user_id}`;
			userGroups.set(p.user_id, { name, data: new Map() });
		}
		userGroups.get(p.user_id)!.data.set(p.date, p.tokens);
	}

	const sortedDates = Array.from(allDates).sort();

	const datasets = Array.from(userGroups.values()).map((g, i) => ({
		label: g.name,
		data: sortedDates.map((d) => g.data.get(d) || 0),
		borderColor: CHART_COLORS[i % CHART_COLORS.length],
		backgroundColor: `${CHART_COLORS[i % CHART_COLORS.length]}20`,
		fill: false,
		tension: 0.3
	}));

	return { labels: sortedDates, datasets };
}

/**
 * Build model distribution doughnut data.
 * @param metric 'tokens' | 'actual_cost'
 */
export function buildModelDoughnutData(
	models: ModelStat[],
	metric: 'tokens' | 'actual_cost' = 'actual_cost'
): { labels: string[]; datasets: Record<string, unknown>[] } {
	const sorted = [...models]
		.sort((a, b) => numberValue(b[metric] ?? b.cost) - numberValue(a[metric] ?? a.cost))
		.slice(0, 10);

	return {
		labels: sorted.map((m) => m.model ?? m.name ?? 'unknown'),
		datasets: [{
			label: metric === 'actual_cost' ? 'Cost' : 'Tokens',
			data: sorted.map((m) => numberValue(m[metric] ?? (metric === 'actual_cost' ? m.cost : m.tokens))),
			backgroundColor: CHART_COLORS.slice(0, sorted.length)
		}]
	};
}

export interface KpiCard {
	key: string;
	label: string;
	value: string;
	sub: string;
}

export function buildKpis(stats: DashboardStats): KpiCard[] {
	return [
		{
			key: 'api-keys',
			label: 'API Keys',
			value: formatCompact(stats.total_api_keys),
			sub: `${formatCompact(stats.active_api_keys)} active`
		},
		{
			key: 'accounts',
			label: 'Accounts',
			value: formatCompact(stats.total_accounts),
			sub: `${formatCompact(stats.normal_accounts)} active · ${formatCompact(stats.error_accounts)} errors`
		},
		{
			key: 'requests',
			label: 'Today Requests',
			value: formatCompact(stats.today_requests),
			sub: `${formatCompact(stats.total_requests)} all time`
		},
		{
			key: 'users',
			label: 'Users',
			value: formatCompact(stats.total_users),
			sub: `+${formatCompact(stats.today_new_users)} today`
		},
		{
			key: 'tokens',
			label: 'Today Tokens',
			value: formatCompact(stats.today_tokens),
			sub: `$${formatCost(stats.today_actual_cost ?? stats.today_cost)} / $${formatCost(stats.today_account_cost)} / $${formatCost(stats.today_cost)}`
		},
		{
			key: 'total-tokens',
			label: 'Total Tokens',
			value: formatCompact(stats.total_tokens),
			sub: `$${formatCost(stats.total_actual_cost ?? stats.total_cost)} / $${formatCost(stats.total_account_cost)} / $${formatCost(stats.total_cost)}`
		},
		{
			key: 'throughput',
			label: 'Throughput',
			value: `${formatCompact(stats.rpm)} RPM`,
			sub: `${formatCompact(stats.tpm)} TPM`
		},
		{
			key: 'latency',
			label: 'Avg Response',
			value: formatDuration(stats.average_duration_ms),
			sub: `${formatCompact(stats.active_users)} active users`
		}
	];
}

/** Default date helpers */
export function defaultStartDate(): string {
	const d = new Date();
	d.setDate(d.getDate() - 1);
	return formatLocalDate(d);
}

export function defaultEndDate(): string {
	return formatLocalDate(new Date());
}

export function formatLocalDate(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function granularityForRange(start: string, end: string): 'day' | 'hour' {
	const s = new Date(`${start}T00:00:00`).getTime();
	const e = new Date(`${end}T00:00:00`).getTime();
	return Math.ceil((e - s) / (1000 * 60 * 60 * 24)) <= 1 ? 'hour' : 'day';
}

