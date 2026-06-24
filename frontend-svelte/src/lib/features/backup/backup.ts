import type { BackupRecord } from '$lib/api/admin/backup';

export function formatBackupSize(value?: number | null): string {
	if (!value || value <= 0) return '-';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let size = value;
	let unitIndex = 0;
	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex += 1;
	}
	const digits = unitIndex === 0 || size >= 10 ? 0 : 1;
	return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

export function formatBackupDate(value?: string | null): string {
	if (!value) return '-';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '-';
	return date.toLocaleString();
}

export function backupStatusLabel(record: BackupRecord): string {
	if (record.status === 'running' && typeof record.progress === 'string' && record.progress) {
		return record.progress;
	}
	return record.status || 'unknown';
}

export function backupStatusTone(status?: string | null): string {
	switch (status) {
		case 'completed':
			return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
		case 'running':
		case 'pending':
			return 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300';
		case 'failed':
			return 'border-destructive/30 bg-destructive/10 text-destructive';
		default:
			return 'text-muted-foreground';
	}
}

export function backupTriggerLabel(trigger?: string | null): string {
	return trigger === 'scheduled' ? 'scheduled' : 'manual';
}

export function normalizeRetainNumber(value: number | string | null | undefined, fallback: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function summarizeBackups(rows: BackupRecord[]) {
	return [
		{ label: 'Total', value: rows.length },
		{ label: 'Completed', value: rows.filter((row) => row.status === 'completed').length },
		{ label: 'Running', value: rows.filter((row) => row.status === 'running' || row.status === 'pending').length },
		{ label: 'Failed', value: rows.filter((row) => row.status === 'failed').length }
	];
}
