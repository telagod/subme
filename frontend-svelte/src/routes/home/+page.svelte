<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import {
		Activity,
		ArrowLeftRight,
		ArrowRight,
		BookOpen,
		Boxes,
		Code2,
		Loader2,
		Network,
		Route,
		ShieldCheck,
		Wallet
	} from '@lucide/svelte';
	import { authApi, type PublicSettings } from '$lib/api/auth';
	import { auth } from '$lib/stores/auth.svelte';
	import { renderMarkdown } from '$lib/features/public-pages/markdown';
	import { sanitizeUrl } from '$lib/features/public-pages/url';
	import {
		HOME_GITHUB_URL,
		homeBrand,
		homeCapabilities,
		homeProviders,
		isHomeContentIframeUrl
	} from '$lib/features/public-pages/home';

	let settings = $state<PublicSettings | null>(null);
	let loadingSettings = $state(true);
	let customHtml = $state('');

	const brand = $derived(homeBrand(settings));
	const customContent = $derived(brand.homeContent);
	const customContentIframe = $derived(isHomeContentIframeUrl(customContent));
	const customIframeSrc = $derived(sanitizeUrl(customContent));
	const title = $derived(`${brand.siteName} · ${brand.siteSubtitle || $_('home.heroSubtitle', { default: 'One key, all AI models' })}`);
	const dashboardPath = $derived(auth.isAdmin ? '/admin/dashboard' : '/dashboard');
	const actionPath = $derived(auth.isAuthenticated ? dashboardPath : '/login');
	const actionLabel = $derived(auth.isAuthenticated
		? $_('home.goToDashboard', { default: 'Go to Dashboard' })
		: $_('home.getStarted', { default: 'Get Started' }));
	const userInitial = $derived(auth.user?.email ? auth.user.email.charAt(0).toUpperCase() : '');
	const currentYear = new Date().getFullYear();
	const capabilities = homeCapabilities();
	const providers = homeProviders();
	const iconForCapability = {
		gateway: Network,
		accounts: Boxes,
		billing: Wallet,
		usage: Activity,
		risk: ShieldCheck,
		sessions: Route
	};

	$effect(() => {
		customHtml = customContent && !customContentIframe
			? renderMarkdown(customContent, { breaks: true, allowIframes: true }).html
			: '';
	});

	onMount(async () => {
		loadingSettings = true;
		try {
			settings = await authApi.getPublicSettings();
		} catch {
			settings = null;
		} finally {
			loadingSettings = false;
		}
	});
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

