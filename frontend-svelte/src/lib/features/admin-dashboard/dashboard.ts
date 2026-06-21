import type {
	DashboardSnapshot,
	DashboardStats,
	GroupStat,
	ModelStat,
	TrendDataPoint,
	UserUsageTrendPoint
} from '$lib/api/admin/dashboard';

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
			sub: `${formatMoney(stats.today_actual_cost ?? stats.today_cost)} actual`
		},
		{
			key: 'total-tokens',
			label: 'Total Tokens',
			value: formatCompact(stats.total_tokens),
			sub: `${formatMoney(stats.total_actual_cost ?? stats.total_cost)} actual`
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

