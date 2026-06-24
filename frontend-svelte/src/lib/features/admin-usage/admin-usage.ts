import type { AdminUsageLog, AdminUsageStatsResponse, EndpointStat } from '$lib/api/admin/usage';

export const ALL = '__all__';
export const PAGE_SIZE = 20;
export const EXPORT_PAGE_SIZE = 1000;

export interface UsageSummaryItem {
	label: string;
	value: string;
	raw: number;
}

export function summarizeUsageStats(stats: AdminUsageStatsResponse | null): UsageSummaryItem[] {
	return [
		{
			label: 'Requests',
			value: formatInteger(stats?.total_requests),
			raw: numeric(stats?.total_requests)
		},
		{
			label: 'Tokens',
			value: formatTokens(stats?.total_tokens),
			raw: numeric(stats?.total_tokens)
		},
		{
			label: 'User billed',
			value: formatMoney(stats?.total_actual_cost ?? stats?.total_cost, 6),
			raw: numeric(stats?.total_actual_cost ?? stats?.total_cost)
		},
		{
			label: 'Avg duration',
			value: formatDuration(stats?.average_duration_ms),
			raw: numeric(stats?.average_duration_ms)
		}
	];
}

export function usageUserLabel(row: AdminUsageLog): string {
	return firstText(row.user?.email, row.user?.username, row.user_id === undefined ? undefined : `#${row.user_id}`);
}

export function usageApiKeyLabel(row: AdminUsageLog): string {
	return firstText(row.api_key?.name, row.api_key_id === undefined ? undefined : `#${row.api_key_id}`);
}

export function usageAccountLabel(row: AdminUsageLog): string {
	return firstText(row.account?.name, row.account_id === undefined ? undefined : `#${row.account_id}`);
}

export function usageGroupLabel(row: AdminUsageLog): string {
	return firstText(row.group?.name, row.group_id === undefined ? undefined : `#${row.group_id}`);
}

export function usageEndpointLabel(row: AdminUsageLog): string {
	const inbound = cleanText(row.inbound_endpoint);
	const upstream = cleanText(row.upstream_endpoint);
	const path = cleanText(row.endpoint_path);
	if (inbound && upstream && inbound !== upstream) return `${inbound} -> ${upstream}`;
	return firstText(inbound, upstream, path);
}

export function usageModelLabel(row: AdminUsageLog): string {
	const model = cleanText(row.model);
	const upstream = cleanText(row.upstream_model);
	if (model && upstream && model !== upstream) return `${model} -> ${upstream}`;
	return firstText(model, upstream);
}

export function totalTokens(row: AdminUsageLog): number {
	const explicit = numeric(row.total_tokens, Number.NaN);
	if (Number.isFinite(explicit)) return explicit;
	return (
		numeric(row.input_tokens) +
		numeric(row.output_tokens) +
		numeric(row.cache_read_tokens) +
		numeric(row.cache_creation_tokens)
	);
}

export function accountBilled(row: AdminUsageLog): number {
	const explicit = numeric(row.account_stats_cost, Number.NaN);
	if (Number.isFinite(explicit)) return explicit;
	return numeric(row.total_cost) * numeric(row.account_rate_multiplier, 1);
}

export function requestTypeLabel(row: AdminUsageLog): string {
	if (row.request_type === 'ws_v2' || row.openai_ws_mode) return 'WebSocket';
	if (row.request_type === 'stream' || row.stream === true) return 'Stream';
	if (row.request_type === 'sync' || row.stream === false) return 'Sync';
	return 'Unknown';
}

export function statusLabel(row: AdminUsageLog): string {
	return firstText(row.status, row.status_code, 'ok');
}

export function statusTone(row: AdminUsageLog): string {
	const status = statusLabel(row).toLowerCase();
	if (status === 'ok' || status === 'success' || status === '200') {
		return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
	}
	if (status.startsWith('4') || status.includes('error') || status.includes('fail')) {
		return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
	}
	if (status.startsWith('5')) {
		return 'border-destructive/30 bg-destructive/10 text-destructive';
	}
	return 'border-border bg-background text-muted-foreground';
}

