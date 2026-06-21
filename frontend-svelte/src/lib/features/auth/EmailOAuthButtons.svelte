<script lang="ts">
	/**
	 * EmailOAuthButtons · GitHub / Google email OAuth entry row.
	 *
	 * 与 Vue EmailOAuthButtons.vue 同契约：provider 开关来自 public settings，
	 * 点击后写 pending provider + affiliate code，再跳后端 start endpoint。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { GitBranch } from '@lucide/svelte';
	import { authApi, type EmailOAuthProvider, type PublicSettings } from '$lib/api/auth';
	import {
		buildEmailOAuthStartUrl,
		storeOAuthAffiliateCode,
		storePendingEmailOAuthProvider
	} from './email-oauth';
	import Button from '$lib/ui/Button.svelte';

	type Props = {
		affCode?: string;
		disabled?: boolean;
		showDivider?: boolean;
		redirect?: string;
	};

	let {
		affCode = '',
		disabled = false,
		showDivider = true,
		redirect = '/dashboard'
	}: Props = $props();

	let loading = $state(true);
	let providers = $state<EmailOAuthProvider[]>([]);

	const hasProviders = $derived(providers.length > 0);
	const hasMultipleProviders = $derived(providers.length > 1);

	onMount(() => {
		void loadSettings();
	});

	async function loadSettings() {
		loading = true;
		try {
			const settings = await authApi.getPublicSettings();
			providers = visibleProviders(settings);
		} catch {
			providers = [];
		} finally {
			loading = false;
		}
	}

	function visibleProviders(settings: PublicSettings): EmailOAuthProvider[] {
		const result: EmailOAuthProvider[] = [];
		if (settings.github_oauth_enabled) result.push('github');
		if (settings.google_oauth_enabled) result.push('google');
		return result;
	}

	function providerLabel(provider: EmailOAuthProvider): string {
		const name = provider === 'github' ? 'GitHub' : 'Google';
		return hasMultipleProviders
			? name
			: $_('auth.emailOAuth.signIn', {
					default: 'Continue with {providerName}',
					values: { providerName: name }
				});
	}

	function startLogin(provider: EmailOAuthProvider) {
		storePendingEmailOAuthProvider(provider);
		storeOAuthAffiliateCode(affCode);
		const target = buildEmailOAuthStartUrl(provider, { redirect, affCode });
		window.location.href = target;
	}
</script>

{#if !loading && hasProviders}
	<div class="space-y-3" data-testid="email-oauth-buttons">
		{#if showDivider}
			<div class="flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted-foreground">
				<div class="h-px flex-1 bg-border"></div>
				<span>{$_('auth.oauthOrContinue', { default: 'or continue with others' })}</span>
				<div class="h-px flex-1 bg-border"></div>
			</div>
		{/if}

		<div class="grid grid-cols-1 gap-2 {hasMultipleProviders ? 'sm:grid-cols-2' : ''}">
			{#each providers as provider (provider)}
				<Button
					type="button"
					variant="outline"
					class="h-11 w-full justify-center gap-2"
					disabled={disabled}
					onclick={() => startLogin(provider)}
					data-testid={`email-oauth-${provider}`}
				>
					{#if provider === 'github'}
						<GitBranch class="h-4 w-4" />
					{:else}
						<span class="flex h-4 w-4 items-center justify-center rounded-full border border-border text-[10px] font-semibold text-foreground">G</span>
					{/if}
					<span>{providerLabel(provider)}</span>
				</Button>
			{/each}
		</div>
	</div>
{/if}
