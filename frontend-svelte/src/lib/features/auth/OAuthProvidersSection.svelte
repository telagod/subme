<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { GitBranch } from '@lucide/svelte';
	import { authApi, type PublicSettings } from '$lib/api/auth';
	import { storeOAuthAffiliateCode } from './email-oauth';
	import Button from '$lib/ui/Button.svelte';

	type Props = { disabled?: boolean; affCode?: string };
	let { disabled = false, affCode = '' }: Props = $props();

	interface OAuthProvider {
		id: string;
		label: string;
		icon: 'github' | 'google' | 'linuxdo' | 'dingtalk' | 'wechat' | 'oidc';
		startUrl: string;
	}

	let loading = $state(true);
	let providers = $state<OAuthProvider[]>([]);
	let backendMode = $state(false);
	const hasProviders = $derived(providers.length > 0);

	onMount(async () => {
		try {
			const s = await authApi.getPublicSettings();
			backendMode = s.backend_mode_enabled === true;
			providers = buildProviders(s);
		} catch { providers = []; }
		loading = false;
	});

	function buildProviders(s: PublicSettings): OAuthProvider[] {
		const p: OAuthProvider[] = [];
		if (s.github_oauth_enabled) p.push({
			id: 'github', label: 'GitHub', icon: 'github',
			startUrl: '/api/v1/auth/oauth/github/start'
		});
		if (s.google_oauth_enabled) p.push({
			id: 'google', label: 'Google', icon: 'google',
			startUrl: '/api/v1/auth/oauth/google/start'
		});
		if (s.linuxdo_oauth_enabled) p.push({
			id: 'linuxdo', label: 'LinuxDo', icon: 'linuxdo',
			startUrl: '/api/v1/auth/oauth/linuxdo/start'
		});
		if (s.dingtalk_oauth_enabled) p.push({
			id: 'dingtalk', label: $_('auth.dingtalk.name', { default: 'DingTalk' }), icon: 'dingtalk',
			startUrl: '/api/v1/auth/oauth/dingtalk/start'
		});
		if (s.wechat_oauth_enabled) p.push({
			id: 'wechat', label: $_('auth.wechat.name', { default: 'WeChat' }), icon: 'wechat',
			startUrl: '/api/v1/auth/oauth/wechat/start'
		});
		if (s.oidc_oauth_enabled) {
			const name = s.oidc_oauth_provider_name || 'OIDC';
			p.push({
				id: 'oidc', label: name, icon: 'oidc',
				startUrl: '/api/v1/auth/oauth/oidc/start'
			});
		}
		return p;
	}

	function startOAuth(provider: OAuthProvider) {
		storeOAuthAffiliateCode(affCode);
		window.location.href = provider.startUrl;
	}
</script>

{#if !loading && hasProviders && !backendMode}
	<div class="space-y-3" data-testid="oauth-providers-section">
		<div class="flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted-foreground">
			<div class="h-px flex-1 bg-border"></div>
			<span>{$_('auth.oauthOrContinue', { default: 'or continue with' })}</span>
			<div class="h-px flex-1 bg-border"></div>
		</div>

		<div class="grid grid-cols-1 gap-2 {providers.length >= 3 ? 'sm:grid-cols-3' : providers.length === 2 ? 'sm:grid-cols-2' : ''}">
			{#each providers as p (p.id)}
				<Button
					type="button"
					variant="outline"
					class="h-11 w-full justify-center gap-2"
					disabled={disabled}
					onclick={() => startOAuth(p)}
					data-testid={`oauth-${p.id}`}
				>
					{#if p.icon === 'github'}
						<GitBranch class="h-4 w-4" />
					{:else if p.icon === 'google'}
						<span class="flex h-4 w-4 items-center justify-center rounded-full border border-border text-[10px] font-semibold">G</span>
					{:else if p.icon === 'linuxdo'}
						<span class="flex h-4 w-4 items-center justify-center rounded-full border border-border text-[10px] font-semibold text-orange-500">L</span>
					{:else if p.icon === 'dingtalk'}
						<span class="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">钉</span>
					{:else if p.icon === 'wechat'}
						<span class="flex h-4 w-4 items-center justify-center rounded-full border border-border text-[10px] font-semibold text-green-600">W</span>
					{:else}
						<span class="flex h-4 w-4 items-center justify-center rounded-full border border-border text-[10px] font-semibold">{p.label[0]}</span>
					{/if}
					<span>{p.label}</span>
				</Button>
			{/each}
		</div>
	</div>
{/if}
