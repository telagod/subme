import type { Announcement, AnnouncementTargeting } from '$lib/api/admin/announcements';

export const ALL = '__all__';
export const PAGE_SIZE = 20;
export const EMPTY_TARGETING: AnnouncementTargeting = { any_of: [] };

export function summarizeAnnouncements(rows: Announcement[]) {
	return [
		{ label: 'Total', value: rows.length },
		{ label: 'Active', value: rows.filter((r) => r.status === 'active').length },
		{ label: 'Draft', value: rows.filter((r) => r.status === 'draft').length },
		{ label: 'Popup', value: rows.filter((r) => r.notify_mode === 'popup').length }
	];
}

export function targetingSummary(targeting?: AnnouncementTargeting | null): string {
	const anyOf = targeting?.any_of ?? [];
	if (anyOf.length === 0) return 'All users';
	const conditions = anyOf.reduce((sum, group) => sum + (group.all_of?.length ?? 0), 0);
	return `${anyOf.length} group${anyOf.length === 1 ? '' : 's'} / ${conditions} condition${conditions === 1 ? '' : 's'}`;
}

export function statusTone(status: string): string {
	switch (status) {
		case 'active':
			return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
		case 'draft':
			return 'border-border bg-background text-muted-foreground';
		case 'archived':
			return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
		default:
			return 'border-border bg-muted text-muted-foreground';
	}
}

export function notifyTone(mode: string): string {
	return mode === 'popup'
		? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
		: 'border-border bg-background text-muted-foreground';
}

export function formatDate(value?: string | number | null): string {
	if (!value) return '—';
	const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
	if (Number.isNaN(date.getTime())) return String(value);
	return date.toLocaleString();
}

export function dateTimeLocalToUnix(value: string): number | undefined {
	if (!value) return undefined;
	const ts = new Date(value).getTime();
	return Number.isNaN(ts) ? undefined : Math.floor(ts / 1000);
}

export function parseTargetingJson(value: string): AnnouncementTargeting {
	const trimmed = value.trim();
	if (!trimmed) return EMPTY_TARGETING;
	const parsed = JSON.parse(trimmed) as AnnouncementTargeting;
	if (!parsed || typeof parsed !== 'object') return EMPTY_TARGETING;
	if (!Array.isArray(parsed.any_of)) return EMPTY_TARGETING;
	return parsed;
}
