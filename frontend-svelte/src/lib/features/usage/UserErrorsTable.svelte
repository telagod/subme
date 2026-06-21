<script lang="ts">
	/**
	 * UserErrorsTable - error requests table with filters and pagination.
	 *
	 * Mirrors Vue UserErrorRequestsTable: model / category filters,
	 * table with clickable rows opening a detail modal, pagination.
	 */
	import { _ } from 'svelte-i18n';
	import { Search } from '@lucide/svelte';
	import type { UserErrorRequest } from '$lib/api/user/usage';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import UserErrorDetailModal from './UserErrorDetailModal.svelte';

	const CATEGORY_ALL = '__all__' as const;

	type Props = {
		rows: UserErrorRequest[];
		total: number;
		loading: boolean;
		page: number;
		totalPages: number;
		pageSize: number;
		onFilter: (f: { model: string; category: string }) => void;
		onPrev: () => void;
		onNext: () => void;
	};

	let {
		rows,
		total,
		loading,
		page,
		totalPages,
		pageSize,
		onFilter,
		onPrev,
		onNext
	}: Props = $props();

	let localModel = $state('');
	let localCategory = $state<string>(CATEGORY_ALL);

	// Detail modal state
	let showDetail = $state(false);
	let selectedId = $state<number | null>(null);

	const CATEGORY_CODES = ['auth', 'rate_limit', 'quota', 'invalid_request', 'service_unavailable', 'upstream', 'internal'];

	const categoryOptions = $derived([
		{ value: CATEGORY_ALL, label: $_('user.usage.errors.allCategories', { default: 'All Categories' }) },
		...CATEGORY_CODES.map((c) => ({
			value: c,
			label: $_(`user.usage.errors.categories.${c}`, { default: c })
		}))
	]);

	function apply() {
		onFilter({
			model: localModel.trim(),
			category: localCategory === CATEGORY_ALL ? '' : localCategory
		});
	}

	function openDetail(id: number) {
		selectedId = id;
		showDetail = true;
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
		return $_(`user.usage.errors.categories.${cat}`, { default: cat || '-' });
	}

	const startRow = $derived((page - 1) * pageSize + 1);
	const endRow = $derived(Math.min(page * pageSize, total));
</script>

