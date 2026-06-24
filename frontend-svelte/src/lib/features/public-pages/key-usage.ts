export type DateRangeKey = 'today' | '7d' | '30d' | 'custom';
export type DailyUsageDays = 7 | 30 | 90;

export interface UsageWindow {
	requests?: number;
	input_tokens?: number;
	output_tokens?: number;
	cache_creation_tokens?: number;
	cache_read_tokens?: number;
	total_tokens?: number;
	actual_cost?: number;
	[key: string]: unknown;
}

export interface KeyUsageResponse {
	mode?: 'quota_limited' | string;
	isValid?: boolean;
	status?: string;
	planName?: string;
	balance?: number;
	remaining?: number;
	quota?: {
		limit?: number;
		used?: number;
		remaining?: number;
		unit?: string;
	};
	rate_limits?: Array<{
		window: string;
		used: number;
		limit: number;
		reset_at?: string | null;
	}>;
	subscription?: {
		daily_usage_usd?: number;
		daily_limit_usd?: number;
		weekly_usage_usd?: number;
		weekly_limit_usd?: number;
		monthly_usage_usd?: number;
		monthly_limit_usd?: number;
		expires_at?: string | null;
		[key: string]: unknown;
	} | null;
	usage?: {
		today?: UsageWindow;
		total?: UsageWindow;
		rpm?: number;
		tpm?: number;
		average_duration_ms?: number;
		[key: string]: unknown;
	};
	daily_usage?: DailyUsageRow[];
	model_stats?: ModelUsageRow[];
	expires_at?: string | null;
	days_until_expiry?: number | null;
	[key: string]: unknown;
}

export interface DailyUsageRow {
	date: string;
	requests?: number;
	input_tokens?: number;
	output_tokens?: number;
	cache_read_tokens?: number;
	cache_write_tokens?: number;
	cost?: number;
	actual_cost?: number;
}

export interface ModelUsageRow {
	model?: string;
	requests?: number;
	input_tokens?: number;
	output_tokens?: number;
	cache_creation_tokens?: number;
	cache_read_tokens?: number;
	total_tokens?: number;
	cost?: number;
	actual_cost?: number;
}

export interface DateParamsInput {
	range: DateRangeKey;
	dailyUsageDays: DailyUsageDays;
	customStartDate?: string;
	customEndDate?: string;
	now?: Date;
	timezone?: string;
}

export interface StatCell {
	label: string;
	value: string;
}

export interface RingItem {
	title: string;
	pct: number;
	amount: string;
	isBalance?: boolean;
	resetAt?: string | null;
}

function dateOnly(date: Date): string {
	return date.toISOString().split('T')[0] ?? '';
}

export function getBrowserTimezone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
	} catch {
		return 'UTC';
	}
}

export function buildKeyUsageQueryParams(input: DateParamsInput): string {
	const now = input.now ?? new Date();
	const params = new URLSearchParams();

	if (input.range === 'custom') {
		if (input.customStartDate && input.customEndDate) {
			params.set('start_date', input.customStartDate);
			params.set('end_date', input.customEndDate);
		}
	} else {
		const end = dateOnly(now);
		const days = input.range === 'today' ? 0 : input.range === '7d' ? 7 : 30;
		const start = dateOnly(new Date(now.getTime() - days * 86_400_000));
		params.set('start_date', start);
		params.set('end_date', end);
	}

	params.set('days', String(input.dailyUsageDays));
	params.set('timezone', input.timezone ?? getBrowserTimezone());
	return params.toString();
}

export async function fetchKeyUsage(
	key: string,
	params: string,
	fetcher: typeof fetch = fetch
): Promise<KeyUsageResponse> {
	const url = `/v1/usage${params ? `?${params}` : ''}`;
	const res = await fetcher(url, {
		headers: { Authorization: `Bearer ${key}` }
	});
	if (!res.ok) {
		const body = await res.json().catch(() => null) as
			| { error?: { message?: string } | string; message?: string }
			| null;
		const message =
			(typeof body?.error === 'object' ? body.error.message : body?.error) ??
			body?.message ??
			`Query failed (${res.status})`;
		throw new Error(message);
	}
	return (await res.json()) as KeyUsageResponse;
}

