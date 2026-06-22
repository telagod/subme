<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { ChevronLeft, ChevronRight, ExternalLink } from '@lucide/svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import {
		listOpsRequestErrors,
		getOpsRequestErrorDetail,
		type OpsErrorLog,
		type OpsErrorDetail,
		type OpsErrorListQueryParams
	} from '$lib/api/admin/ops';
	import { showError } from '$lib/stores/toast.svelte';

	type Props = {
		startDate?: string;
		endDate?: string;
		userId?: number;
		apiKeyId?: number;
		accountId?: number;
		groupId?: number;
		model?: string;
	};

	let { startDate, endDate, userId, apiKeyId, accountId, groupId, model }: Props = $props();

	let rows = $state<OpsErrorLog[]>([]);
	let total = $state(0);
	let page = $state(1);
	let pageSize = $state(20);
	let loading = $state(false);
	let showDetail = $state(false);
	let detail = $state<OpsErrorDetail | null>(null);
	let detailLoading = $state(false);

	const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)));

	function toRFC3339(d: string | undefined, endOfDay = false): string | undefined {
		if (!d) return undefined;
		return new Date(d + (endOfDay ? 'T23:59:59.999' : 'T00:00:00')).toISOString();
	}

	export async function load() {
		loading = true;
		try {
			const params: OpsErrorListQueryParams = {
				page,
				page_size: pageSize,
				start_time: toRFC3339(startDate),
				end_time: toRFC3339(endDate, true),
				user_id: userId,
				api_key_id: apiKeyId,
				account_id: accountId,
				group_id: groupId,
				model: model || undefined
			};
			const resp = await listOpsRequestErrors(params);
			rows = resp.items;
			total = resp.total;
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
			rows = [];
			total = 0;
		} finally {
			loading = false;
		}
	}

	async function openDetail(id: number) {
		showDetail = true;
		detailLoading = true;
		detail = null;
		try {
			detail = await getOpsRequestErrorDetail(id);
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			detailLoading = false;
		}
	}

	function severityTone(sev?: string): string {
		if (sev === 'P0') return 'border-destructive/40 bg-destructive/10 text-destructive';
		if (sev === 'P1') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
		return 'border-border bg-background text-muted-foreground';
	}

	function formatTime(value?: string | null): string {
		if (!value) return '—';
		const d = new Date(value);
		return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
	}

	function prevPage() {
		if (page > 1) { page -= 1; void load(); }
	}

	function nextPage() {
		if (page < totalPages) { page += 1; void load(); }
	}
</script>

