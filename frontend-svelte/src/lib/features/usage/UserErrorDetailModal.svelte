<script lang="ts">
	/**
	 * UserErrorDetailModal - shows full error details for a single error request.
	 *
	 * Fetched on-demand when the modal opens; mirrors Vue UserErrorDetailModal.
	 */
	import { _ } from 'svelte-i18n';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import { getErrorDetail, type UserErrorRequestDetail } from '$lib/api/user/usage';

	type Props = {
		open: boolean;
		errorId: number | null;
		onOpenChange?: (open: boolean) => void;
	};

	let { open = $bindable(false), errorId, onOpenChange }: Props = $props();

	let loading = $state(false);
	let loadError = $state(false);
	let detail = $state<UserErrorRequestDetail | null>(null);

	$effect(() => {
		if (open && errorId != null) {
			fetchDetail(errorId);
		} else if (!open) {
			detail = null;
			loadError = false;
		}
	});

	async function fetchDetail(id: number) {
		loading = true;
		loadError = false;
		detail = null;
		try {
			detail = await getErrorDetail(id);
		} catch {
			loadError = true;
		} finally {
			loading = false;
		}
	}

	function fmtDate(iso: string): string {
		if (!iso) return '-';
		try {
			return new Date(iso).toLocaleString();
		} catch {
			return iso;
		}
	}

	function statusVariant(code: number): 'destructive' | 'secondary' | 'outline' {
		if (code >= 500) return 'destructive';
		if (code === 429) return 'secondary';
		return 'outline';
	}

	function categoryLabel(cat: string): string {
		return $_(
			`user.usage.errors.categories.${cat}`,
			{ default: cat || '-' }
		);
	}
</script>

<StandardDialog
	bind:open
	title={$_('user.usage.errors.detail.title', { default: 'Error Detail' })}
	width="lg"
	{onOpenChange}
	data-testid="error-detail-modal"
>
	<div class="mt-4">
		{#if loading}
			<div class="flex justify-center py-10">
				<svg class="h-7 w-7 animate-spin text-primary/40" fill="none" viewBox="0 0 24 24">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
					<path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					/>
				</svg>
			</div>
		{:else if loadError}
			<p class="py-8 text-center text-sm text-destructive">
				{$_('user.usage.errors.detail.loadFailed', { default: 'Failed to load error details.' })}
			</p>
		{:else if detail}
			<div class="space-y-4 text-sm">
				<div class="grid grid-cols-2 gap-x-6 gap-y-3">
					<!-- Time -->
					<div>
						<span class="font-medium text-muted-foreground">
							{$_('user.usage.errors.time', { default: 'Time' })}
						</span>
						<p class="mt-0.5 text-foreground">{fmtDate(detail.createdAt ?? '')}</p>
					</div>
					<!-- Model -->
					<div>
						<span class="font-medium text-muted-foreground">
							{$_('user.usage.errors.model', { default: 'Model' })}
						</span>
						<p class="mt-0.5 text-foreground">{detail.model || '-'}</p>
					</div>
					<!-- Endpoint -->
					<div>
						<span class="font-medium text-muted-foreground">
							{$_('user.usage.errors.endpoint', { default: 'Endpoint' })}
						</span>
						<p class="mt-0.5 text-foreground">{detail.inboundEndpoint || '-'}</p>
					</div>
					<!-- Status Code -->
					<div>
						<span class="font-medium text-muted-foreground">
							{$_('user.usage.errors.status', { default: 'Status' })}
						</span>
						<p class="mt-0.5">
							<Badge variant={statusVariant(detail.statusCode ?? 0)}>
								{detail.statusCode || '-'}
							</Badge>
						</p>
					</div>
					<!-- Category -->
					<div>
						<span class="font-medium text-muted-foreground">
							{$_('user.usage.errors.category', { default: 'Category' })}
						</span>
						<p class="mt-0.5 text-foreground">{categoryLabel(detail.category ?? '')}</p>
					</div>
					<!-- Platform -->
					<div>
						<span class="font-medium text-muted-foreground">
							{$_('user.usage.errors.platform', { default: 'Platform' })}
						</span>
						<p class="mt-0.5 text-foreground">{detail.platform || '-'}</p>
					</div>
					<!-- Upstream status code -->
					{#if detail.upstreamStatusCode != null}
						<div>
							<span class="font-medium text-muted-foreground">
								{$_('user.usage.errors.detail.upstreamStatus', { default: 'Upstream Status' })}
							</span>
							<p class="mt-0.5 text-foreground">{detail.upstreamStatusCode}</p>
						</div>
					{/if}
				</div>

				<!-- Message -->
				{#if detail.message}
					<div>
						<span class="font-medium text-muted-foreground">
							{$_('user.usage.errors.message', { default: 'Message' })}
						</span>
						<p class="mt-0.5 break-all text-foreground">{detail.message}</p>
					</div>
				{/if}

				<!-- Error Body -->
				{#if detail.errorBody}
					<div>
						<span class="font-medium text-muted-foreground">
							{$_('user.usage.errors.detail.responseBody', { default: 'Response Body' })}
						</span>
						<pre
							class="mt-1 max-h-[40vh] overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-card p-3 text-xs text-foreground/85"
						>{detail.errorBody}</pre>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</StandardDialog>
