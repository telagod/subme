<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { get } from 'svelte/store';
	import { _, locale } from 'svelte-i18n';
	import { ChevronLeft, ExternalLink, Link2, List, Loader2 } from '@lucide/svelte';
	import { authApi, type CustomMenuItem, type PublicSettings } from '$lib/api/auth';
	import { settingsApi } from '$lib/api/admin/settingsRegistry';
	import { auth } from '$lib/stores/auth.svelte';
	import { showError } from '$lib/stores/toast.svelte';
	import { buildEmbeddedUrl, detectTheme, isHttpUrl } from '$lib/features/public-pages/url';
	import {
		renderMarkdown,
		rewriteMarkdownImageSources,
		type TocItem
	} from '$lib/features/public-pages/markdown';
	import Button from '$lib/ui/Button.svelte';

	let settings = $state<PublicSettings | null>(null);
	let adminMenuItems = $state<CustomMenuItem[]>([]);
	let loading = $state(true);
	let markdownLoading = $state(false);
	let renderedHtml = $state('');
	let tocItems = $state<TocItem[]>([]);
	let tocVisible = $state(true);
	let activeHeadingId = $state('');
	let pageTheme = $state<'light' | 'dark'>('light');
	let markdownContainer: HTMLDivElement | null = $state(null);
	let themeObserver: MutationObserver | null = null;
	let scrollRafId = 0;
	let loadedMarkdownSlug = '';

	const menuItemId = $derived(String(page.params.id ?? ''));
	const menuItem = $derived.by(() => {
		const publicItems = settings?.custom_menu_items ?? [];
		const found = publicItems.find((item) => item.id === menuItemId) ?? null;
		if (found) return found;
		return auth.isAdmin ? (adminMenuItems.find((item) => item.id === menuItemId) ?? null) : null;
	});
	const markdownSlug = $derived.by(() => {
		if (!menuItem) return '';
		if (menuItem.page_slug) return menuItem.page_slug;
		return menuItem.url?.startsWith('md:') ? menuItem.url.slice(3) : '';
	});
	const isMarkdownMode = $derived(Boolean(markdownSlug));
	const embeddedUrl = $derived.by(() => {
		if (!menuItem || isMarkdownMode) return '';
		return buildEmbeddedUrl(
			menuItem.url,
			auth.user?.id,
			auth.token,
			pageTheme,
			get(locale) ?? undefined
		);
	});
	const isValidUrl = $derived(!isMarkdownMode && isHttpUrl(embeddedUrl));

	$effect(() => {
		if (!markdownSlug) {
			renderedHtml = '';
			tocItems = [];
			loadedMarkdownSlug = '';
			return;
		}
		if (loadedMarkdownSlug === markdownSlug) return;
		loadedMarkdownSlug = markdownSlug;
		void fetchAndRenderMarkdown(markdownSlug);
	});

	onMount(() => {
		pageTheme = detectTheme();
		tocVisible = window.innerWidth > 768;
		if (typeof document !== 'undefined') {
			themeObserver = new MutationObserver(() => {
				pageTheme = detectTheme();
			});
			themeObserver.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ['class']
			});
		}

		void (async () => {
			loading = true;
			try {
				settings = await authApi.getPublicSettings();
				if (auth.isAdmin) {
					const snapshot = await settingsApi.getSettings().catch(() => ({} as Record<string, unknown>));
					const raw = snapshot.custom_menu_items;
					adminMenuItems = Array.isArray(raw) ? (raw as CustomMenuItem[]) : [];
				}
			} catch (err) {
				showError(err instanceof Error ? err.message : 'Failed to load custom page');
			} finally {
				loading = false;
			}
		})();

		return () => {
			themeObserver?.disconnect();
			themeObserver = null;
			if (scrollRafId) cancelAnimationFrame(scrollRafId);
		};
	});

	async function fetchAndRenderMarkdown(slug: string) {
		markdownLoading = true;
		renderedHtml = '';
		tocItems = [];
		activeHeadingId = '';
		try {
			const resp = await fetch(`/api/v1/pages/${encodeURIComponent(slug)}`, {
				headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {}
			});
			if (!resp.ok) {
				renderedHtml = '<p class="text-destructive">Page not found</p>';
				return;
			}
			const raw = rewriteMarkdownImageSources(slug, await resp.text());
			const rendered = renderMarkdown(raw, { allowIframes: true, withHeadingIds: true });
			renderedHtml = rendered.html;
			tocItems = rendered.toc;
		} catch {
			renderedHtml = '<p class="text-destructive">Failed to load page</p>';
		} finally {
			markdownLoading = false;
		}
	}

	function scrollToHeading(id: string) {
		const container = markdownContainer;
		if (!container) return;
		const el = container.querySelector(`#${CSS.escape(id)}`);
		if (!el) return;
		el.scrollIntoView({ behavior: 'smooth', block: 'start' });
		activeHeadingId = id;
		if (window.innerWidth <= 640) tocVisible = false;
	}

	function onContentScroll() {
		if (scrollRafId) return;
		scrollRafId = requestAnimationFrame(() => {
			scrollRafId = 0;
			const container = markdownContainer;
			if (!container || tocItems.length === 0) return;

			const containerRect = container.getBoundingClientRect();
			let current = '';
			for (const item of tocItems) {
				const el = container.querySelector(`#${CSS.escape(item.id)}`) as HTMLElement | null;
				if (!el) continue;
				const elRect = el.getBoundingClientRect();
				if (elRect.top - containerRect.top <= 100) current = item.id;
			}
			activeHeadingId = current;
		});
	}
