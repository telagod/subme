import type {
	MonitorStatus,
	UserMonitorDetail,
	UserMonitorView
} from '$lib/api/user/channelMonitor';

export type MonitorWindow = '7d' | '15d' | '30d';
export type OverallStatus = 'operational' | 'degraded' | 'unavailable';

export function overallStatus(items: UserMonitorView[]): OverallStatus {
	if (!items.length) return 'operational';
	if (items.some((item) => item.primary_status === 'failed' || item.primary_status === 'error')) {
		return 'degraded';
	}
	if (items.some((item) => item.primary_status !== 'operational')) return 'degraded';
	return 'operational';
}

export function filterMonitors(items: UserMonitorView[], query: string): UserMonitorView[] {
	const q = query.trim().toLowerCase();
	if (!q) return items;
	return items.filter((item) =>
		[
			item.name,
			item.provider,
			item.group_name,
			item.primary_model,
			...item.extra_models.map((extra) => extra.model)
		].some((value) => value.toLowerCase().includes(q))
	);
}

export function formatAvailability(value?: number | null): string {
	if (!Number.isFinite(value ?? Number.NaN)) return '—';
	return `${(value as number).toFixed(2)}%`;
}

export function formatLatency(value?: number | null): string {
	if (!Number.isFinite(value ?? Number.NaN)) return '—';
	return `${Math.round(value as number)} ms`;
}

export function availabilityForWindow(model: UserMonitorDetail['models'][number], window: MonitorWindow): number {
	if (window === '15d') return model.availability_15d;
	if (window === '30d') return model.availability_30d;
	return model.availability_7d;
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

export function providerTone(provider: string): string {
	switch (provider) {
		case 'openai':
			return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
		case 'anthropic':
			return 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300';
		case 'gemini':
			return 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300';
		default:
			return 'border-border bg-background text-muted-foreground';
	}
}
