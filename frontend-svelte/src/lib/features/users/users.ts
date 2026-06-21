import type { AdminUser } from '$lib/api/admin/users';

export const ALL = '__all__';
export const PAGE_SIZE = 20;

export interface UserSummaryItem {
	label: string;
	value: number;
}

export function summarizeUsers(users: AdminUser[]): UserSummaryItem[] {
	return [
		{ label: 'Total', value: users.length },
		{ label: 'Active', value: users.filter((u) => u.status === 'active').length },
		{ label: 'Admins', value: users.filter((u) => u.role === 'admin').length },
		{ label: 'Balance', value: round2(users.reduce((sum, u) => sum + numeric(u.balance), 0)) }
	];
}

export function userDisplayName(user: AdminUser): string {
	return (user.username || user.email || `#${user.id}`).trim();
}

export function userInitial(user: AdminUser): string {
	const source = user.username || user.email || String(user.id);
	return source.trim().charAt(0).toUpperCase() || '#';
}

export function userGroups(user: AdminUser): string {
	if (Array.isArray(user.groups) && user.groups.length) {
		return user.groups.map((g) => g.name).filter(Boolean).join(', ');
	}
	if (Array.isArray(user.group_names) && user.group_names.length) {
		return user.group_names.filter(Boolean).join(', ');
	}
	if (Array.isArray(user.allowed_groups) && user.allowed_groups.length) {
		return user.allowed_groups.map((id) => `#${id}`).join(', ');
	}
	return '—';
}

export function formatMoney(value?: number | null): string {
	if (!Number.isFinite(value ?? Number.NaN)) return '—';
	return `$${(value as number).toFixed(2)}`;
}

export function formatDate(value?: string | null): string {
	if (!value) return '—';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleDateString();
}

export function statusTone(status: string): string {
	switch (status) {
		case 'active':
			return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
		case 'disabled':
			return 'border-zinc-400/30 bg-zinc-400/10 text-muted-foreground';
		default:
			return 'border-border bg-muted text-muted-foreground';
	}
}

export function roleTone(role: string): string {
	return role === 'admin'
		? 'border-primary/30 bg-primary/10 text-primary'
		: 'border-border bg-background text-muted-foreground';
}

function numeric(value?: number | null): number {
	return Number.isFinite(value ?? Number.NaN) ? (value as number) : 0;
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}