</script>

<svelte:head>
	<title>{menuItem?.label ?? $_('customPage.title', { default: 'Custom Page' })} · sub2api</title>
</svelte:head>

<section class="flex min-h-[calc(100vh-9rem)] flex-col" data-testid="custom-page">
	<div class="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
		{#if loading}
			<div class="flex h-full min-h-[420px] items-center justify-center py-12" data-testid="custom-loading">
				<Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
			</div>
		{:else if !menuItem}
			<div class="flex h-full min-h-[420px] items-center justify-center p-10 text-center" data-testid="custom-not-found">
				<div class="max-w-md">
					<div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-border bg-secondary">
						<Link2 class="h-5 w-5 text-muted-foreground" />
					</div>
					<h1 class="text-lg font-semibold text-foreground">
						{$_('customPage.notFoundTitle', { default: 'Page not found' })}
					</h1>
					<p class="mt-2 text-sm text-muted-foreground">
						{$_('customPage.notFoundDesc', {
							default: 'This custom page does not exist or has been removed.'
						})}
					</p>
				</div>
			</div>
		{:else if isMarkdownMode}
			<div class="relative flex min-h-[calc(100vh-9rem)] overflow-hidden" data-testid="custom-markdown">
				{#if tocVisible && tocItems.length > 0}
					<aside class="hidden h-full w-[min(240px,30%)] min-w-40 max-w-72 shrink-0 flex-col border-r border-border bg-card md:flex">
						<div class="flex items-center justify-between border-b border-border px-4 py-3">
							<span class="text-sm font-semibold text-foreground/85">目录</span>
							<Button
								variant="ghost"
								size="icon"
								aria-label="Hide table of contents"
								class="h-7 w-7"
								onclick={() => (tocVisible = false)}
							>
								<ChevronLeft class="h-4 w-4" />
							</Button>
						</div>
						<nav class="flex-1 overflow-y-auto px-2 py-2">
							{#each tocItems as item}
								<a
									href={`#${item.id}`}
									class="block truncate rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground {activeHeadingId === item.id ? 'bg-accent text-foreground' : ''}"
									style={`padding-left: ${Math.max(0.5, item.level * 0.5)}rem`}
									onclick={(e) => {
										e.preventDefault();
										scrollToHeading(item.id);
									}}
								>
									{item.text}
								</a>
							{/each}
						</nav>
					</aside>
				{/if}

				{#if !tocVisible && tocItems.length > 0}
					<Button
						variant="outline"
						size="sm"
						class="absolute left-2 top-2 z-10 h-8 gap-1 bg-card px-2 text-xs text-muted-foreground"
						onclick={() => (tocVisible = true)}
					>
						<List class="h-4 w-4" />
						目录
					</Button>
				{/if}

				<div
					bind:this={markdownContainer}
					class="custom-markdown-content h-[calc(100vh-9rem)] flex-1 overflow-auto p-6 md:p-10"
					onscroll={onContentScroll}
				>
					{#if markdownLoading}
						<div class="flex min-h-[260px] items-center justify-center">
							<Loader2 class="h-7 w-7 animate-spin text-muted-foreground" />
						</div>
					{:else}
						{@html renderedHtml}
					{/if}
				</div>
			</div>
		{:else if !isValidUrl}
			<div class="flex h-full min-h-[420px] items-center justify-center p-10 text-center" data-testid="custom-not-configured">
				<div class="max-w-md">
					<div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-border bg-secondary">
						<Link2 class="h-5 w-5 text-muted-foreground" />
					</div>
					<h1 class="text-lg font-semibold text-foreground">
						{$_('customPage.notConfiguredTitle', { default: 'Page URL not configured' })}
					</h1>
					<p class="mt-2 text-sm text-muted-foreground">
						{$_('customPage.notConfiguredDesc', {
							default: 'The URL for this custom page has not been properly configured.'
						})}
					</p>
				</div>
			</div>
		{:else}
			<div class="relative h-[calc(100vh-9rem)]" data-testid="custom-embed">
				<a
					href={embeddedUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="absolute right-4 top-4 z-10 inline-flex h-9 items-center gap-2 rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground shadow-sm hover:bg-accent"
				>
					<ExternalLink class="h-4 w-4" />
					{$_('customPage.openInNewTab', { default: 'Open in new tab' })}
				</a>
				<iframe src={embeddedUrl} title={menuItem.label} class="h-full w-full border-0" allowfullscreen></iframe>
			</div>
		{/if}
	</div>
</section>

<style>
	.custom-markdown-content {
		overflow-wrap: anywhere;
		line-height: 1.75;
	}
	.custom-markdown-content :global(h1),
	.custom-markdown-content :global(h2),
	.custom-markdown-content :global(h3),
	.custom-markdown-content :global(h4) {
		scroll-margin-top: 1rem;
		font-weight: 700;
		color: hsl(var(--foreground));
	}
	.custom-markdown-content :global(h1) {
		margin: 0 0 1rem;
		font-size: 1.875rem;
	}
	.custom-markdown-content :global(h2) {
		margin: 1.75rem 0 0.75rem;
		font-size: 1.5rem;
	}
	.custom-markdown-content :global(h3) {
		margin: 1.5rem 0 0.5rem;
		font-size: 1.25rem;
	}
	.custom-markdown-content :global(p) {
		margin-bottom: 1rem;
		color: hsl(var(--foreground) / 0.86);
	}
	.custom-markdown-content :global(a) {
		color: hsl(var(--primary));
		text-decoration: underline;
		text-underline-offset: 4px;
	}
	.custom-markdown-content :global(pre) {
		margin: 1rem 0;
		overflow-x: auto;
		border-radius: 0.5rem;
		background: hsl(var(--muted));
		padding: 1rem;
	}
	.custom-markdown-content :global(code) {
		border-radius: 0.375rem;
		background: hsl(var(--muted));
		padding: 0.125rem 0.375rem;
		font-family: theme('fontFamily.mono');
		font-size: 0.875rem;
	}
	.custom-markdown-content :global(pre code) {
		background: transparent;
		padding: 0;
	}
	.custom-markdown-content :global(img) {
		margin: 1rem 0;
		max-width: 100%;
		border-radius: 0.5rem;
	}
	.custom-markdown-content :global(iframe) {
		max-width: 100%;
		border-radius: 0.5rem;
		border: 1px solid hsl(var(--border));
	}
</style>
