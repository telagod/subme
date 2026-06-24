<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { FileText, Globe2, Loader2, LogIn, Settings, Shield } from '@lucide/svelte';
	import { authApi, type PublicSettings } from '$lib/api/auth';
	import { documentIconForTitle, findLegalDocument, legalSiteLogo } from '$lib/features/public-pages/legal';
	import { renderMarkdown } from '$lib/features/public-pages/markdown';

	let settings = $state<PublicSettings | null>(null);
	let loading = $state(true);
	let loadError = $state(false);
	let renderedHtml = $state('');

	const documentId = $derived(String(page.params.documentId ?? ''));
	const currentDocument = $derived(findLegalDocument(settings, documentId));
	const documentIcon = $derived(documentIconForTitle(currentDocument?.title));
	const siteName = $derived(settings?.site_name || 'subme');
	const siteLogo = $derived(legalSiteLogo(settings) || '/logo.svg');
	const updatedAt = $derived(settings?.login_agreement_updated_at || '');

	$effect(() => {
		const content = currentDocument?.content_md?.trim() ?? '';
		renderedHtml = content ? renderMarkdown(content, { breaks: true }).html : '';
	});

	onMount(async () => {
		loading = true;
		loadError = false;
		try {
			settings = await authApi.getPublicSettings();
		} catch {
			loadError = true;
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>{currentDocument?.title ?? 'Legal Document'} · {siteName}</title>
</svelte:head>

<main class="min-h-screen bg-background text-foreground" data-testid="legal-document-page">
	<header class="border-b border-border bg-card">
		<div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
			<a href="/home" class="flex min-w-0 items-center gap-3">
				<span class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-secondary">
					<img src={siteLogo} alt="Logo" class="h-full w-full object-contain" />
				</span>
				<span class="truncate text-base font-semibold text-foreground">{siteName}</span>
			</a>
			<a
				href="/login"
				class="inline-flex h-9 shrink-0 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
			>
				<LogIn class="h-4 w-4" />
				登录
			</a>
		</div>
	</header>

	<div class="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:py-10">
		{#if loading}
			<div class="flex min-h-[320px] items-center justify-center" data-testid="legal-loading">
				<Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
			</div>
		{:else if loadError}
			<section class="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-destructive" data-testid="legal-error">
				<h1 class="text-lg font-semibold">文档加载失败</h1>
				<p class="mt-2 text-sm">请稍后刷新页面重试。</p>
			</section>
		{:else if !currentDocument}
			<section class="rounded-lg border border-border bg-card p-6" data-testid="legal-not-found">
				<div class="flex items-start gap-3">
					<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground">
						<FileText class="h-5 w-5" />
					</span>
					<div>
						<h1 class="text-lg font-semibold text-foreground">文档不存在</h1>
						<p class="mt-2 text-sm leading-6 text-foreground/85">
							当前条款文档不存在或已被管理员移除。
						</p>
					</div>
				</div>
			</section>
		{:else}
			<article>
				<div class="mb-8 border-b border-border pb-6">
					<div class="flex items-start gap-4">
						<span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-muted-foreground">
							{#if documentIcon === 'shield'}
								<Shield class="h-6 w-6" />
							{:else if documentIcon === 'globe'}
								<Globe2 class="h-6 w-6" />
							{:else if documentIcon === 'cog'}
								<Settings class="h-6 w-6" />
							{:else}
								<FileText class="h-6 w-6" />
							{/if}
						</span>
						<div class="min-w-0">
							<p class="text-sm font-medium text-muted-foreground">登录条款</p>
							<h1 class="mt-2 break-words text-2xl font-bold tracking-normal text-foreground sm:text-3xl">
								{currentDocument.title}
							</h1>
							{#if updatedAt}
								<p class="mt-3 text-sm text-muted-foreground">更新日期：{updatedAt}</p>
							{/if}
						</div>
					</div>
				</div>

				{#if renderedHtml}
					<div class="legal-document-content" data-testid="legal-content">
						{@html renderedHtml}
					</div>
				{:else}
					<div class="rounded-lg border border-dashed border-border bg-card px-6 py-14 text-center text-sm text-muted-foreground">
						暂无正文内容
					</div>
				{/if}
			</article>
		{/if}
	</div>
</main>

<style>
	.legal-document-content {
		line-height: 1.75;
		overflow-wrap: anywhere;
		color: inherit;
	}

	.legal-document-content :global(h1) {
		margin-bottom: 1rem;
		margin-top: 2rem;
		border-bottom: 1px solid hsl(var(--border));
		padding-bottom: 0.75rem;
		font-size: 1.875rem;
		font-weight: 700;
	}

	.legal-document-content :global(h2) {
		margin-bottom: 0.75rem;
		margin-top: 1.75rem;
		font-size: 1.5rem;
		font-weight: 700;
	}

	.legal-document-content :global(h3) {
		margin-bottom: 0.5rem;
		margin-top: 1.5rem;
		font-size: 1.25rem;
		font-weight: 600;
	}

	.legal-document-content :global(p) {
		margin-bottom: 1rem;
		color: hsl(var(--foreground) / 0.85);
	}

	.legal-document-content :global(a) {
		color: hsl(var(--primary));
		text-decoration: underline;
		text-underline-offset: 4px;
	}

	.legal-document-content :global(ul) {
		margin-bottom: 1rem;
		list-style: disc;
		padding-left: 1.5rem;
	}

	.legal-document-content :global(ol) {
		margin-bottom: 1rem;
		list-style: decimal;
		padding-left: 1.5rem;
	}

	.legal-document-content :global(blockquote) {
		margin: 1.25rem 0;
		border-left: 4px solid hsl(var(--border));
		padding-left: 1rem;
		color: hsl(var(--muted-foreground));
	}

	.legal-document-content :global(code) {
		border-radius: 0.375rem;
		background: hsl(var(--muted));
		padding: 0.125rem 0.375rem;
		font-family: theme('fontFamily.mono');
		font-size: 0.875rem;
	}

	.legal-document-content :global(pre) {
		margin: 1.25rem 0;
		overflow-x: auto;
		border-radius: 0.375rem;
		background: hsl(var(--card));
		padding: 1rem;
	}

	.legal-document-content :global(pre code) {
		background: transparent;
		padding: 0;
	}

	.legal-document-content :global(table) {
		margin: 1.25rem 0;
		display: block;
		width: 100%;
		overflow-x: auto;
		border-collapse: collapse;
	}

	.legal-document-content :global(th),
	.legal-document-content :global(td) {
		border: 1px solid hsl(var(--border));
		padding: 0.5rem 0.75rem;
	}

	.legal-document-content :global(th) {
		background: hsl(var(--muted));
		text-align: left;
		font-weight: 600;
	}

	.legal-document-content :global(img) {
		margin: 1.25rem 0;
		height: auto;
		max-width: 100%;
		border-radius: 0.375rem;
	}
</style>
