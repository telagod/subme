<script lang="ts">
	/**
	 * /(user)/affiliates · subme-only affiliate dashboard
	 *
	 * GROUND TRUTH: user-side has only two endpoints -- GET /aff (referral + inline
	 * invitees) and POST /aff/transfer (quota -> balance). No withdraw / rebates /
	 * invitees / withdrawals phantom routes exist.
	 *
	 * Thin orchestrator: data fetching + page-level state live here.
	 * Visual sections are delegated to feature components:
	 *   - ReferralLinkCard  (code + link + QR)
	 *   - AffiliateStatsCards (3 stat cards)
	 *   - CommissionTable   (invited users + pagination)
	 *   - WithdrawalDialog  (transfer confirmation)
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { RotateCw, Banknote } from '@lucide/svelte';
	import { getReferralInfo, type ReferralInfo } from '$lib/api/user/affiliates';
	import { showError } from '$lib/stores/toast.svelte';
	import ReferralLinkCard from '$lib/features/affiliates/ReferralLinkCard.svelte';
	import AffiliateStatsCards from '$lib/features/affiliates/AffiliateStatsCards.svelte';
	import CommissionTable from '$lib/features/affiliates/CommissionTable.svelte';
	import WithdrawalDialog from '$lib/features/affiliates/WithdrawalDialog.svelte';
	import Button from '$lib/ui/Button.svelte';

	// ── state ───────────────────────────────────────────────────────────
	let referral = $state<ReferralInfo | null>(null);
	let loadingReferral = $state(true);
	let referralError = $state<string | null>(null);

	// Transfer dialog
	let transferOpen = $state(false);

	// ── derived ─────────────────────────────────────────────────────────
	const canTransfer = $derived(!!referral && referral.availableRebate > 0);

	// ── loaders ─────────────────────────────────────────────────────────

	async function loadReferral() {
		loadingReferral = true;
		referralError = null;
		try {
			referral = await getReferralInfo();
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

	// ── callbacks ────────────────────────────────────────────────────────

	function openTransfer() {
		transferOpen = true;
	}

	function handleTransferred() {
		void loadReferral();
	}
</script>

<svelte:head>
	<title>{$_('nav.affiliate', { default: 'Affiliate Program' })} · sub2api</title>
</svelte:head>

<section class="space-y-6" data-testid="affiliates-page">
	<!-- Header -->
	<header class="flex flex-wrap items-start justify-between gap-4">
		<div class="space-y-1">
			<h1 class="text-2xl font-semibold tracking-tight text-foreground">
				{$_('user.affiliates.pageTitle', { default: 'Affiliate Program' })}
			</h1>
			<p class="text-sm text-muted-foreground">
				{$_('user.affiliates.pageSubtitle', {
					default: 'Invite users, earn commissions, and transfer to balance.'
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
				{$_('affiliate.transfer.button', { default: 'Transfer to balance' })}
			</Button>
		</div>
	</header>

	<!-- Referral code / link / QR -->
	<ReferralLinkCard {referral} loading={loadingReferral} error={referralError} />

	<!-- Stat cards -->
	<AffiliateStatsCards {referral} />

	<!-- Invited users table -->
	<CommissionTable
		invitees={referral?.invitees ?? []}
		totalInvited={referral?.totalInvited ?? referral?.invitees?.length ?? 0}
		loading={loadingReferral}
	/>
</section>

<WithdrawalDialog
	bind:open={transferOpen}
	availableRebate={referral?.availableRebate ?? 0}
	onTransferred={handleTransferred}
/>
