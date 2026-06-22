<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { ChevronLeft, ChevronRight, CheckCircle2 } from '@lucide/svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import { listRiskLogs, unbanRiskUser, type ContentModerationLog } from '$lib/api/admin/riskControl';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import { PAGE_SIZE, RESULT_ALL, formatDateTime, formatNumber, resultLabel, resultTone } from '$lib/features/risk-control/risk-control';

	type Props = { refreshToken?: number };
	let { refreshToken = 0 }: Props = $props();

	const resultOptions = [{ value: RESULT_ALL, label: 'All results' }, { value: 'hit', label: 'hit' }, { value: 'blocked', label: 'blocked' }, { value: 'pass', label: 'pass' }, { value: 'error', label: 'error' }];

	let logs = $state<ContentModerationLog[]>([]); let total = $state(0); let page = $state(1); let loading = $state(false);
	let resultFilter = $state(RESULT_ALL); let fromDate = $state(''); let toDate = $state(''); let searchInput = $state('');
	let unbanningUserId = $state<number | null>(null);
	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));

	async function loadLogs() {
		loading = true;
		try {
			const r = await listRiskLogs({ page, page_size: PAGE_SIZE, result: resultFilter === RESULT_ALL ? undefined : resultFilter, from: fromDate || undefined, to: toDate || undefined, search: searchInput.trim() || undefined });
			logs = r.items ?? r.data ?? []; total = r.total ?? 0;
		} catch (err) { showError(err instanceof Error ? err.message : String(err)); }
		finally { loading = false; }
	}
	function reset() { page = 1; void loadLogs(); }
	async function unban(row: ContentModerationLog) { if (!row.user_id) return; unbanningUserId = row.user_id; try { await unbanRiskUser(row.user_id); showSuccess('User unbanned'); await loadLogs(); } catch (err) { showError(err instanceof Error ? err.message : String(err)); } finally { unbanningUserId = null; } }

	$effect(() => { void refreshToken; void loadLogs(); });
</script>

<Card padded={false}>
	<div class="grid gap-2 border-b p-3 lg:grid-cols-[140px_180px_180px_minmax(0,1fr)_auto]">
		<NativeSelect bind:value={resultFilter} options={resultOptions} onchange={reset} />
		<Input type="date" bind:value={fromDate} onchange={reset} />
		<Input type="date" bind:value={toDate} onchange={reset} />
		<Input placeholder="Search request, user, content" bind:value={searchInput} onkeydown={(e) => { if (e.key === 'Enter') reset(); }} />
		<Button variant="outline" onclick={reset}>{$_('common.search', { default: '搜索' })}</Button>
	</div>
	<VirtualTable rows={logs} rowHeight={76} getRowKey={(r) => r.id} {loading}>
		{#snippet header()}
			<div class="grid min-w-[1180px] grid-cols-[160px_110px_190px_150px_150px_minmax(280px,1fr)_150px_120px] border-b bg-muted/60 px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
				<div>Time</div><div>Result</div><div>User</div><div>Endpoint</div><div>Model</div><div>Input</div><div>Score</div><div class="text-right">Actions</div>
			</div>
		{/snippet}
		{#snippet row({ row })}<div class="grid min-w-[1180px] grid-cols-[160px_110px_190px_150px_150px_minmax(280px,1fr)_150px_120px] items-center border-b px-3 py-3 text-sm" data-testid="admin-risk-log-row">
			<div class="text-xs text-muted-foreground">{formatDateTime(row.created_at)}</div>
			<div><Badge variant="outline" class={resultTone(row)}>{resultLabel(row)}</Badge></div>
			<div class="min-w-0"><div class="truncate">{row.user_email || '—'}</div><div class="text-xs text-muted-foreground">#{row.user_id ?? '—'} · {row.user_status || '—'}</div></div>
			<div class="truncate text-xs text-muted-foreground">{row.endpoint || '—'}</div>
			<div class="truncate text-xs">{row.model || '—'}</div>
			<div class="truncate" title={row.input_excerpt || row.error}>{row.input_excerpt || row.error || '—'}</div>
			<div class="text-xs"><div>{row.highest_category || '—'}</div><div class="text-muted-foreground">{row.highest_score ?? 0}</div></div>
			<div class="flex justify-end">{#if row.auto_banned && row.user_id && row.user_status === 'disabled'}<Button variant="outline" size="sm" disabled={unbanningUserId === row.user_id} onclick={() => unban(row)}>Unban</Button>{:else}<CheckCircle2 size={16} class="text-muted-foreground" />{/if}</div>
		</div>{/snippet}
		{#snippet empty()}<div class="p-6 text-center text-sm text-muted-foreground">No moderation logs found</div>{/snippet}
	</VirtualTable>
	<div class="flex items-center justify-between border-t px-3 py-2 text-sm text-muted-foreground">
		<span>{formatNumber(total)} logs · page {page} / {totalPages}</span>
		<div class="flex items-center gap-2"><Button variant="outline" size="icon" disabled={page <= 1 || loading} onclick={() => { page--; void loadLogs(); }} aria-label="Previous"><ChevronLeft size={16} /></Button><Button variant="outline" size="icon" disabled={page >= totalPages || loading} onclick={() => { page++; void loadLogs(); }} aria-label="Next"><ChevronRight size={16} /></Button></div>
	</div>
</Card>
