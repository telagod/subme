<!--
  OpsConcurrencyCard · Svelte 5 (runes) rewrite of
  frontend/src/views/admin/ops/components/OpsConcurrencyCard.vue

  Self-fetching realtime concurrency + account-availability card.
  Dimension is derived from the active filters:
    - platform (no filters)        → platform summary rows
    - platformFilter set           → group summary rows
    - groupIdFilter set (> 0)      → account detail rows
    - "by user" toggle on          → user concurrency rows (separate endpoint)

  Refresh cadence is owned by the parent via `refreshToken`; we re-fetch when it
  changes (and on the user-view toggle). Zinc-only load bars; status badges use
  semantic tokens (consistent with the sibling features/admin-ops/ops.ts helpers).
  NO chart.
-->
<script lang="ts" module>
	import type {
		AccountAvailability,
		AccountConcurrencyInfo,
		GroupAvailability,
		GroupConcurrencyInfo,
		OpsAccountAvailabilityStatsResponse,
		OpsConcurrencyStatsResponse,
		OpsUserConcurrencyStatsResponse,
		PlatformAvailability,
		PlatformConcurrencyInfo,
		UserConcurrencyInfo
	} from '$lib/api/admin/ops';

	export type ConcurrencyDimension = 'platform' | 'group' | 'account' | 'user';

	export interface SummaryRow {
		key: string;
		name: string;
		platform: string;
		totalAccounts: number;
		availableAccounts: number;
		rateLimitedAccounts: number;
		errorAccounts: number;
		totalConcurrency: number;
		usedConcurrency: number;
		waitingInQueue: number;
		availabilityPct: number;
		concurrencyPct: number;
	}

	export interface AccountRow {
		key: string;
		name: string;
		platform: string;
		groupName: string;
		currentInUse: number;
		maxCapacity: number;
		waitingInQueue: number;
		loadPercentage: number;
		isAvailable: boolean;
		isRateLimited: boolean;
		rateLimitRemainingSec: number;
		isOverloaded: boolean;
		overloadRemainingSec: number;
		hasError: boolean;
		errorMessage: string;
	}

	export interface UserRow {
		key: string;
		userId: number;
		userEmail: string;
		username: string;
		currentInUse: number;
		maxCapacity: number;
		waitingInQueue: number;
		loadPercentage: number;
	}

	export function safeNumber(value: unknown): number {
		return typeof value === 'number' && Number.isFinite(value) ? value : 0;
	}

	function pct(used: number, total: number): number {
		return total > 0 ? Math.round((used / total) * 100) : 0;
	}

	export function deriveDimension(
		platformFilter: string,
		groupIdFilter: number | null,
		showByUser: boolean
	): ConcurrencyDimension {
		if (showByUser) return 'user';
		if (typeof groupIdFilter === 'number' && groupIdFilter > 0) return 'account';
		if (platformFilter) return 'group';
		return 'platform';
	}

	export function buildPlatformRows(
		concurrency: OpsConcurrencyStatsResponse | null,
		availability: OpsAccountAvailabilityStatsResponse | null
	): SummaryRow[] {
		const conc = concurrency?.platform ?? {};
		const avail = availability?.platform ?? {};
		const keys = new Set<string>([...Object.keys(conc), ...Object.keys(avail)]);

		return Array.from(keys)
			.map((platform): SummaryRow => {
				const c = (conc[platform] ?? {}) as Partial<PlatformConcurrencyInfo>;
				const a = (avail[platform] ?? {}) as Partial<PlatformAvailability>;
				const totalAccounts = safeNumber(a.total_accounts);
				const availableAccounts = safeNumber(a.available_count);
				const totalConcurrency = safeNumber(c.max_capacity);
				const usedConcurrency = safeNumber(c.current_in_use);
				return {
					key: platform,
					name: platform.toUpperCase(),
					platform,
					totalAccounts,
					availableAccounts,
					rateLimitedAccounts: safeNumber(a.rate_limit_count),
					errorAccounts: safeNumber(a.error_count),
					totalConcurrency,
					usedConcurrency,
					waitingInQueue: safeNumber(c.waiting_in_queue),
					availabilityPct: pct(availableAccounts, totalAccounts),
					concurrencyPct: pct(usedConcurrency, totalConcurrency)
				};
			})
			.sort((a, b) => b.concurrencyPct - a.concurrencyPct);
	}

	export function buildGroupRows(
		concurrency: OpsConcurrencyStatsResponse | null,
		availability: OpsAccountAvailabilityStatsResponse | null,
		platformFilter: string
	): SummaryRow[] {
		const conc = concurrency?.group ?? {};
		const avail = availability?.group ?? {};
		const keys = new Set<string>([...Object.keys(conc), ...Object.keys(avail)]);

		return Array.from(keys)
			.map((gid): SummaryRow | null => {
				const c = (conc[gid] ?? {}) as Partial<GroupConcurrencyInfo>;
				const a = (avail[gid] ?? {}) as Partial<GroupAvailability>;
				if (platformFilter && c.platform !== platformFilter && a.platform !== platformFilter) {
					return null;
				}
				const totalAccounts = safeNumber(a.total_accounts);
				const availableAccounts = safeNumber(a.available_count);
				const totalConcurrency = safeNumber(c.max_capacity);
				const usedConcurrency = safeNumber(c.current_in_use);
				return {
					key: gid,
					name: String(c.group_name || a.group_name || `Group ${gid}`),
					platform: String(c.platform || a.platform || ''),
					totalAccounts,
					availableAccounts,
					rateLimitedAccounts: safeNumber(a.rate_limit_count),
					errorAccounts: safeNumber(a.error_count),
					totalConcurrency,
					usedConcurrency,
					waitingInQueue: safeNumber(c.waiting_in_queue),
					availabilityPct: pct(availableAccounts, totalAccounts),
					concurrencyPct: pct(usedConcurrency, totalConcurrency)
				};
			})
			.filter((row): row is SummaryRow => row !== null)
			.sort((a, b) => b.concurrencyPct - a.concurrencyPct);
	}

	export function buildAccountRows(
		concurrency: OpsConcurrencyStatsResponse | null,
		availability: OpsAccountAvailabilityStatsResponse | null,
		groupIdFilter: number | null
	): AccountRow[] {
		const conc = concurrency?.account ?? {};
		const avail = availability?.account ?? {};
		const keys = new Set<string>([...Object.keys(conc), ...Object.keys(avail)]);
		const hasGroupFilter = typeof groupIdFilter === 'number' && groupIdFilter > 0;

		return Array.from(keys)
			.map((aid): AccountRow | null => {
				const c = (conc[aid] ?? {}) as Partial<AccountConcurrencyInfo>;
				const a = (avail[aid] ?? {}) as Partial<AccountAvailability>;
				if (hasGroupFilter && c.group_id !== groupIdFilter && a.group_id !== groupIdFilter) {
					return null;
				}
				return {
					key: aid,
					name: String(c.account_name || a.account_name || `Account ${aid}`),
					platform: String(c.platform || a.platform || ''),
					groupName: String(c.group_name || a.group_name || ''),
					currentInUse: safeNumber(c.current_in_use),
					maxCapacity: safeNumber(c.max_capacity),
					waitingInQueue: safeNumber(c.waiting_in_queue),
					loadPercentage: safeNumber(c.load_percentage),
					isAvailable: a.is_available ?? false,
					isRateLimited: a.is_rate_limited ?? false,
					rateLimitRemainingSec: safeNumber(a.rate_limit_remaining_sec),
					isOverloaded: a.is_overloaded ?? false,
					overloadRemainingSec: safeNumber(a.overload_remaining_sec),
					hasError: a.has_error ?? false,
					errorMessage: a.error_message ?? ''
				};
			})
			.filter((row): row is AccountRow => row !== null)
			.sort((a, b) => {
				if (a.hasError !== b.hasError) return a.hasError ? -1 : 1;
				if (a.isRateLimited !== b.isRateLimited) return a.isRateLimited ? -1 : 1;
				return b.loadPercentage - a.loadPercentage;
			});
	}

	export function buildUserRows(
		userConcurrency: OpsUserConcurrencyStatsResponse | null
	): UserRow[] {
		const users = userConcurrency?.user ?? {};
		return Object.keys(users)
			.map((uid): UserRow => {
				const u = (users[uid] ?? {}) as Partial<UserConcurrencyInfo>;
				return {
					key: uid,
					userId: safeNumber(u.user_id),
					userEmail: u.user_email || `User ${uid}`,
					username: u.username || '',
					currentInUse: safeNumber(u.current_in_use),
					maxCapacity: safeNumber(u.max_capacity),
					waitingInQueue: safeNumber(u.waiting_in_queue),
					loadPercentage: safeNumber(u.load_percentage)
				};
			})
			.sort(
				(a, b) => b.currentInUse - a.currentInUse || b.loadPercentage - a.loadPercentage
			);
	}

	/** Zinc-only load bar fill — no emerald/amber/red, no raw hex. */
	export function loadBarClass(loadPct: number): string {
		if (loadPct >= 90) return 'bg-zinc-900 dark:bg-zinc-100';
		if (loadPct >= 50) return 'bg-zinc-600 dark:bg-zinc-300';
		return 'bg-zinc-400 dark:bg-zinc-500';
	}

	export function clampPct(loadPct: number): number {
		return Math.min(100, Math.max(0, loadPct));
	}

	export function formatRemaining(seconds: number): string {
		if (seconds <= 0) return '0s';
		if (seconds < 60) return `${Math.round(seconds)}s`;
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m`;
		return `${Math.floor(minutes / 60)}h`;
	}
</script>

<script lang="ts">
	import { _ } from 'svelte-i18n';
	import {
		getOpsAccountAvailability,
		getOpsConcurrencyStats,
		getOpsUserConcurrencyStats
	} from '$lib/api/admin/ops';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';

	interface Props {
		platformFilter?: string;
		groupIdFilter?: number | null;
		refreshToken: number;
	}

	let { platformFilter = '', groupIdFilter = null, refreshToken }: Props = $props();

	let loading = $state(false);
	let errorMessage = $state('');
	let showByUser = $state(false);

	let concurrency = $state<OpsConcurrencyStatsResponse | null>(null);
	let availability = $state<OpsAccountAvailabilityStatsResponse | null>(null);
	let userConcurrency = $state<OpsUserConcurrencyStatsResponse | null>(null);

	const realtimeEnabled = $derived(
		(concurrency?.enabled ?? true) && (availability?.enabled ?? true)
	);

	const dimension = $derived(deriveDimension(platformFilter, groupIdFilter, showByUser));

	const platformRows = $derived(buildPlatformRows(concurrency, availability));
	const groupRows = $derived(buildGroupRows(concurrency, availability, platformFilter));
	const accountRows = $derived(buildAccountRows(concurrency, availability, groupIdFilter));
	const userRows = $derived(buildUserRows(userConcurrency));

	const rowCount = $derived(
		dimension === 'user'
			? userRows.length
			: dimension === 'account'
				? accountRows.length
				: dimension === 'group'
					? groupRows.length
					: platformRows.length
	);

	const dimensionTitle = $derived(
		dimension === 'user'
			? $_('admin.ops.concurrency.byUser', { default: '按用户' })
			: dimension === 'account'
				? $_('admin.ops.concurrency.byAccount', { default: '按账户' })
				: dimension === 'group'
					? $_('admin.ops.concurrency.byGroup', { default: '按分组' })
					: $_('admin.ops.concurrency.byPlatform', { default: '按平台' })
	);

	async function loadData() {
		loading = true;
		errorMessage = '';
		try {
			if (showByUser) {
				userConcurrency = await getOpsUserConcurrencyStats();
			} else {
				const params: { platform?: string; group_id?: number } = {};
				if (platformFilter) params.platform = platformFilter;
				if (typeof groupIdFilter === 'number' && groupIdFilter > 0) {
					params.group_id = groupIdFilter;
				}
				const [concData, availData] = await Promise.all([
					getOpsConcurrencyStats(params),
					getOpsAccountAvailability(params)
				]);
				concurrency = concData;
				availability = availData;
			}
		} catch (err) {
			errorMessage =
				(err as { message?: string })?.message ||
				$_('admin.ops.concurrency.loadFailed', { default: '加载并发数据失败。' });
		} finally {
			loading = false;
		}
	}

	function toggleByUser() {
		showByUser = !showByUser;
		void loadData();
	}

	// Initial load + parent-driven refresh. Skip refresh while realtime is disabled,
	// but always allow the very first fetch (concurrency === null) to resolve the flag.
	$effect(() => {
		// track refreshToken so the effect re-runs when the parent ticks it.
		refreshToken;
		const firstLoad = concurrency === null && availability === null && userConcurrency === null;
		if (firstLoad || realtimeEnabled) {
			void loadData();
		}
	});
</script>

<Card class="flex h-full flex-col">
	<div class="mb-3 flex flex-shrink-0 items-center justify-between">
		<h3 class="flex items-center gap-2 text-sm font-semibold text-foreground">
			<svg
				class="flex-shrink-0 text-muted-foreground"
				width="14"
				height="14"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				aria-hidden="true"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M13 10V3L4 14h7v7l9-11h-7z"
				/>
			</svg>
			{$_('admin.ops.concurrency.title', { default: '并发 & 可用性' })}
		</h3>
		<div class="flex items-center gap-1.5">
			<Button
				variant="outline"
				size="icon"
				class={showByUser ? 'border-primary/40 bg-primary/10 text-primary' : ''}
				aria-pressed={showByUser}
				data-testid="concurrency-toggle-user"
				title={showByUser
					? $_('admin.ops.concurrency.switchToPlatform', { default: '切换到平台视图' })
					: $_('admin.ops.concurrency.switchToUser', { default: '切换到用户视图' })}
				aria-label={showByUser
					? $_('admin.ops.concurrency.switchToPlatform', { default: '切换到平台视图' })
					: $_('admin.ops.concurrency.switchToUser', { default: '切换到用户视图' })}
				onclick={toggleByUser}
			>
				<svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
					/>
				</svg>
			</Button>
			<Button
				variant="outline"
				size="icon"
				disabled={loading}
				data-testid="concurrency-refresh"
				title={$_('common.refresh', { default: '刷新' })}
				aria-label={$_('common.refresh', { default: '刷新' })}
				onclick={() => void loadData()}
			>
				<svg
					width="13"
					height="13"
					class={loading ? 'animate-spin' : ''}
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
					/>
				</svg>
			</Button>
		</div>
	</div>

	{#if errorMessage}
		<div
			class="mb-2.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
			data-testid="concurrency-error"
		>
			{errorMessage}
		</div>
	{/if}

	{#if !realtimeEnabled}
		<div
			class="flex flex-1 items-center justify-center rounded-md border border-dashed border-border px-3 py-6 text-sm text-muted-foreground"
		>
			{$_('admin.ops.concurrency.disabledHint', {
				default: '实时监控已禁用。'
			})}
		</div>
	{:else}
		<div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
			<div
				class="flex flex-shrink-0 items-center justify-between border-b border-border bg-muted px-3 py-1.5"
			>
				<span class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
					{dimensionTitle}
				</span>
				<span class="text-[10px] text-muted-foreground">
					{$_('admin.ops.concurrency.totalRows', {
						default: '{count} rows',
						values: { count: rowCount }
					})}
				</span>
			</div>

			{#if rowCount === 0}
				<div
					class="flex flex-1 items-center justify-center px-3 py-6 text-sm text-muted-foreground"
					data-testid="concurrency-empty"
				>
					{$_('admin.ops.concurrency.empty', { default: '当前视图暂无数据。' })}
				</div>
			{:else if dimension === 'user'}
				<div class="max-h-[360px] flex-1 space-y-1.5 overflow-y-auto p-2.5">
					{#each userRows as row (row.key)}
						<div class="rounded-md bg-muted p-2.5">
							<div class="mb-1.5 flex items-center justify-between gap-2">
								<div class="flex min-w-0 flex-1 items-center gap-1.5">
									<span
										class="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-bold text-foreground"
										title={row.username || row.userEmail}
									>
										{row.username || row.userEmail}
									</span>
									{#if row.username}
										<span
											class="flex-shrink-0 overflow-hidden text-ellipsis text-[10px] text-muted-foreground"
											title={row.userEmail}
										>
											{row.userEmail}
										</span>
									{/if}
								</div>
								<div class="flex flex-shrink-0 items-center gap-1.5 text-[10px]">
									<span class="font-mono font-bold tabular-nums text-foreground">
										{row.currentInUse}/{row.maxCapacity}
									</span>
									<span class="font-bold text-muted-foreground">
										{Math.round(row.loadPercentage)}%
									</span>
								</div>
							</div>
							<div class="my-1 h-[5px] overflow-hidden rounded-full bg-background">
								<div
									class="h-full rounded-full transition-all duration-300 {loadBarClass(
										row.loadPercentage
									)}"
									style="width: {clampPct(row.loadPercentage)}%"
								></div>
							</div>
							{#if row.waitingInQueue > 0}
								<div class="mt-1 flex justify-end">
									<Badge variant="outline" class="border-primary/40 bg-primary/10 text-primary">
										{$_('admin.ops.concurrency.queued', {
											default: '{count} queued',
											values: { count: row.waitingInQueue }
										})}
									</Badge>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{:else if dimension === 'platform' || dimension === 'group'}
				<div class="max-h-[360px] flex-1 space-y-1.5 overflow-y-auto p-2.5">
					{#each dimension === 'group' ? groupRows : platformRows as row (row.key)}
						<div class="rounded-md bg-muted p-2.5">
							<div class="mb-1.5 flex items-center justify-between gap-2">
								<div class="flex items-center gap-1.5">
									<span
										class="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-bold text-foreground"
										title={row.name}
									>
										{row.name}
									</span>
									{#if dimension === 'group' && row.platform}
										<span class="text-[10px] text-muted-foreground">
											{row.platform.toUpperCase()}
										</span>
									{/if}
								</div>
								<div class="flex flex-shrink-0 items-center gap-1.5 text-[10px]">
									<span class="font-mono font-bold tabular-nums text-foreground">
										{row.usedConcurrency}/{row.totalConcurrency}
									</span>
									<span class="font-bold text-muted-foreground">{row.concurrencyPct}%</span>
								</div>
							</div>
							<div class="my-1 mb-1.5 h-[5px] overflow-hidden rounded-full bg-background">
								<div
									class="h-full rounded-full transition-all duration-300 {loadBarClass(
										row.concurrencyPct
									)}"
									style="width: {clampPct(row.concurrencyPct)}%"
								></div>
							</div>
							<div class="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[10px]">
								<div class="flex items-center gap-1">
									<svg
										width="11"
										height="11"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										class="text-muted-foreground"
										aria-hidden="true"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
										/>
									</svg>
									<span class="text-muted-foreground">
										<span class="font-bold text-foreground">{row.availableAccounts}</span>/{row.totalAccounts}
									</span>
									<span class="text-muted-foreground">{row.availabilityPct}%</span>
								</div>
								{#if row.rateLimitedAccounts > 0}
									<Badge
										variant="outline"
										class="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
									>
										{$_('admin.ops.concurrency.rateLimited', {
											default: '{count} rate-limited',
											values: { count: row.rateLimitedAccounts }
										})}
									</Badge>
								{/if}
								{#if row.errorAccounts > 0}
									<Badge
										variant="outline"
										class="border-destructive/40 bg-destructive/10 text-destructive"
									>
										{$_('admin.ops.concurrency.errorAccounts', {
											default: '{count} errored',
											values: { count: row.errorAccounts }
										})}
									</Badge>
								{/if}
								{#if row.waitingInQueue > 0}
									<Badge variant="outline" class="border-primary/40 bg-primary/10 text-primary">
										{$_('admin.ops.concurrency.queued', {
											default: '{count} queued',
											values: { count: row.waitingInQueue }
										})}
									</Badge>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="max-h-[360px] flex-1 space-y-1.5 overflow-y-auto p-2.5">
					{#each accountRows as row (row.key)}
						<div class="rounded-md bg-muted p-2.5">
							<div class="mb-1.5 flex items-center justify-between gap-2">
								<div class="min-w-0 flex-1">
									<div
										class="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-bold text-foreground"
										title={row.name}
									>
										{row.name}
									</div>
									<div class="mt-px text-[9px] text-muted-foreground">{row.groupName}</div>
								</div>
								<div class="flex flex-shrink-0 items-center gap-1.5">
									<span class="font-mono text-[11px] font-bold tabular-nums text-foreground">
										{row.currentInUse}/{row.maxCapacity}
									</span>
									{#if row.isAvailable}
										<Badge
											variant="outline"
											class="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
										>
											<svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
											</svg>
											{$_('admin.ops.accountAvailability.available', { default: '可用' })}
										</Badge>
									{:else if row.isRateLimited}
										<Badge
											variant="outline"
											class="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
										>
											<svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
											</svg>
											{formatRemaining(row.rateLimitRemainingSec)}
										</Badge>
									{:else if row.isOverloaded}
										<Badge
											variant="outline"
											class="gap-1 border-destructive/40 bg-destructive/10 text-destructive"
										>
											<svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
											</svg>
											{formatRemaining(row.overloadRemainingSec)}
										</Badge>
									{:else if row.hasError}
										<Badge
											variant="outline"
											class="gap-1 border-destructive/40 bg-destructive/10 text-destructive"
											title={row.errorMessage}
										>
											<svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
											</svg>
											{$_('admin.ops.accountAvailability.accountError', { default: '错误' })}
										</Badge>
									{:else}
										<Badge variant="secondary">
											{$_('admin.ops.accountAvailability.unavailable', { default: '不可用' })}
										</Badge>
									{/if}
								</div>
							</div>
							<div class="my-1 h-[5px] overflow-hidden rounded-full bg-background">
								<div
									class="h-full rounded-full transition-all duration-300 {loadBarClass(
										row.loadPercentage
									)}"
									style="width: {clampPct(row.loadPercentage)}%"
								></div>
							</div>
							{#if row.waitingInQueue > 0}
								<div class="mt-1 flex justify-end">
									<Badge variant="outline" class="border-primary/40 bg-primary/10 text-primary">
										{$_('admin.ops.concurrency.queued', {
											default: '{count} queued',
											values: { count: row.waitingInQueue }
										})}
									</Badge>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</Card>
