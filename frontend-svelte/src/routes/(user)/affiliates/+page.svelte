<script lang="ts">
	/**
	 * /(user)/affiliates · subme-only affiliate dashboard
	 *
	 * 设计：
	 *   - 顶部：Referral card —— code + Copy + 邀请链接 + QR（dynamic import 'qrcode'，
	 *     落 vendor-qrcode lazy 岛，与 M7 TotpEnrollDialog 共享 chunk）。
	 *   - 中部：3 stat cards —— totalInvited / totalRebate（available + frozen 分行）
	 *     / pendingWithdrawals。
	 *   - 下半：lg:grid-cols-2 —— Invited users 列表 + Rebate ledger 列表，
	 *     各自独立分页 + 各自独立错误兜底。
	 *   - Request withdrawal 按钮 → WithdrawalDialog（仅当 availableRebate >= minAmount）。
	 *   - admin "Custom user config" 入口不暴露（user-side only）。
	 *
	 * RED LINES：
	 *   - apiClient 已统一 401；错误 message='unauthorized' 静默返回。
	 *   - reshadcn-migration: rebate status Select 用 '__all__' sentinel；
	 *     严禁 <option value="">。
	 *   - 不在顶层 import qrcode；只在 onMount → await import 触发 vendor-qrcode 懒岛。
	 *   - email-mask：邀请人 email 部分脱敏（local@domain → l***@domain）。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import {
		Users,
		Copy,
		RotateCw,
		QrCode,
		Banknote,
		AlertTriangle,
		Wallet,
		TrendingUp,
		Clock,
		Snowflake
	} from '@lucide/svelte';
	import {
		getReferralInfo,
		listInvitedUsers,
		listRebateLedger,
		type ReferralInfo,
		type AffiliateInvitee,
		type RebateRecord,
		type RebateStatus
	} from '$lib/api/user/affiliates';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import WithdrawalDialog from '$lib/features/affiliates/WithdrawalDialog.svelte';

	// reshadcn-migration: '__all__' sentinel 禁空字符串 value。
	const STATUS_ALL = '__all__' as const;
	const PAGE_SIZE_INVITED = 10;
	const PAGE_SIZE_REBATE = 10;
	// 后端规定的最小提现额；当前 hardcode，未来从 publicSettings 读。
	const MIN_WITHDRAWAL = 10;

	// ── state ───────────────────────────────────────────────────────────
	let referral = $state<ReferralInfo | null>(null);
	let loadingReferral = $state(true);
	let referralError = $state<string | null>(null);

	let invited = $state<AffiliateInvitee[]>([]);
	let invitedTotal = $state(0);
	let invitedPages = $state(0);
	let invitedPage = $state(1);
	let loadingInvited = $state(true);
	let invitedError = $state<string | null>(null);

	let rebates = $state<RebateRecord[]>([]);
	let rebatesTotal = $state(0);
	let rebatesPages = $state(0);
	let rebatesPage = $state(1);
	let rebatesStatus = $state<typeof STATUS_ALL | RebateStatus>(STATUS_ALL);
	let loadingRebates = $state(true);
	let rebatesError = $state<string | null>(null);

	// Withdrawal dialog
	let withdrawalOpen = $state(false);

	// QR
	let qrDataUrl = $state<string | null>(null);
	let qrError = $state<string | null>(null);

	// ── loaders ─────────────────────────────────────────────────────────

	async function loadReferral() {
		loadingReferral = true;
		referralError = null;
		try {
			referral = await getReferralInfo();
			// 落入 referral 后立即触发 QR 渲染（lazy import 'qrcode'）。
			void renderQr();
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			if (msg === 'unauthorized') return;
			referralError = msg || 'load failed';
			showError(
				$_('user.affiliates.loadFailed', { default: 'Failed to load affiliate info' })
			);
		} finally {
			loadingReferral = false;
		}
	}

	async function loadInvited() {
		loadingInvited = true;
		invitedError = null;
		try {
			const resp = await listInvitedUsers({
				page: invitedPage,
				pageSize: PAGE_SIZE_INVITED
			});
			invited = resp.items;
			invitedTotal = resp.total;
			invitedPages = resp.pages;
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			if (msg === 'unauthorized') return;
			invitedError = msg || 'load failed';
			invited = [];
			invitedTotal = 0;
			invitedPages = 0;
		} finally {
			loadingInvited = false;
		}
	}

	async function loadRebates() {
		loadingRebates = true;
		rebatesError = null;
		try {
			const resp = await listRebateLedger({
				page: rebatesPage,
				pageSize: PAGE_SIZE_REBATE,
				status: rebatesStatus
			});
			rebates = resp.items;
			rebatesTotal = resp.total;
			rebatesPages = resp.pages;
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			if (msg === 'unauthorized') return;
			rebatesError = msg || 'load failed';
			rebates = [];
			rebatesTotal = 0;
			rebatesPages = 0;
		} finally {
			loadingRebates = false;
		}
	}

	function refreshAll() {
		void loadReferral();
		void loadInvited();
		void loadRebates();
	}

	onMount(() => {
		refreshAll();
	});

	// ── QR render（dynamic import 落 vendor-qrcode lazy chunk） ──────────

	async function renderQr() {
		qrError = null;
		if (!referral?.link) return;
		try {
			const mod: unknown = await import('qrcode');
			const QR = (mod as { default?: unknown }).default ?? mod;
			const fn = (QR as { toDataURL?: (text: string) => Promise<string> }).toDataURL;
			if (typeof fn !== 'function') throw new Error('qrcode toDataURL missing');
			qrDataUrl = await fn(referral.link);
		} catch (err) {
			qrError = (err as Error)?.message ?? 'qr render failed';
		}
	}

	// ── clipboard ────────────────────────────────────────────────────────

	async function copyText(text: string, successMsg: string) {
		try {
			if (navigator?.clipboard?.writeText) {
				await navigator.clipboard.writeText(text);
				showSuccess(successMsg);
				return;
			}
		} catch {
			// 落入 fallback
		}
		// Fallback：execCommand('copy') 兼容老浏览器 / 无 clipboard 权限。
		try {
			const ta = document.createElement('textarea');
			ta.value = text;
			ta.style.position = 'fixed';
			ta.style.opacity = '0';
			document.body.appendChild(ta);
			ta.select();
			const ok = document.execCommand('copy');
			document.body.removeChild(ta);
			if (ok) {
				showSuccess(successMsg);
			} else {
				showError($_('user.affiliates.copyFailed', { default: 'Failed to copy' }));
			}
		} catch {
			showError($_('user.affiliates.copyFailed', { default: 'Failed to copy' }));
		}
	}

	function copyCode() {
		if (!referral?.code) return;
		void copyText(
			referral.code,
			$_('user.affiliates.codeCopied', { default: 'Code copied' })
		);
	}

	function copyLink() {
		if (!referral?.link) return;
		void copyText(
			referral.link,
			$_('user.affiliates.linkCopied', { default: 'Link copied' })
		);
	}

	// ── pagination handlers ──────────────────────────────────────────────

	function invitedPrev() {
		if (invitedPage <= 1) return;
		invitedPage -= 1;
		void loadInvited();
	}
	function invitedNext() {
		if (invitedPages > 0 && invitedPage >= invitedPages) return;
		invitedPage += 1;
		void loadInvited();
	}
	function rebatesPrev() {
		if (rebatesPage <= 1) return;
		rebatesPage -= 1;
		void loadRebates();
	}
	function rebatesNext() {
		if (rebatesPages > 0 && rebatesPage >= rebatesPages) return;
		rebatesPage += 1;
		void loadRebates();
	}

	function handleStatusChange(e: Event) {
		const v = (e.currentTarget as HTMLSelectElement).value;
		rebatesStatus = v as typeof STATUS_ALL | RebateStatus;
		rebatesPage = 1;
		void loadRebates();
	}

	function openWithdrawal() {
		withdrawalOpen = true;
	}

	function handleWithdrawalCreated() {
		// 提现已落库 → 余额会变；refresh referral + ledger。
		void loadReferral();
		void loadRebates();
	}

	// ── format helpers ───────────────────────────────────────────────────

	function fmtMoney(v: number | null | undefined): string {
		if (v === null || v === undefined || !Number.isFinite(v)) return '—';
		const sign = v < 0 ? '-' : '';
		return `${sign}$${Math.abs(v).toFixed(2)}`;
	}

	function fmtDate(s: string | null | undefined): string {
		if (!s) return '—';
		try {
			return new Date(s).toLocaleDateString();
		} catch {
			return s;
		}
	}

	function fmtDateTime(s: string | null | undefined): string {
		if (!s) return '—';
		try {
			return new Date(s).toLocaleString();
		} catch {
			return s;
		}
	}

	function maskEmail(email: string): string {
		if (!email) return '—';
		const at = email.indexOf('@');
		if (at <= 1) return email;
		const local = email.slice(0, at);
		const domain = email.slice(at);
		const head = local.slice(0, 1);
		return `${head}${'*'.repeat(Math.max(local.length - 1, 1))}${domain}`;
	}

	function rebateStatusLabel(s: RebateStatus): string {
		return $_(`user.affiliates.rebateStatuses.${s}`, { default: s });
	}

	function rebateStatusBadgeClass(s: RebateStatus): string {
		switch (s) {
			case 'available':
				return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
			case 'frozen':
				return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300';
			case 'withdrawn':
				return 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
			case 'cancelled':
				return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
		}
	}

	const canWithdraw = $derived(
		!!referral && referral.availableRebate >= MIN_WITHDRAWAL
	);
</script>

<svelte:head>
	<title>{$_('nav.affiliate', { default: 'Affiliates' })} · sub2api</title>
</svelte:head>

<section class="space-y-6" data-testid="affiliates-page">
	<!-- Header -->
	<header class="flex flex-wrap items-start justify-between gap-4">
		<div class="space-y-1">
			<h1 class="text-2xl font-semibold tracking-tight text-foreground">
				{$_('user.affiliates.pageTitle', { default: 'Affiliates' })}
			</h1>
			<p class="text-sm text-muted-foreground">
				{$_('user.affiliates.pageSubtitle', {
					default: 'Invite users, earn rebates, and request withdrawals.'
				})}
			</p>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			<button
				type="button"
				aria-label={$_('user.affiliates.refresh', { default: 'Refresh' })}
				data-testid="affiliates-refresh-btn"
				onclick={refreshAll}
				class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
			>
				<RotateCw class="h-4 w-4" />
			</button>
			<button
				type="button"
				data-testid="affiliates-withdraw-btn"
				disabled={!canWithdraw}
				onclick={openWithdrawal}
				class="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
			>
				<Banknote class="h-4 w-4" />
				{$_('user.affiliates.requestWithdrawal', { default: 'Request withdrawal' })}
			</button>
		</div>
	</header>

	<!-- Referral card -->
	<section
		class="rounded-lg border border-border bg-card p-5 shadow-sm"
		data-testid="affiliates-referral-card"
	>
		{#if loadingReferral}
			<div class="space-y-3" data-testid="affiliates-referral-skeleton">
				<div class="h-5 w-32 animate-pulse rounded bg-muted"></div>
				<div class="h-10 w-full animate-pulse rounded bg-muted"></div>
				<div class="h-10 w-full animate-pulse rounded bg-muted"></div>
			</div>
		{:else if referralError && !referral}
			<div class="flex items-center gap-2 text-sm text-destructive" data-testid="affiliates-referral-error">
				<AlertTriangle class="h-4 w-4" />
				<span>
					{$_('user.affiliates.loadFailed', { default: 'Failed to load affiliate info' })}
				</span>
			</div>
		{:else if referral}
			<div class="grid gap-5 md:grid-cols-[1fr,auto]">
				<div class="space-y-4">
					<div>
						<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							{$_('user.affiliates.yourCode', { default: 'Your referral code' })}
						</p>
						<div class="mt-1.5 flex items-center gap-2">
							<code
								data-testid="affiliates-code"
								class="block flex-1 truncate rounded-md border border-input bg-muted/40 px-3 py-2 font-mono text-sm text-foreground"
							>
								{referral.code || '—'}
							</code>
							<button
								type="button"
								data-testid="affiliates-copy-code-btn"
								onclick={copyCode}
								aria-label={$_('user.affiliates.copyCode', { default: 'Copy code' })}
								class="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-accent"
							>
								<Copy class="h-3.5 w-3.5" />
								{$_('user.affiliates.copyCode', { default: 'Copy' })}
							</button>
						</div>
					</div>
					<div>
						<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							{$_('user.affiliates.inviteLink', { default: 'Invite link' })}
						</p>
						<div class="mt-1.5 flex items-center gap-2">
							<code
								data-testid="affiliates-link"
								class="block flex-1 truncate rounded-md border border-input bg-muted/40 px-3 py-2 font-mono text-xs text-foreground"
							>
								{referral.link || '—'}
							</code>
							<button
								type="button"
								data-testid="affiliates-copy-link-btn"
								onclick={copyLink}
								aria-label={$_('user.affiliates.copyLink', { default: 'Copy link' })}
								class="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-accent"
							>
								<Copy class="h-3.5 w-3.5" />
								{$_('user.affiliates.copyLink', { default: 'Copy' })}
							</button>
						</div>
					</div>
				</div>
				<div
					class="flex h-32 w-32 items-center justify-center self-center justify-self-end rounded-md border border-border bg-white p-2"
					data-testid="affiliates-qr-box"
				>
					{#if qrDataUrl}
						<img
							src={qrDataUrl}
							alt="referral QR code"
							data-testid="affiliates-qr-img"
							class="h-full w-full object-contain"
						/>
					{:else if qrError}
						<div class="flex items-center gap-1 text-xs text-muted-foreground" data-testid="affiliates-qr-error">
							<QrCode class="h-4 w-4" />
							<span>QR</span>
						</div>
					{:else}
						<QrCode class="h-6 w-6 text-muted-foreground" />
					{/if}
				</div>
			</div>
		{/if}
	</section>

	<!-- Stat cards -->
	<section
		class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
		data-testid="affiliates-stats"
	>
		<div class="rounded-lg border border-border bg-card p-4">
			<div class="flex items-center gap-2 text-muted-foreground">
				<Users class="h-4 w-4" />
				<span class="text-xs font-medium uppercase tracking-wide">
					{$_('user.affiliates.stats.totalInvited', { default: 'Total invited' })}
				</span>
			</div>
			<p
				class="mt-2 text-2xl font-semibold tabular-nums text-foreground"
				data-testid="affiliates-stat-invited"
			>
				{referral?.totalInvited ?? 0}
			</p>
		</div>
		<div class="rounded-lg border border-border bg-card p-4">
			<div class="flex items-center gap-2 text-muted-foreground">
				<TrendingUp class="h-4 w-4" />
				<span class="text-xs font-medium uppercase tracking-wide">
					{$_('user.affiliates.stats.totalRebate', { default: 'Total rebate' })}
				</span>
			</div>
			<p
				class="mt-2 text-2xl font-semibold tabular-nums text-foreground"
				data-testid="affiliates-stat-rebate"
			>
				{fmtMoney((referral?.availableRebate ?? 0) + (referral?.frozenRebate ?? 0))}
			</p>
			<div class="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
				<span class="inline-flex items-center gap-1">
					<Wallet class="h-3 w-3 text-emerald-600" />
					<span data-testid="affiliates-stat-available">
						{$_('user.affiliates.stats.available', { default: 'Available' })}:
						{fmtMoney(referral?.availableRebate ?? 0)}
					</span>
				</span>
				<span class="inline-flex items-center gap-1">
					<Snowflake class="h-3 w-3 text-sky-600" />
					<span data-testid="affiliates-stat-frozen">
						{$_('user.affiliates.stats.frozen', { default: 'Frozen' })}:
						{fmtMoney(referral?.frozenRebate ?? 0)}
					</span>
				</span>
			</div>
		</div>
		<div class="rounded-lg border border-border bg-card p-4">
			<div class="flex items-center gap-2 text-muted-foreground">
				<Clock class="h-4 w-4" />
				<span class="text-xs font-medium uppercase tracking-wide">
					{$_('user.affiliates.stats.pendingWithdrawals', {
						default: 'Pending withdrawals'
					})}
				</span>
			</div>
			<p
				class="mt-2 text-2xl font-semibold tabular-nums text-foreground"
				data-testid="affiliates-stat-pending"
			>
				{fmtMoney(referral?.pendingWithdrawals ?? 0)}
			</p>
		</div>
	</section>

	<!-- Lists: invited users + rebate ledger -->
	<div class="grid gap-6 lg:grid-cols-2">
		<!-- Invited users -->
		<section
			class="rounded-lg border border-border bg-card"
			data-testid="affiliates-invited-card"
		>
			<header class="flex items-center justify-between border-b border-border px-4 py-3">
				<h2 class="text-sm font-semibold text-foreground">
					{$_('user.affiliates.invited.title', { default: 'Invited users' })}
				</h2>
				<span class="text-xs text-muted-foreground" data-testid="affiliates-invited-total">
					{$_('user.affiliates.invited.totalLabel', {
						default: '{count} total',
						values: { count: invitedTotal }
					})}
				</span>
			</header>

			{#if loadingInvited}
				<div class="space-y-2 p-4" data-testid="affiliates-invited-loading">
					{#each Array.from({ length: 3 }) as _placeholder, i (i)}
						<div class="h-10 w-full animate-pulse rounded bg-muted"></div>
					{/each}
				</div>
			{:else if invitedError && invited.length === 0}
				<div class="p-6 text-center text-sm text-muted-foreground" data-testid="affiliates-invited-error">
					<p>{$_('user.affiliates.invited.loadFailed', { default: 'Failed to load invitees' })}</p>
				</div>
			{:else if invited.length === 0}
				<div class="p-6 text-center" data-testid="affiliates-invited-empty">
					<Users class="mx-auto h-8 w-8 text-muted-foreground" />
					<p class="mt-2 text-sm text-muted-foreground">
						{$_('user.affiliates.invited.empty', { default: 'No invited users yet' })}
					</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-sm" data-testid="affiliates-invited-table">
						<thead>
							<tr class="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
								<th class="px-4 py-2 text-left font-medium">
									{$_('user.affiliates.invited.colId', { default: 'ID' })}
								</th>
								<th class="px-4 py-2 text-left font-medium">
									{$_('user.affiliates.invited.colEmail', { default: 'Email' })}
								</th>
								<th class="px-4 py-2 text-left font-medium">
									{$_('user.affiliates.invited.colJoined', { default: 'Joined' })}
								</th>
								<th class="px-4 py-2 text-right font-medium">
									{$_('user.affiliates.invited.colSpend', { default: 'Spend' })}
								</th>
								<th class="px-4 py-2 text-right font-medium">
									{$_('user.affiliates.invited.colRebate', { default: 'Rebate' })}
								</th>
							</tr>
						</thead>
						<tbody>
							{#each invited as inv (inv.userId)}
								<tr
									data-testid="affiliates-invited-row"
									data-user-id={inv.userId}
									class="border-b border-border last:border-b-0 hover:bg-accent/40"
								>
									<td class="px-4 py-2 text-xs text-muted-foreground">{inv.userId}</td>
									<td class="px-4 py-2 text-xs" data-testid="affiliates-invited-email">
										{maskEmail(inv.email)}
									</td>
									<td class="px-4 py-2 text-xs text-muted-foreground">
										{fmtDate(inv.joinedAt)}
									</td>
									<td class="px-4 py-2 text-right tabular-nums text-xs">
										{fmtMoney(inv.totalSpend)}
									</td>
									<td class="px-4 py-2 text-right tabular-nums text-xs font-medium text-emerald-700 dark:text-emerald-400">
										{fmtMoney(inv.rebateGenerated)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				{#if invitedTotal > PAGE_SIZE_INVITED || invitedPages > 1}
					<div
						class="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground"
						data-testid="affiliates-invited-pagination"
					>
						<span>
							{$_('user.affiliates.pageOf', {
								default: 'Page {page} of {pages}',
								values: { page: invitedPage, pages: Math.max(invitedPages, 1) }
							})}
						</span>
						<div class="flex items-center gap-2">
							<button
								type="button"
								data-testid="affiliates-invited-prev"
								disabled={invitedPage <= 1}
								onclick={invitedPrev}
								class="inline-flex h-7 items-center justify-center rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
							>
								{$_('user.affiliates.prevPage', { default: 'Previous' })}
							</button>
							<button
								type="button"
								data-testid="affiliates-invited-next"
								disabled={invitedPages > 0 && invitedPage >= invitedPages}
								onclick={invitedNext}
								class="inline-flex h-7 items-center justify-center rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
							>
								{$_('user.affiliates.nextPage', { default: 'Next' })}
							</button>
						</div>
					</div>
				{/if}
			{/if}
		</section>

		<!-- Rebate ledger -->
		<section
			class="rounded-lg border border-border bg-card"
			data-testid="affiliates-rebates-card"
		>
			<header class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
				<h2 class="text-sm font-semibold text-foreground">
					{$_('user.affiliates.rebates.title', { default: 'Rebate ledger' })}
				</h2>
				<select
					id="affiliates-rebate-status"
					data-testid="affiliates-rebate-status-filter"
					value={rebatesStatus}
					onchange={handleStatusChange}
					class="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
				>
					<option value={STATUS_ALL}>
						{$_('user.affiliates.rebates.allStatuses', { default: 'All statuses' })}
					</option>
					<option value="available">{rebateStatusLabel('available')}</option>
					<option value="frozen">{rebateStatusLabel('frozen')}</option>
					<option value="withdrawn">{rebateStatusLabel('withdrawn')}</option>
					<option value="cancelled">{rebateStatusLabel('cancelled')}</option>
				</select>
			</header>

			{#if loadingRebates}
				<div class="space-y-2 p-4" data-testid="affiliates-rebates-loading">
					{#each Array.from({ length: 3 }) as _placeholder, i (i)}
						<div class="h-10 w-full animate-pulse rounded bg-muted"></div>
					{/each}
				</div>
			{:else if rebatesError && rebates.length === 0}
				<div class="p-6 text-center text-sm text-muted-foreground" data-testid="affiliates-rebates-error">
					<p>{$_('user.affiliates.rebates.loadFailed', { default: 'Failed to load rebate ledger' })}</p>
				</div>
			{:else if rebates.length === 0}
				<div class="p-6 text-center" data-testid="affiliates-rebates-empty">
					<TrendingUp class="mx-auto h-8 w-8 text-muted-foreground" />
					<p class="mt-2 text-sm text-muted-foreground">
						{$_('user.affiliates.rebates.empty', { default: 'No rebate records yet' })}
					</p>
				</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-sm" data-testid="affiliates-rebates-table">
						<thead>
							<tr class="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
								<th class="px-4 py-2 text-left font-medium">
									{$_('user.affiliates.rebates.colTimestamp', { default: 'Timestamp' })}
								</th>
								<th class="px-4 py-2 text-left font-medium">
									{$_('user.affiliates.rebates.colSource', { default: 'Source' })}
								</th>
								<th class="px-4 py-2 text-right font-medium">
									{$_('user.affiliates.rebates.colAmount', { default: 'Amount' })}
								</th>
								<th class="px-4 py-2 text-left font-medium">
									{$_('user.affiliates.rebates.colStatus', { default: 'Status' })}
								</th>
								<th class="px-4 py-2 text-left font-medium">
									{$_('user.affiliates.rebates.colFrozenUntil', { default: 'Frozen until' })}
								</th>
							</tr>
						</thead>
						<tbody>
							{#each rebates as r (r.id)}
								<tr
									data-testid="affiliates-rebate-row"
									data-rebate-id={r.id}
									data-status={r.status}
									class="border-b border-border last:border-b-0 hover:bg-accent/40"
								>
									<td class="px-4 py-2 text-xs text-muted-foreground">
										{fmtDateTime(r.timestamp)}
									</td>
									<td class="px-4 py-2 text-xs">
										{r.sourceEmail ? maskEmail(r.sourceEmail) : '—'}
									</td>
									<td class="px-4 py-2 text-right tabular-nums text-xs font-medium">
										{fmtMoney(r.amount)}
									</td>
									<td class="px-4 py-2">
										<span
											class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {rebateStatusBadgeClass(
												r.status
											)}"
										>
											{rebateStatusLabel(r.status)}
										</span>
									</td>
									<td class="px-4 py-2 text-xs text-muted-foreground">
										{r.status === 'frozen' ? fmtDate(r.frozenUntil) : '—'}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				{#if rebatesTotal > PAGE_SIZE_REBATE || rebatesPages > 1}
					<div
						class="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground"
						data-testid="affiliates-rebates-pagination"
					>
						<span>
							{$_('user.affiliates.pageOf', {
								default: 'Page {page} of {pages}',
								values: { page: rebatesPage, pages: Math.max(rebatesPages, 1) }
							})}
						</span>
						<div class="flex items-center gap-2">
							<button
								type="button"
								data-testid="affiliates-rebates-prev"
								disabled={rebatesPage <= 1}
								onclick={rebatesPrev}
								class="inline-flex h-7 items-center justify-center rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
							>
								{$_('user.affiliates.prevPage', { default: 'Previous' })}
							</button>
							<button
								type="button"
								data-testid="affiliates-rebates-next"
								disabled={rebatesPages > 0 && rebatesPage >= rebatesPages}
								onclick={rebatesNext}
								class="inline-flex h-7 items-center justify-center rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
							>
								{$_('user.affiliates.nextPage', { default: 'Next' })}
							</button>
						</div>
					</div>
				{/if}
			{/if}
		</section>
	</div>
</section>

<WithdrawalDialog
	bind:open={withdrawalOpen}
	availableRebate={referral?.availableRebate ?? 0}
	minAmount={MIN_WITHDRAWAL}
	onWithdrawalCreated={handleWithdrawalCreated}
/>
