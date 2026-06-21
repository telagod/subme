<script lang="ts">
	/**
	 * ReferralLinkCard — referral code, invite link, QR code display
	 *
	 * Owns QR rendering (dynamic import 'qrcode' → vendor-qrcode lazy chunk)
	 * and clipboard copy logic. Receives referral data + loading state from page.
	 *
	 * RED LINE: qrcode is NEVER top-level imported — always via dynamic import.
	 */
	import { _ } from 'svelte-i18n';
	import { Copy, QrCode, AlertTriangle } from '@lucide/svelte';
	import type { ReferralInfo } from '$lib/api/user/affiliates';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Button from '$lib/ui/Button.svelte';

	type Props = {
		referral: ReferralInfo | null;
		loading: boolean;
		error: string | null;
	};

	let { referral, loading, error }: Props = $props();

	// ── QR state ────────────────────────────────────────────────────────
	let qrDataUrl = $state<string | null>(null);
	let qrError = $state<string | null>(null);

	// Re-render QR when referral link changes
	$effect(() => {
		if (referral?.link) {
			void renderQr(referral.link);
		} else {
			qrDataUrl = null;
			qrError = null;
		}
	});

	async function renderQr(link: string) {
		qrError = null;
		try {
			const mod: unknown = await import('qrcode');
			const QR = (mod as { default?: unknown }).default ?? mod;
			const fn = (QR as { toDataURL?: (text: string) => Promise<string> }).toDataURL;
			if (typeof fn !== 'function') throw new Error('qrcode toDataURL missing');
			qrDataUrl = await fn(link);
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
			// fall through to fallback
		}
		// Fallback: execCommand('copy') for old browsers / no clipboard permission
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
</script>

<section
	class="rounded-lg border border-border bg-card p-5 shadow-sm"
	data-testid="affiliates-referral-card"
>
	{#if loading}
		<div class="space-y-3" data-testid="affiliates-referral-skeleton">
			<div class="h-5 w-32 animate-pulse rounded bg-muted"></div>
			<div class="h-10 w-full animate-pulse rounded bg-muted"></div>
			<div class="h-10 w-full animate-pulse rounded bg-muted"></div>
		</div>
	{:else if error && !referral}
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
