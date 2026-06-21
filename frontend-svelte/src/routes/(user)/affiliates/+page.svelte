<script lang="ts">
	/**
	 * /(user)/affiliates · subme-only affiliate dashboard
	 *
	 * GROUND TRUTH：用户侧仅两个端点 —— GET /aff（referral + inline invitees）与
	 * POST /aff/transfer（quota → balance）。不存在 withdraw / rebates / invitees /
	 * withdrawals 幻影路由，本页已全部移除。
	 *
	 * 设计：
	 *   - 顶部：Referral card —— code + Copy + 邀请链接 + QR（dynamic import 'qrcode'，
	 *     落 vendor-qrcode lazy 岛，与 M7 TotpEnrollDialog 共享 chunk）。
	 *   - 中部：3 stat cards —— totalInvited / totalRebate（available + frozen 分行）
	 *     / rebateRate。
	 *   - 下半：Invited users 列表（来自 /aff inline invitees，前端分页）。
	 *   - "Transfer to balance" 按钮 → TransferDialog（仅当 availableRebate > 0）。
	 *
	 * RED LINES：
	 *   - apiClient 已统一 401；错误 message='unauthorized' 静默返回。
	 *   - 不在顶层 import qrcode；只在 loadReferral → await import 触发 vendor-qrcode 懒岛。
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
		Percent,
		Snowflake
	} from '@lucide/svelte';
	import {
		getReferralInfo,
		type ReferralInfo,
		type AffiliateInvitee
	} from '$lib/api/user/affiliates';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import WithdrawalDialog from '$lib/features/affiliates/WithdrawalDialog.svelte';
	import Button from '$lib/ui/Button.svelte';

	const PAGE_SIZE_INVITED = 10;

	// ── state ───────────────────────────────────────────────────────────
	let referral = $state<ReferralInfo | null>(null);
	let loadingReferral = $state(true);
	let referralError = $state<string | null>(null);

	let invitedPage = $state(1);

	// Transfer dialog
	let transferOpen = $state(false);

	// QR
	let qrDataUrl = $state<string | null>(null);
	let qrError = $state<string | null>(null);

	// ── derived: invitees paginated client-side from inline /aff data ────
	const allInvitees = $derived<AffiliateInvitee[]>(referral?.invitees ?? []);
	const invitedTotal = $derived(referral?.totalInvited ?? allInvitees.length);
	const invitedPages = $derived(Math.max(1, Math.ceil(allInvitees.length / PAGE_SIZE_INVITED)));
	const invited = $derived(
		allInvitees.slice((invitedPage - 1) * PAGE_SIZE_INVITED, invitedPage * PAGE_SIZE_INVITED)
	);

	// ── loaders ─────────────────────────────────────────────────────────

	async function loadReferral() {
		loadingReferral = true;
		referralError = null;
		try {
			referral = await getReferralInfo();
			invitedPage = 1;
			// 落入 referral 后立即触发 QR 渲染（lazy import 'qrcode'）。
			void renderQr();
		} catch (err) {
			const msg = (err as Error)?.message ?? '';
			if (msg === 'unauthorized') return;
			referralError = msg || 'load failed';
			showError($_('user.affiliates.loadFailed', { default: 'Failed to load affiliate info' }));
		} finally {
			loadingReferral = false;
		}
	}

	function refreshAll() {
		void loadReferral();
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
		void copyText(referral.code, $_('user.affiliates.codeCopied', { default: 'Code copied' }));
	}

	function copyLink() {
		if (!referral?.link) return;
		void copyText(referral.link, $_('user.affiliates.linkCopied', { default: 'Link copied' }));
	}

	// ── pagination handlers ──────────────────────────────────────────────

	function invitedPrev() {
		if (invitedPage <= 1) return;
		invitedPage -= 1;
	}
	function invitedNext() {
		if (invitedPage >= invitedPages) return;
		invitedPage += 1;
	}

	function openTransfer() {
		transferOpen = true;
	}

	function handleTransferred() {
		// 转账已落库 → 可用 quota 归零 + 余额变化；refresh referral。
		void loadReferral();
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

	function maskEmail(email: string): string {
		if (!email) return '—';
		const at = email.indexOf('@');
		if (at <= 1) return email;
		const local = email.slice(0, at);
		const domain = email.slice(at);
		const head = local.slice(0, 1);
		return `${head}${'*'.repeat(Math.max(local.length - 1, 1))}${domain}`;
	}

	const canTransfer = $derived(!!referral && referral.availableRebate > 0);
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
					default: 'Invite users, earn rebates, and transfer them to your balance.'
				})}
			</p>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			<Button
				variant="outline"
				size="icon"
				aria-label={$_('user.affiliates.refresh', { default: 'Refresh' })}
				data-testid="affiliates-refresh-btn"
				onclick={refreshAll}
				class="h-9 w-9 text-muted-foreground"
			>
				<RotateCw class="h-4 w-4" />
			</Button>
			<Button
				data-testid="affiliates-withdraw-btn"
				disabled={!canTransfer}
				onclick={openTransfer}
				class="h-9 gap-1.5"
			>
				<Banknote class="h-4 w-4" />
				{$_('affiliate.transfer.button', { default: 'Transfer to Balance' })}
			</Button>
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
			<div
				class="flex items-center gap-2 text-sm text-destructive"
				data-testid="affiliates-referral-error"
			>
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
							<Button
								variant="outline"
								size="sm"
								data-testid="affiliates-copy-code-btn"
								onclick={copyCode}
								aria-label={$_('user.affiliates.copyCode', { default: 'Copy code' })}
								class="h-9 gap-1 px-3"
							>
								<Copy class="h-3.5 w-3.5" />
								{$_('user.affiliates.copyCode', { default: 'Copy' })}
							</Button>
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
							<Button
								variant="outline"
								size="sm"
								data-testid="affiliates-copy-link-btn"
								onclick={copyLink}
								aria-label={$_('user.affiliates.copyLink', { default: 'Copy link' })}
								class="h-9 gap-1 px-3"
							>
								<Copy class="h-3.5 w-3.5" />
								{$_('user.affiliates.copyLink', { default: 'Copy' })}
							</Button>
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
						<div
							class="flex items-center gap-1 text-xs text-muted-foreground"
							data-testid="affiliates-qr-error"
						>
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
	<section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="affiliates-stats">
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
				<Percent class="h-4 w-4" />
				<span class="text-xs font-medium uppercase tracking-wide">
					{$_('affiliate.stats.rebateRate', { default: 'My Rebate Rate' })}
				</span>
			</div>
			<p
				class="mt-2 text-2xl font-semibold tabular-nums text-foreground"
				data-testid="affiliates-stat-rate"
			>
				{(referral?.rebateRatePercent ?? 0).toFixed(1)}%
			</p>
		</div>
	</section>

	<!-- Invited users -->
	<section class="rounded-lg border border-border bg-card" data-testid="affiliates-invited-card">
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

		{#if loadingReferral}
			<div class="space-y-2 p-4" data-testid="affiliates-invited-loading">
				{#each Array.from({ length: 3 }) as _placeholder, i (i)}
					<div class="h-10 w-full animate-pulse rounded bg-muted"></div>
				{/each}
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
						<tr
							class="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"
						>
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
								<td
									class="px-4 py-2 text-right tabular-nums text-xs font-medium text-emerald-700 dark:text-emerald-400"
								>
									{fmtMoney(inv.rebateGenerated)}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			{#if invitedPages > 1}
				<div
					class="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground"
					data-testid="affiliates-invited-pagination"
				>
					<span>
						{$_('user.affiliates.pageOf', {
							default: 'Page {page} of {pages}',
							values: { page: invitedPage, pages: invitedPages }
						})}
					</span>
					<div class="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							data-testid="affiliates-invited-prev"
							disabled={invitedPage <= 1}
							onclick={invitedPrev}
							class="h-7 px-2"
						>
							{$_('user.affiliates.prevPage', { default: 'Previous' })}
						</Button>
						<Button
							variant="outline"
							size="sm"
							data-testid="affiliates-invited-next"
							disabled={invitedPage >= invitedPages}
							onclick={invitedNext}
							class="h-7 px-2"
						>
							{$_('user.affiliates.nextPage', { default: 'Next' })}
						</Button>
					</div>
				</div>
			{/if}
		{/if}
	</section>
</section>

<WithdrawalDialog
	bind:open={transferOpen}
	availableRebate={referral?.availableRebate ?? 0}
	onTransferred={handleTransferred}
/>
