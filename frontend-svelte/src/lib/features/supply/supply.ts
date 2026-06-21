import type { Account } from '$lib/api/admin/accounts';
import type { Channel, ChannelModelPricing } from '$lib/api/admin/channels';
import type { AdminGroup } from '$lib/api/admin/groups';
import type { Proxy } from '$lib/api/admin/proxies';

export const ALL = '__all__';
export const PAGE_SIZE = 20;
export const VIRTUAL_THRESHOLD = 50;

export function accountIsSchedulable(account: Account): boolean {
	if (typeof account.schedulable === 'boolean') return account.schedulable;
	if (typeof account.is_schedulable === 'boolean') return account.is_schedulable;
	return account.status === 'active';
}

export function accountPoolMode(account: Account): boolean {
	return account.credentials?.pool_mode === true;
}

export function formatGroupNames(account: Account): string {
	if (account.groups?.length) return account.groups.map((g) => g.name).join(', ');
	if (account.group_ids?.length) return account.group_ids.map((id) => `#${id}`).join(', ');
	return 'None';
}

export function formatProxyLabel(proxy?: Proxy | null, proxyId?: number | null): string {
	if (proxy) return `${proxy.name} · ${proxy.protocol}://${proxy.host}:${proxy.port}`;
	if (proxyId) return `#${proxyId}`;
	return 'None';
}

export function proxyAccountCount(proxy: Proxy): number {
	return Number(proxy.accounts_count ?? proxy.total_accounts ?? 0);
}

export function groupAccountCount(group: AdminGroup): number {
	return Number(group.total_accounts ?? 0);
}

export function channelPricingRowCount(channel: Channel): number {
	return (channel.model_pricing ?? []).reduce((sum, p) => sum + Math.max(1, p.models?.length ?? 0), 0);
}

export function flattenChannelPricing(channels: Channel[]): ChannelPricingRow[] {
	const rows: ChannelPricingRow[] = [];
	for (const channel of channels) {
		const pricing = channel.model_pricing ?? [];
		if (pricing.length === 0) {
			rows.push({
				key: `${channel.id}:empty`,
				channel,
				pricing: null,
				model: 'No explicit pricing'
			});
			continue;
		}
		for (const p of pricing) {
			const models = p.models?.length ? p.models : ['*'];
			for (const model of models) {
				rows.push({
					key: `${channel.id}:${p.platform}:${model}`,
					channel,
					pricing: p,
					model
				});
			}
		}
	}
	return rows;
}

export interface ChannelPricingRow {
	key: string;
	channel: Channel;
	pricing: ChannelModelPricing | null;
	model: string;
}

export function formatPrice(value: number | null | undefined): string {
	if (value === null || value === undefined) return '-';
	const n = Number(value);
	if (!Number.isFinite(n)) return '-';
	return n === 0 ? '$0' : `$${n.toExponential(2)}`;
}

export function statusTone(status: string | undefined): string {
	switch ((status ?? '').toLowerCase()) {
		case 'active':
		case 'success':
			return 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20';
		case 'inactive':
		case 'disabled':
			return 'bg-zinc-500/10 text-zinc-700 ring-zinc-500/20';
		case 'error':
		case 'expired':
		case 'failed':
			return 'bg-red-500/10 text-red-700 ring-red-500/20';
		case 'rate_limited':
		case 'limited':
			return 'bg-amber-500/10 text-amber-700 ring-amber-500/20';
		default:
			return 'bg-sky-500/10 text-sky-700 ring-sky-500/20';
	}
}

export function summarizeAccounts(accounts: Account[]): SupplySummary[] {
	return [
		{ label: 'Total', value: accounts.length },
		{ label: 'Active', value: accounts.filter((a) => a.status === 'active').length },
		{ label: 'Pool mode', value: accounts.filter(accountPoolMode).length },
		{ label: 'Schedulable', value: accounts.filter(accountIsSchedulable).length }
	];
}

export function summarizeGroups(groups: AdminGroup[]): SupplySummary[] {
	return [
		{ label: 'Total', value: groups.length },
		{ label: 'Active', value: groups.filter((g) => g.status === 'active').length },
		{ label: 'Exclusive', value: groups.filter((g) => g.is_exclusive).length },
		{ label: 'Accounts', value: groups.reduce((sum, g) => sum + groupAccountCount(g), 0) }
	];
}

export function summarizeProxies(proxies: Proxy[]): SupplySummary[] {
	return [
		{ label: 'Total', value: proxies.length },
		{ label: 'Active', value: proxies.filter((p) => p.status === 'active').length },
		{ label: 'Expired', value: proxies.filter((p) => p.status === 'expired').length },
		{ label: 'Accounts', value: proxies.reduce((sum, p) => sum + proxyAccountCount(p), 0) }
	];
}

export function summarizeChannels(channels: Channel[]): SupplySummary[] {
	return [
		{ label: 'Channels', value: channels.length },
		{ label: 'Active', value: channels.filter((c) => c.status === 'active').length },
		{ label: 'Groups', value: channels.reduce((sum, c) => sum + (c.group_ids?.length ?? 0), 0) },
		{ label: 'Pricing rows', value: channels.reduce((sum, c) => sum + channelPricingRowCount(c), 0) }
	];
}

export interface SupplySummary {
	label: string;
	value: number;
}