<div class="space-y-4" data-testid="errors-tab">
	<!-- Filters -->
	<div class="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
		<div class="min-w-[160px] space-y-1">
			<label for="err-model" class="text-xs font-medium text-muted-foreground">
				{$_('user.usage.errors.model', { default: 'Model' })}
			</label>
			<Input
				id="err-model"
				type="text"
				placeholder={$_('user.usage.errors.modelPlaceholder', { default: 'Filter by model...' })}
				bind:value={localModel}
				class="h-9"
			/>
		</div>
		<div class="min-w-[160px] space-y-1">
			<label for="err-category" class="text-xs font-medium text-muted-foreground">
				{$_('user.usage.errors.category', { default: 'Category' })}
			</label>
			<NativeSelect
				id="err-category"
				bind:value={localCategory}
				options={categoryOptions}
				class="h-9"
			/>
		</div>
		<Button type="button" size="sm" class="h-9" onclick={apply}>
			<Search class="mr-1.5 h-3.5 w-3.5" />
			{$_('common.search', { default: 'Search' })}
		</Button>
	</div>

	<!-- Table -->
	<div class="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
		<div class="overflow-x-auto">
			<table class="w-full text-sm" data-testid="errors-table">
				<thead>
					<tr class="border-b border-border bg-muted/40 text-left">
						<th class="whitespace-nowrap px-4 py-2.5 text-xs font-medium text-muted-foreground">
							{$_('user.usage.errors.model', { default: 'Model' })}
						</th>
						<th class="whitespace-nowrap px-4 py-2.5 text-xs font-medium text-muted-foreground">
							{$_('user.usage.errors.keyName', { default: 'API Key' })}
						</th>
						<th class="whitespace-nowrap px-4 py-2.5 text-xs font-medium text-muted-foreground">
							{$_('user.usage.errors.endpoint', { default: 'Endpoint' })}
						</th>
						<th class="whitespace-nowrap px-4 py-2.5 text-xs font-medium text-muted-foreground">
							{$_('user.usage.errors.status', { default: 'Status' })}
						</th>
						<th class="whitespace-nowrap px-4 py-2.5 text-xs font-medium text-muted-foreground">
							{$_('user.usage.errors.category', { default: 'Category' })}
						</th>
						<th class="whitespace-nowrap px-4 py-2.5 text-xs font-medium text-muted-foreground">
							{$_('user.usage.errors.message', { default: 'Message' })}
						</th>
						<th class="whitespace-nowrap px-4 py-2.5 text-xs font-medium text-muted-foreground">
							{$_('user.usage.errors.platform', { default: 'Platform' })}
						</th>
						<th class="whitespace-nowrap px-4 py-2.5 text-xs font-medium text-muted-foreground">
							{$_('user.usage.errors.time', { default: 'Time' })}
						</th>
					</tr>
				</thead>
				<tbody>
					{#if loading}
						{#each Array(5) as _, i (i)}
							<tr class="border-b border-border last:border-b-0">
								{#each Array(8) as __, j (j)}
									<td class="px-4 py-3">
										<div class="h-4 w-20 animate-pulse rounded bg-muted"></div>
									</td>
								{/each}
							</tr>
						{/each}
					{:else if rows.length === 0}
						<tr>
							<td colspan="8" class="px-4 py-12 text-center text-sm text-muted-foreground">
								{$_('user.usage.errors.empty', { default: 'No error requests found.' })}
							</td>
						</tr>
					{:else}
						{#each rows as row (row.id)}
							<tr
								class="cursor-pointer border-b border-border transition-colors last:border-b-0 hover:bg-muted/30"
								onclick={() => openDetail(row.id)}
								data-testid={`error-row-${row.id}`}
							>
								<td class="px-4 py-2.5 text-foreground">{row.model || '-'}</td>
								<td class="px-4 py-2.5">
									<span class="text-foreground">{row.keyName || '-'}</span>
									{#if row.keyDeleted}
										<Badge variant="outline" class="ml-1 text-[10px]">
											{$_('user.usage.errors.keyDeleted', { default: 'deleted' })}
										</Badge>
									{/if}
								</td>
								<td class="px-4 py-2.5 text-foreground">{row.inboundEndpoint || '-'}</td>
								<td class="px-4 py-2.5">
									<Badge variant={statusVariant(row.statusCode)}>
										{row.statusCode || '-'}
									</Badge>
								</td>
								<td class="px-4 py-2.5 text-foreground">{categoryLabel(row.category)}</td>
								<td class="max-w-[280px] truncate px-4 py-2.5 text-foreground" title={row.message}>
									{row.message || '-'}
								</td>
								<td class="px-4 py-2.5 text-foreground">{row.platform || '-'}</td>
								<td class="whitespace-nowrap px-4 py-2.5 text-foreground">{fmtDate(row.createdAt)}</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>

		<!-- Pagination -->
		{#if total > 0}
			<div class="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
				<span>
					{$_('user.usage.showingRange', {
						default: 'Showing {start}-{end} of {total}',
						values: { start: startRow, end: endRow, total }
					})}
				</span>
				<div class="flex items-center gap-1.5">
					<Button
						type="button"
						variant="outline"
						size="sm"
						class="h-7 px-2.5 text-xs"
						disabled={page <= 1}
						onclick={onPrev}
					>
						{$_('user.usage.prev', { default: 'Prev' })}
					</Button>
					<span class="px-2 tabular-nums">
						{page} / {totalPages || 1}
					</span>
					<Button
						type="button"
						variant="outline"
						size="sm"
						class="h-7 px-2.5 text-xs"
						disabled={totalPages > 0 && page >= totalPages}
						onclick={onNext}
					>
						{$_('user.usage.next', { default: 'Next' })}
					</Button>
				</div>
			</div>
		{/if}
	</div>
</div>

<UserErrorDetailModal
	bind:open={showDetail}
	errorId={selectedId}
	onOpenChange={(v) => { showDetail = v; }}
/>