export function usd(value: number | null | undefined): string {
	if (value == null || value < 0) return '-';
	return `$${Number(value).toFixed(2)}`;
}

export function fmtNum(value: number | null | undefined): string {
	if (value == null) return '-';
	return Number(value).toLocaleString();
}

export function usageColor(pct: number): string {
	if (pct > 90) return 'text-rose-500';
	if (pct > 70) return 'text-amber-500';
	return 'text-emerald-500';
}

export function summarizeUsageStats(data: KeyUsageResponse | null | undefined): StatCell[] {
	const usage = data?.usage;
	if (!usage) return [];
	const today = usage.today ?? {};
	const total = usage.total ?? {};
	return [
		{ label: 'Today Requests', value: fmtNum(today.requests) },
		{ label: 'Today Input', value: fmtNum(today.input_tokens) },
		{ label: 'Today Output', value: fmtNum(today.output_tokens) },
		{ label: 'Today Tokens', value: fmtNum(today.total_tokens) },
		{ label: 'Today Cache Creation', value: fmtNum(today.cache_creation_tokens) },
		{ label: 'Today Cache Read', value: fmtNum(today.cache_read_tokens) },
		{ label: 'Today Cost', value: usd(today.actual_cost) },
		{ label: 'RPM / TPM', value: `${usage.rpm || 0} / ${usage.tpm || 0}` },
		{ label: 'Total Requests', value: fmtNum(total.requests) },
		{ label: 'Total Input', value: fmtNum(total.input_tokens) },
		{ label: 'Total Output', value: fmtNum(total.output_tokens) },
		{ label: 'Total Tokens', value: fmtNum(total.total_tokens) },
		{ label: 'Total Cache Creation', value: fmtNum(total.cache_creation_tokens) },
		{ label: 'Total Cache Read', value: fmtNum(total.cache_read_tokens) },
		{ label: 'Total Cost', value: usd(total.actual_cost) },
		{
			label: 'Avg Duration',
			value: usage.average_duration_ms ? `${Math.round(usage.average_duration_ms)} ms` : '-'
		}
	];
}

export function buildRingItems(data: KeyUsageResponse | null | undefined): RingItem[] {
	if (!data) return [];
	const items: RingItem[] = [];

	if (data.mode === 'quota_limited') {
		if (data.quota) {
			const used = Number(data.quota.used ?? 0);
			const limit = Number(data.quota.limit ?? 0);
			const pct = limit > 0 ? Math.min(Math.round((used / limit) * 100), 100) : 0;
			items.push({ title: 'Total Quota', pct, amount: `${usd(used)} / ${usd(limit)}` });
		}
		for (const rl of data.rate_limits ?? []) {
			const pct = rl.limit > 0 ? Math.min(Math.round((rl.used / rl.limit) * 100), 100) : 0;
			items.push({
				title: rl.window,
				pct,
				amount: `${usd(rl.used)} / ${usd(rl.limit)}`,
				resetAt: rl.reset_at
			});
		}
		return items;
	}

	const sub = data.subscription;
	if (sub) {
		for (const row of [
			{ title: 'Daily Limit', used: sub.daily_usage_usd, limit: sub.daily_limit_usd },
			{ title: 'Weekly Limit', used: sub.weekly_usage_usd, limit: sub.weekly_limit_usd },
			{ title: 'Monthly Limit', used: sub.monthly_usage_usd, limit: sub.monthly_limit_usd }
		]) {
			if (row.limit != null && row.limit > 0) {
				const pct = Math.min(Math.round(((row.used ?? 0) / row.limit) * 100), 100);
				items.push({
					title: row.title,
					pct,
					amount: `${usd(row.used)} / ${usd(row.limit)}`
				});
			}
		}
	}

	if (!sub && data.balance != null) {
		items.push({ title: 'Wallet Balance', pct: 0, amount: usd(data.balance), isBalance: true });
	}

	return items;
}
