import type { ChannelMonitor, MonitorStatus, Provider } from '$lib/api/admin/channelMonitor';

export const ALL = '__all__';
export const PAGE_SIZE = 20;

export function summarizeMonitors(rows: ChannelMonitor[]) {
	return [
		{ label: 'Total', value: rows.length },
		{ label: 'Enabled', value: rows.filter((r) => r.enabled).length },
		{ label: 'Operational', value: rows.filter((r) => r.primary_status === 'operational').length },
		{ label: 'Avg availability', value: averageAvailability(rows) }
	];
}

export function formatAvailability(row: Pick<ChannelMonitor, 'availability_7d'>): string {
	if (!Number.isFinite(row.availability_7d)) return '—';
	return `${row.availability_7d.toFixed(2)}%`;
}

export function formatLatency(value?: number | null): string {
	if (!Number.isFinite(value ?? Number.NaN)) return '—';
	return `${Math.round(value as number)} ms`;
}

export function formatDate(value?: string | null): string {
	if (!value) return '—';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString();
}

export function providerLabel(provider: Provider | string): string {
	switch (provider) {
		case 'openai':
			return 'OpenAI';
		case 'anthropic':
			return 'Anthropic';
		case 'gemini':
			return 'Gemini';
		default:
			return provider || '—';
	}
}

export function providerTone(provider: Provider | string): string {
	switch (provider) {
		case 'openai':
			return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
		case 'anthropic':
			return 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300';
		case 'gemini':
			return 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300';
		default:
			return 'border-border bg-muted text-muted-foreground';
	}
}

export function statusTone(status: MonitorStatus | ''): string {
	switch (status) {
		case 'operational':
			return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
		case 'degraded':
			return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
		case 'failed':
			return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300';
		case 'error':
			return 'border-destructive/30 bg-destructive/10 text-destructive';
		default:
			return 'border-border bg-background text-muted-foreground';
	}
}

export function parseExtraModels(value: string): string[] {
	return value
		.split(/[\n,]/)
		.map((v) => v.trim())
		.filter(Boolean);
}

function averageAvailability(rows: ChannelMonitor[]): number {
	const values = rows.map((r) => r.availability_7d).filter((v) => Number.isFinite(v));
	if (!values.length) return 0;
	return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 100) / 100;
}