{#if customContent}
	{#if customContentIframe && customIframeSrc}
		<main class="min-h-screen bg-background" data-testid="home-custom-iframe">
			<iframe
				src={customIframeSrc}
				title={brand.siteName}
				class="h-screen w-full border-0"
				allowfullscreen
			></iframe>
		</main>
	{:else}
		<main class="min-h-screen bg-background text-foreground" data-testid="home-custom-html">
			<div class="home-content mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
				{@html customHtml}
			</div>
		</main>
	{/if}
{:else}
	<main class="min-h-screen bg-background text-foreground" data-testid="home-page">
		<header class="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
			<nav class="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
				<a href="/home" class="flex min-w-0 items-center gap-3">
					<span class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-card">
						<img src={brand.siteLogo} alt="Logo" class="h-full w-full object-contain" />
					</span>
					<span class="truncate text-sm font-bold tracking-normal text-foreground sm:text-base">
						{brand.siteName}
					</span>
				</a>

				<div class="flex shrink-0 items-center gap-2">
					{#if brand.docUrl}
						<a
							href={brand.docUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
						>
							<BookOpen class="h-4 w-4" />
							<span class="hidden sm:inline">{$_('home.docs', { default: 'Docs' })}</span>
						</a>
					{/if}
					<a
						href={HOME_GITHUB_URL}
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground sm:w-auto sm:px-3"
						aria-label="GitHub"
					>
						<Code2 class="h-4 w-4" />
						<span class="hidden sm:ml-2 sm:inline">GitHub</span>
					</a>
					<a
						href={actionPath}
						class="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
					>
						{#if auth.isAuthenticated && userInitial}
							<span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-foreground/20 text-[10px] font-semibold">
								{userInitial}
							</span>
						{/if}
						<span class="hidden sm:inline">{auth.isAuthenticated ? $_('home.dashboard', { default: 'Dashboard' }) : $_('home.login', { default: 'Sign In' })}</span>
						<ArrowRight class="h-3.5 w-3.5" />
					</a>
				</div>
			</nav>
		</header>

		{#if loadingSettings}
			<div class="fixed bottom-4 right-4 z-40 rounded-md border border-border bg-card p-2 text-muted-foreground shadow-sm" data-testid="home-settings-loading">
				<Loader2 class="h-4 w-4 animate-spin" />
			</div>
		{/if}

		<section class="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:pb-20 lg:pt-20">
			<div class="text-center lg:text-left">
				<div class="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 font-mono text-[11px] font-semibold text-primary">
					<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-primary"></span>
					{$_('home.quench.eyebrow', { default: 'AI API Gateway' })}
				</div>
				<h1 class="mt-5 text-4xl font-extrabold leading-tight tracking-normal text-foreground sm:text-5xl lg:text-6xl">
					{brand.siteName}
				</h1>
				<p class="mt-4 text-lg font-semibold text-foreground sm:text-xl">
					{brand.siteSubtitle || $_('home.heroSubtitle', { default: 'One key, all AI models' })}
				</p>
				<p class="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted-foreground lg:mx-0">
					{$_('home.heroDescription', {
						default: 'No need to manage multiple subscriptions. One API key for Claude, GPT, Gemini and more'
					})}
				</p>
				<div class="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
					<a
						href={actionPath}
						class="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
					>
						{actionLabel}
						<ArrowRight class="h-4 w-4" />
					</a>
					{#if brand.docUrl}
						<a
							href={brand.docUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex h-11 items-center justify-center rounded-md border border-input bg-background px-5 text-sm font-medium text-foreground transition hover:bg-muted"
						>
							{$_('home.viewDocs', { default: 'View Docs' })}
						</a>
					{/if}
				</div>
				<div class="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground lg:justify-start">
					<span>{$_('home.quench.stats.providers', { default: '4+ upstream providers' })}</span>
					<span class="h-3 w-px bg-border"></span>
					<span>{$_('home.quench.stats.protocol', { default: 'OpenAI-compatible API' })}</span>
					<span class="h-3 w-px bg-border"></span>
					<span>{$_('home.quench.stats.billing', { default: 'Per-second metering' })}</span>
				</div>
			</div>

			<div class="rounded-lg border border-border bg-card shadow-lg" data-testid="home-gateway-trace">
				<div class="flex items-center gap-2.5 border-b border-border px-4 py-3">
					<div class="flex gap-1.5">
						<span class="h-2.5 w-2.5 rounded-full border border-border bg-muted"></span>
						<span class="h-2.5 w-2.5 rounded-full border border-border bg-muted"></span>
						<span class="h-2.5 w-2.5 rounded-full border border-border bg-muted"></span>
					</div>
					<span class="font-mono text-[11px] text-muted-foreground">gateway · trace</span>
					<span class="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold text-primary">
						<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-primary"></span>LIVE
					</span>
				</div>
				<div class="space-y-2 px-5 py-5 font-mono text-[13px]">
					<div class="flex items-center gap-2">
						<span class="font-semibold text-primary">POST</span>
						<span>/v1/messages</span>
						<span class="ml-auto rounded bg-emerald-500/10 px-2 py-px text-[11px] font-semibold text-emerald-500">200</span>
						<span class="text-[11px] text-muted-foreground">1.24s</span>
					</div>
					<div class="flex items-center gap-2 text-muted-foreground"><span>├─</span><span class="w-14">auth</span><span class="text-foreground">key sk-...f8a2</span><span class="ml-auto text-emerald-500">ok</span></div>
					<div class="flex items-center gap-2 text-muted-foreground"><span>├─</span><span class="w-14">route</span><span class="text-foreground">claude-pro -> pool-01</span><span class="ml-auto text-emerald-500">ok</span></div>
					<div class="flex items-center gap-2 text-muted-foreground"><span>├─</span><span class="w-14">stream</span><span class="text-foreground">first token <b class="font-semibold text-primary">380ms</b></span><span class="ml-auto text-emerald-500">ok</span></div>
					<div class="flex items-center gap-2 text-muted-foreground"><span>└─</span><span class="w-14">billing</span><span class="font-medium text-foreground">$0.0042 deducted</span><span class="ml-auto text-emerald-500">ok</span></div>
				</div>
			</div>
		</section>

		<section class="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
			<div class="flex flex-wrap items-center justify-center gap-3">
				<span class="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-xs font-medium text-foreground">
					<ArrowLeftRight class="h-4 w-4 text-muted-foreground" />
					{$_('home.tags.subscriptionToApi', { default: 'Subscription to API' })}
				</span>
				<span class="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-xs font-medium text-foreground">
					<ShieldCheck class="h-4 w-4 text-muted-foreground" />
					{$_('home.tags.stickySession', { default: 'Sticky sessions' })}
				</span>
				<span class="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-xs font-medium text-foreground">
					<Activity class="h-4 w-4 text-muted-foreground" />
					{$_('home.tags.realtimeBilling', { default: 'Pay-per-use billing' })}
				</span>
			</div>
		</section>

		<section class="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
			<div class="mb-8 text-center">
				<h2 class="text-2xl font-bold tracking-normal text-foreground">
					{$_('home.quench.capabilitiesTitle', { default: 'Built for production' })}
				</h2>
				<p class="mt-2 text-sm text-muted-foreground">
					{$_('home.quench.capabilitiesDesc', {
						default: 'A complete gateway pipeline - routing, scheduling, billing and risk control'
					})}
				</p>
			</div>
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each capabilities as cap}
					{@const Icon = iconForCapability[cap.key]}
					<article class="rounded-lg border border-border bg-card p-5 transition hover:border-primary/40">
						<div class="flex h-10 w-10 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
							<Icon class="h-5 w-5" />
						</div>
						<h3 class="mt-4 text-sm font-semibold text-foreground">
							{$_(cap.titleKey, { default: cap.key })}
						</h3>
						<p class="mt-2 text-sm leading-6 text-muted-foreground">
							{$_(cap.descKey, { default: '' })}
						</p>
					</article>
				{/each}
			</div>
		</section>

		<section class="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
			<div class="mb-8 text-center">
				<h2 class="text-2xl font-bold tracking-normal text-foreground">
					{$_('home.providers.title', { default: 'Supported AI Models' })}
				</h2>
				<p class="mt-2 text-sm text-muted-foreground">
					{$_('home.providers.description', { default: 'One API, many choices' })}
				</p>
			</div>
			<div class="flex flex-wrap items-center justify-center gap-3">
				{#each providers as provider}
					<div class:opacity-60={provider.soon} class="inline-flex items-center gap-2.5 rounded-md border border-border bg-card px-3.5 py-2.5">
						<span class="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted text-xs font-bold text-foreground">
							{provider.mark}
						</span>
						<span class="text-sm font-medium text-foreground">
							{provider.name ?? $_(provider.nameKey ?? '', { default: provider.mark })}
						</span>
						<span class="rounded-md border border-border px-2 py-0.5 text-[11px] font-medium {provider.soon ? 'text-muted-foreground' : 'text-emerald-500'}">
							{provider.soon
								? $_('home.providers.soon', { default: 'Soon' })
								: $_('home.providers.supported', { default: 'Supported' })}
						</span>
					</div>
				{/each}
			</div>
		</section>

		<section class="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
			<div class="flex flex-col items-start justify-between gap-5 rounded-lg border border-border bg-card px-6 py-6 shadow-sm sm:flex-row sm:items-center">
				<div>
					<h2 class="text-xl font-bold tracking-normal text-foreground">
						{$_('home.quench.ctaTitle', { default: 'Ready to get started?' })}
					</h2>
					<p class="mt-2 text-sm leading-6 text-muted-foreground">
						{$_('home.quench.ctaDesc', {
							default: 'Sign up for a unified key. OpenAI-compatible API. Migrate in minutes.'
						})}
					</p>
				</div>
				<a
					href={actionPath}
					class="inline-flex h-11 shrink-0 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
				>
					{actionLabel}
					<ArrowRight class="h-4 w-4" />
				</a>
			</div>
		</section>

		<footer class="border-t border-border px-4 py-8 sm:px-6">
			<div class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
				<p class="text-xs text-muted-foreground">
					&copy; {currentYear} {brand.siteName}. {$_('home.footer.allRightsReserved', { default: 'All rights reserved.' })}
				</p>
				<div class="flex items-center gap-5">
					{#if brand.docUrl}
						<a href={brand.docUrl} target="_blank" rel="noopener noreferrer" class="text-xs text-muted-foreground hover:text-foreground">
							{$_('home.docs', { default: 'Docs' })}
						</a>
					{/if}
					<a href={HOME_GITHUB_URL} target="_blank" rel="noopener noreferrer" class="text-xs text-muted-foreground hover:text-foreground">
						GitHub
					</a>
				</div>
			</div>
		</footer>
	</main>
{/if}
