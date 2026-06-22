<script lang="ts">
	/**
	 * LoginAgreementPrompt · Svelte 5
	 *
	 * Two modes (driven by backend setting):
	 *   - 'checkbox': inline checkbox with document links
	 *   - 'modal' (default): banner prompting user to review terms, opens a modal dialog
	 *
	 * Ported from Vue LoginAgreementPrompt.vue with identical behavior:
	 *   - Blocks form submission until accepted
	 *   - Persists consent in localStorage keyed by revision hash
	 *   - Documents link to /legal/<documentId>
	 */

	import { _ } from 'svelte-i18n';
	import type { LoginAgreementDocument } from '$lib/api/auth';
	import Button from '$lib/ui/Button.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';

	type Props = {
		accepted: boolean;
		documents: LoginAgreementDocument[];
		mode: 'modal' | 'checkbox' | string;
		updatedAt?: string;
		visible: boolean;
		onAccept?: () => void;
		onReject?: () => void;
		onOpen?: () => void;
	};

	let {
		accepted,
		documents,
		mode,
		updatedAt = '',
		visible,
		onAccept,
		onReject,
		onOpen
	}: Props = $props();

	const filteredDocs = $derived(documents.filter((d) => d.title?.trim()));
	const isCheckbox = $derived(mode === 'checkbox');
	const dialogVisible = $derived(visible && filteredDocs.length > 0);

	function documentHref(doc: LoginAgreementDocument): string {
		return `/legal/${encodeURIComponent(doc.id || doc.title)}`;
	}

	function documentIcon(index: number, title: string): string {
		if (title.includes('Policy') || title.includes('Privacy') || title.includes('政策') || title.includes('隐私')) return 'shield';
		if (title.includes('Country') || title.includes('Region') || title.includes('国家') || title.includes('地区')) return 'globe';
		if (index === 3) return 'cog';
		return 'doc';
	}

	function handleCheckbox(e: Event) {
		const checked = (e.target as HTMLInputElement).checked;
		if (checked) {
			onAccept?.();
		} else {
			onReject?.();
		}
	}
</script>

<!-- Checkbox mode: inline -->
{#if isCheckbox && filteredDocs.length > 0}
	<div class="px-0.5">
		<div class="flex items-start gap-2">
			<Checkbox
				id="login-agreement-consent"
				checked={accepted}
				class="mt-[2px] shrink-0"
				onchange={handleCheckbox}
				data-testid="agreement-checkbox"
			/>
			<div class="min-w-0 flex-1">
				<p class="text-[13px] leading-5 text-foreground/85">
					<label for="login-agreement-consent" class="cursor-pointer text-foreground/85">
						{$_('auth.agreement.iAgree', { default: '我已阅读并同意' })}
					</label>
					{#each filteredDocs as doc, i (doc.id || doc.title)}
						<a
							href={documentHref(doc)}
							target="_blank"
							rel="noopener noreferrer"
							class="font-medium text-primary underline-offset-4 transition hover:text-primary/80 hover:underline"
						>
							{doc.title}
						</a>{#if i < filteredDocs.length - 1}<span>,&nbsp;</span>{/if}
					{/each}
				</p>
			</div>
		</div>
	</div>
{:else if !accepted && filteredDocs.length > 0}
	<!-- Modal mode: banner -->
	<div class="rounded-md border border-border bg-card p-3 text-sm text-foreground" data-testid="agreement-banner">
		<div class="flex items-start gap-3">
			<svg class="mt-0.5 h-4 w-4 shrink-0 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
			</svg>
			<div class="min-w-0 flex-1">
				<p class="font-medium">
					{$_('auth.agreement.reviewRequired', { default: '请同意最新条款后继续。' })}
				</p>
				<p class="mt-1 text-muted-foreground">
					{$_('auth.agreement.disabledUntilAccepted', { default: '接受条款前无法登录。' })}
				</p>
			</div>
			<Button
				type="button"
				variant="default"
				size="sm"
				class="shrink-0"
				onclick={() => onOpen?.()}
				data-testid="agreement-open-btn"
			>
				{$_('auth.agreement.viewTerms', { default: '查看条款' })}
			</Button>
		</div>
	</div>
{/if}

<!-- Modal dialog (teleported) -->
{#if dialogVisible}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="fixed inset-0 z-[140] flex items-center justify-center overflow-y-auto bg-black/70 p-4"
		data-testid="agreement-modal"
	>
		<div class="w-full max-w-[600px] overflow-hidden rounded-lg border border-border bg-card">
			<!-- Header -->
			<div class="border-b border-border bg-card px-6 py-6">
				<div class="flex items-start gap-4">
					<span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-primary">
						<svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
						</svg>
					</span>
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<h2 class="text-xl font-bold tracking-normal text-foreground">
								{$_('auth.agreement.modalTitle', { default: '条款更新通知' })}
							</h2>
							{#if updatedAt}
								<Badge variant="secondary" class="rounded-full">{updatedAt}</Badge>
							{/if}
						</div>
						<p class="mt-2 text-sm leading-6 text-muted-foreground">
							{$_('auth.agreement.modalDescription', {
								default: '我们的服务条款已更新，请审阅并同意后继续。',
								values: { date: updatedAt || '' }
							})}
						</p>
					</div>
				</div>
			</div>

			<!-- Document list -->
			<div class="max-h-[58vh] overflow-y-auto px-6 py-5">
				<div class="mb-3 flex items-center justify-between gap-3">
					<p class="text-sm font-semibold text-foreground">
						{$_('auth.agreement.relatedDocuments', { default: '相关文档' })}
					</p>
				</div>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
					{#each filteredDocs as doc, i (doc.id || doc.title)}
						<a
							href={documentHref(doc)}
							target="_blank"
							rel="noopener noreferrer"
							class="group flex min-h-[72px] w-full items-center gap-3 rounded-md border border-border bg-muted px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-border hover:bg-accent"
						>
							<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-primary transition">
								{#if documentIcon(i, doc.title) === 'shield'}
									<svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
								{:else if documentIcon(i, doc.title) === 'globe'}
									<svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
								{:else}
									<svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
								{/if}
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm font-semibold text-foreground">{doc.title}</span>
							</span>
							<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition group-hover:text-foreground">
								<svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
							</span>
						</a>
					{/each}
				</div>
			</div>

			<!-- Footer -->
			<div class="border-t border-border bg-muted px-6 py-4">
				<div class="grid grid-cols-2 gap-3">
					<Button
						type="button"
						variant="outline"
						class="w-full py-3 font-semibold"
						onclick={() => onReject?.()}
						data-testid="agreement-reject"
					>
						{$_('auth.agreement.reject', { default: '拒绝' })}
					</Button>
					<Button
						type="button"
						variant="default"
						class="w-full py-3 font-semibold"
						onclick={() => onAccept?.()}
						data-testid="agreement-accept"
					>
						{$_('auth.agreement.accept', { default: '同意并继续' })}
					</Button>
				</div>
			</div>
		</div>
	</div>
{/if}