export function endpointStatLabel(stat: EndpointStat): string {
	return firstText(stat.endpoint, stat.path, stat.name);
}

export function endpointStatRequests(stat: EndpointStat): number {
	return numeric(stat.requests);
}

export function formatInteger(value?: number | null): string {
	if (!Number.isFinite(value ?? Number.NaN)) return '0';
	return new Intl.NumberFormat().format(value as number);
}

export function formatTokens(value?: number | null): string {
	if (!Number.isFinite(value ?? Number.NaN)) return '0';
	const n = value as number;
	if (Math.abs(n) >= 1_000_000) return `${round1(n / 1_000_000)}M`;
	if (Math.abs(n) >= 1_000) return `${round1(n / 1_000)}K`;
	return formatInteger(n);
}

export function formatMoney(value?: number | null, digits = 4): string {
	if (!Number.isFinite(value ?? Number.NaN)) return '$0.0000';
	return `$${(value as number).toFixed(digits)}`;
}

export function formatDuration(value?: number | null): string {
	if (!Number.isFinite(value ?? Number.NaN)) return '—';
	const n = value as number;
	if (n >= 1000) return `${round1(n / 1000)}s`;
	return `${Math.round(n)}ms`;
}

export function formatDateTime(value?: string | null): string {
	if (!value) return '—';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString();
}

export function escapeCsvValue(value: unknown): string {
	let s = value === null || value === undefined ? '' : String(value);
	if (/^[=+\-@]/.test(s)) s = `'${s}`;
	if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
	return s;
}

function firstText(...values: unknown[]): string {
	for (const value of values) {
		const text = cleanText(value);
		if (text) return text;
	}
	return '—';
}

function cleanText(value: unknown): string {
	if (value === null || value === undefined) return '';
	return String(value).trim();
}

function numeric(value: unknown, fallback = 0): number {
	const n = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(n) ? n : fallback;
}

function round1(value: number): string {
	return String(Math.round(value * 10) / 10);
}


const CSV_HEADERS = ['timestamp', 'model', 'endpoint', 'request_type', 'input_tokens', 'output_tokens', 'total_tokens', 'cost', 'actual_cost', 'status', 'duration_ms', 'user', 'api_key', 'account', 'group'];

export function buildCsvContent(rows: AdminUsageLog[]): string {
	const lines: string[] = [CSV_HEADERS.join(',')];
	for (const r of rows) {
		lines.push(CSV_HEADERS.map((h) => escapeCsvValue((r as Record<string, unknown>)[h])).join(','));
	}
	return lines.join('\n');
}

export async function buildXlsxBlob(rows: AdminUsageLog[]): Promise<Blob> {
	const csv = buildCsvContent(rows);
	return new Blob([csv], { type: 'text/csv;charset=utf-8' });
}

export function downloadBlob(blob: Blob, filename: string): void {
	if (typeof document === 'undefined') return;
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	try { URL.revokeObjectURL(url); } catch { /* noop */ }
}

export const REQUEST_TYPE_OPTIONS = [{ value: '__all__', label: 'All types' }, ...['chat', 'completion', 'embedding', 'image', 'audio', 'rerank', 'response'].map((v) => ({ value: v, label: v }))];
export const BILLING_MODE_OPTIONS = [{ value: '__all__', label: 'All billing' }, { value: 'standard', label: 'standard' }, { value: 'subscription', label: 'subscription' }, { value: 'credit', label: 'credit' }];
export const SORT_OPTIONS = [{ value: 'created_at:desc', label: 'Newest' }, { value: 'created_at:asc', label: 'Oldest' }, { value: 'total_cost:desc', label: 'Highest cost' }, { value: 'total_tokens:desc', label: 'Most tokens' }, { value: 'duration_ms:desc', label: 'Slowest' }];
