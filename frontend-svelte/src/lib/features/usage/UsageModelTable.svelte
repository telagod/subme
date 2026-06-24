<script lang="ts">
	/**
	 * UsageModelTable · paginated usage entries table
	 *
	 * Displays usage log rows with loading skeleton, empty state, error retry,
	 * and pagination controls.
	 */
	import { _ } from 'svelte-i18n';
	import type { UsageEntry } from '$lib/api/user/usage';
	import Button from '$lib/ui/Button.svelte';

	let {
		entries,
		loading,
		error,
		page,
		totalRows,
		totalPages,
		pageSize,
		onRetry,
		onPrev,
		onNext
	}: {
		entries: UsageEntry[];
		loading: boolean;
		error: string | null;
		page: number;
		totalRows: number;
		totalPages: number;
		pageSize: number;
		onRetry: () => void;
		onPrev: () => void;
		onNext: () => void;
	} = $props();

	// ── format helpers ─────────────────────────────────────────────────

	function fmtMoney(v: number | null | undefined): string {
		if (v === null || v === undefined || !Number.isFinite(v)) return '—';
		return `$${v.toFixed(4)}`;
	}

	function fmtInt(v: number | null | undefined): string {
		if (v === null || v === undefined || !Number.isFinite(v)) return '—';
		return Math.round(v).toLocaleString();
	}

	function fmtDate(s: string | null | undefined): string {
		if (!s) return '—';
		try {
			return new Date(s).toLocaleString();
		} catch {
			return s;
		}
	}

	function fmtLatency(v: number): string {
		if (!Number.isFinite(v)) return '—';
		if (v < 1000) return `${Math.round(v)} ms`;
		return `${(v / 1000).toFixed(2)} s`;
	}
</script>

{#if loading}
	<div class="space-y-2" data-testid="usage-list-loading">
		{#each Array.from({ length: 5 }) as _placeholder, i (i)}
			<div class="h-10 w-full animate-pulse rounded bg-muted"></div>
		{/each}
	</div>
{:else if error && entries.length === 0}
	<div
		class="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center"
		data-testid="usage-list-error"
	>
		<p class="text-sm font-medium text-destructive">
			{$_('user.usage.errors.listFailed', { default: '加载用量记录失败' })}
		</p>
		<p class="mt-1 text-xs text-muted-foreground">{error}</p>
		<Button
			type="button"
			onclick={onRetry}
			data-testid="usage-list-retry"
			variant="outline"
			size="sm"
			class="mt-4"
		>
			{$_('user.usage.retry', { default: '重试' })}
		</Button>
	</div>
{:else if entries.length === 0}
	<div
		class="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card p-12 text-center"
		data-testid="usage-list-empty"
	>
		<h2 class="text-base font-semibold text-foreground">
			{$_('user.usage.emptyTitle', { default: '该范围内无用量' })}
		</h2>
		<p class="max-w-sm text-sm text-muted-foreground">
			{$_('user.usage.emptyDescription', {
				default: '请尝试扩大日期范围或清除筛选条件。'
			})}
		</p>
	</div>
{:else}
	<div
		class="overflow-hidden rounded-lg border border-border bg-card"
		data-testid="usage-list-wrap"
	>
		<table class="w-full text-sm" data-testid="usage-list-table">
			<thead>
				<tr
					class="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"
				>
					<th class="px-4 py-2 text-left font-medium">
						{$_('user.usage.colTimestamp', { default: '时间' })}
					</th>
					<th class="px-4 py-2 text-left font-medium">
						{$_('user.usage.colModel', { default: '模型' })}
					</th>
					<th class="px-4 py-2 text-left font-medium">
						{$_('user.usage.colEndpoint', { default: '端点' })}
					</th>
					<th class="px-4 py-2 text-right font-medium">
						{$_('user.usage.colInputTokens', { default: '输入' })}
					</th>
					<th class="px-4 py-2 text-right font-medium">
						{$_('user.usage.colOutputTokens', { default: '输出' })}
					</th>
					<th class="px-4 py-2 text-right font-medium">
						{$_('user.usage.colCost', { default: '费用' })}
					</th>
					<th class="px-4 py-2 text-left font-medium">
						{$_('user.usage.colStatus', { default: '状态' })}
					</th>
					<th class="px-4 py-2 text-right font-medium">
						{$_('user.usage.colLatency', { default: '延迟' })}
					</th>
				</tr>
			</thead>
			<tbody>
				{#each entries as row (row.id)}
					<tr
						data-testid="usage-list-row"
						data-row-id={row.id}
						class="border-b border-border last:border-b-0 hover:bg-accent/40"
					>
						<td class="px-4 py-3 text-muted-foreground">{fmtDate(row.timestamp)}</td>
						<td class="px-4 py-3 font-mono text-xs">{row.model || '—'}</td>
						<td class="px-4 py-3 font-mono text-xs">{row.endpoint || '—'}</td>
						<td class="px-4 py-3 text-right tabular-nums">{fmtInt(row.inputTokens)}</td>
						<td class="px-4 py-3 text-right tabular-nums">{fmtInt(row.outputTokens)}</td>
						<td class="px-4 py-3 text-right tabular-nums font-medium text-foreground">
							{fmtMoney(row.cost)}
						</td>
						<td class="px-4 py-3 text-xs text-muted-foreground">{row.status}</td>
						<td class="px-4 py-3 text-right tabular-nums text-xs text-muted-foreground">
							{fmtLatency(row.latencyMs)}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- Pagination -->
	{#if totalRows > pageSize || totalPages > 1}
		<div
			class="flex items-center justify-between text-sm text-muted-foreground"
			data-testid="usage-pagination"
		>
			<span>
				{$_('user.usage.pageOf', {
					default: '第 {page} / {pages} 页',
					values: { page, pages: Math.max(totalPages, 1) }
				})}
			</span>
			<div class="flex items-center gap-2">
				<Button
					type="button"
					data-testid="usage-page-prev"
					disabled={page <= 1}
					onclick={onPrev}
					variant="outline"
					size="sm"
				>
					{$_('user.usage.prevPage', { default: '上一页' })}
				</Button>
				<Button
					type="button"
					data-testid="usage-page-next"
					disabled={totalPages > 0 && page >= totalPages}
					onclick={onNext}
					variant="outline"
					size="sm"
				>
					{$_('user.usage.nextPage', { default: '下一步' })}
				</Button>
			</div>
		</div>
	{/if}
{/if}