<Card padded={false} class="overflow-hidden">
	<VirtualTable {rows} rowHeight={68} getRowKey={(r) => r.id} {loading}>
		{#snippet header()}
			<div class="grid min-w-[960px] grid-cols-[160px_100px_minmax(200px,1.5fr)_minmax(200px,1fr)_120px_100px_50px] border-b bg-muted/60 px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
				<div>{$_('admin.usage.errors.time', { default: '时间' })}</div>
				<div>{$_('admin.usage.errors.severity', { default: '严重度' })}</div>
				<div>{$_('admin.usage.errors.message', { default: '消息' })}</div>
				<div>{$_('admin.usage.errors.model', { default: '模型' })}</div>
				<div>{$_('admin.usage.errors.user', { default: '用户' })}</div>
				<div>{$_('admin.usage.errors.status', { default: '状态' })}</div>
				<div></div>
			</div>
		{/snippet}
		{#snippet row({ row })}
			<div
				class="grid min-w-[960px] grid-cols-[160px_100px_minmax(200px,1.5fr)_minmax(200px,1fr)_120px_100px_50px] items-center border-b px-3 py-2.5 text-sm"
				data-testid="error-row"
			>
				<div class="text-xs text-muted-foreground">{formatTime(row.created_at)}</div>
				<div>
					<Badge variant="outline" class={severityTone(row.severity)}>{row.severity ?? 'P3'}</Badge>
				</div>
				<div class="min-w-0">
					<p class="truncate text-sm">{row.message ?? '—'}</p>
					<p class="truncate text-xs text-muted-foreground">{row.phase ?? ''} {row.type ? `(${row.type})` : ''}</p>
				</div>
				<div class="min-w-0">
					<p class="truncate text-xs font-medium">{row.requested_model ?? row.model ?? '—'}</p>
					<p class="truncate text-xs text-muted-foreground">{row.inbound_endpoint ?? ''}</p>
				</div>
				<div class="truncate text-xs text-muted-foreground">{row.user_email ?? (row.user_id != null ? `#${row.user_id}` : '—')}</div>
				<div class="text-xs">{row.status_code ?? '—'}</div>
				<div>
					<Button variant="ghost" size="icon" class="h-7 w-7" onclick={() => openDetail(row.id)} aria-label="View detail">
						<ExternalLink size={14} />
					</Button>
				</div>
			</div>
		{/snippet}
		{#snippet empty()}
			<div class="p-6 text-center text-sm text-muted-foreground">
				{$_('admin.usage.errors.empty', { default: '暂无错误记录' })}
			</div>
		{/snippet}
		{#snippet loadingSlot()}
			<div class="space-y-2 p-3">
				{#each Array(5) as _}
					<div class="h-12 animate-pulse rounded bg-muted"></div>
				{/each}
			</div>
		{/snippet}
	</VirtualTable>
	<div class="flex items-center justify-between border-t px-3 py-2 text-sm text-muted-foreground">
		<span>{total} errors · page {page} / {totalPages}</span>
		<div class="flex items-center gap-2">
			<Button variant="outline" size="icon" disabled={page <= 1 || loading} onclick={prevPage} aria-label="Previous page">
				<ChevronLeft size={16} />
			</Button>
			<Button variant="outline" size="icon" disabled={page >= totalPages || loading} onclick={nextPage} aria-label="Next page">
				<ChevronRight size={16} />
			</Button>
		</div>
	</div>
</Card>

<!-- Error detail dialog -->
<StandardDialog bind:open={showDetail} title={$_('admin.usage.errors.detail', { default: '错误详情' })}>
	{#if detailLoading}
		<div class="flex items-center justify-center py-8 text-sm text-muted-foreground">
			{$_('common.loading', { default: '加载中...' })}
		</div>
	{:else if detail}
		<div class="space-y-3 text-sm">
			<div class="grid grid-cols-2 gap-2">
				<div><span class="text-xs text-muted-foreground">Time</span><p>{formatTime(detail.created_at)}</p></div>
				<div><span class="text-xs text-muted-foreground">Severity</span><p>{detail.severity ?? 'P3'}</p></div>
				<div><span class="text-xs text-muted-foreground">Phase</span><p>{detail.phase ?? '—'}</p></div>
				<div><span class="text-xs text-muted-foreground">Type</span><p>{detail.type ?? '—'}</p></div>
				<div><span class="text-xs text-muted-foreground">Status</span><p>{detail.status_code ?? '—'}</p></div>
				<div><span class="text-xs text-muted-foreground">Upstream Status</span><p>{detail.upstream_status_code ?? '—'}</p></div>
				<div><span class="text-xs text-muted-foreground">Model</span><p>{detail.requested_model ?? detail.model ?? '—'}</p></div>
				<div><span class="text-xs text-muted-foreground">Upstream Model</span><p>{detail.upstream_model ?? '—'}</p></div>
				<div><span class="text-xs text-muted-foreground">User</span><p>{detail.user_email ?? (detail.user_id != null ? `#${detail.user_id}` : '—')}</p></div>
				<div><span class="text-xs text-muted-foreground">API Key</span><p>{detail.api_key_name ?? (detail.api_key_id != null ? `#${detail.api_key_id}` : '—')}</p></div>
				<div><span class="text-xs text-muted-foreground">Account</span><p>{detail.account_name ?? (detail.account_id != null ? `#${detail.account_id}` : '—')}</p></div>
				<div><span class="text-xs text-muted-foreground">Client IP</span><p>{detail.client_ip ?? '—'}</p></div>
			</div>
			{#if detail.message}
				<div>
					<span class="text-xs text-muted-foreground">Message</span>
					<p class="mt-1 rounded bg-muted p-2 font-mono text-xs">{detail.message}</p>
				</div>
			{/if}
			{#if detail.upstream_error_message}
				<div>
					<span class="text-xs text-muted-foreground">Upstream Error</span>
					<p class="mt-1 rounded bg-muted p-2 font-mono text-xs">{detail.upstream_error_message}</p>
				</div>
			{/if}
			{#if detail.error_body}
				<div>
					<span class="text-xs text-muted-foreground">Error Body</span>
					<pre class="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 font-mono text-xs">{detail.error_body}</pre>
				</div>
			{/if}
			<div class="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
				<div>Auth: {detail.auth_latency_ms != null ? `${detail.auth_latency_ms}ms` : '—'}</div>
				<div>Route: {detail.routing_latency_ms != null ? `${detail.routing_latency_ms}ms` : '—'}</div>
				<div>Upstream: {detail.upstream_latency_ms != null ? `${detail.upstream_latency_ms}ms` : '—'}</div>
				<div>TTFT: {detail.time_to_first_token_ms != null ? `${detail.time_to_first_token_ms}ms` : '—'}</div>
			</div>
		</div>
	{:else}
		<p class="py-4 text-sm text-muted-foreground">
			{$_('admin.usage.errors.notFound', { default: '未找到错误详情。' })}
		</p>
	{/if}
</StandardDialog>
