<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { Plus, RefreshCw, RotateCw, Search, ShieldCheck } from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import AccountFormDialog from '$lib/features/account/AccountFormDialog.svelte';
	import AccountToolsDialog from '$lib/features/account/AccountToolsDialog.svelte';
	import AccountReAuthDialog from '$lib/features/account/AccountReAuthDialog.svelte';
	import AccountAdvancedDialog from '$lib/features/account/AccountAdvancedDialog.svelte';
	import AccountDataDialog from '$lib/features/account/AccountDataDialog.svelte';
	import {
		batchClearAccountErrors, batchDeleteAccounts, batchRefreshAccounts, bulkUpdateAccounts,
		clearTempUnschedulable, exportAccountData, getTempUnschedulable, listAccounts, recoverAccountState,
		refreshAccount, revertProxyFallback,
		setAccountPrivacy, setAccountSchedulable, updateAccountStatus, type Account
	} from '$lib/api/admin/accounts';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import {
		ALL, PAGE_SIZE, VIRTUAL_THRESHOLD, accountIsSchedulable, accountPoolMode,
		formatGroupNames, formatProxyLabel, statusTone, summarizeAccounts
	} from '$lib/features/supply/supply';

	const PLATFORMS = ['claude', 'openai', 'gemini', 'sora', 'codex', 'antigravity'];
	const STATUS_OPTIONS = ['active', 'inactive', 'error', 'rate_limited'];
	const platformOptions = $derived([{ value: ALL, label: 'All platforms' }, ...PLATFORMS.map(v => ({ value: v, label: v }))]);
	const typeOptions = [{ value: ALL, label: 'All types' }, { value: 'api_key', label: 'API key' }, { value: 'apikey', label: 'apikey' }, { value: 'oauth', label: 'OAuth' }, { value: 'setup-token', label: 'Setup token' }, { value: 'bedrock', label: 'AWS Bedrock' }];
	const statusOptions = $derived([{ value: ALL, label: 'All statuses' }, ...STATUS_OPTIONS.map(v => ({ value: v, label: v })), { value: 'temp_unschedulable', label: 'temp_unschedulable' }, { value: 'unschedulable', label: 'unschedulable' }]);
	const boolOpts = [{ value: ALL, label: 'Any' }, { value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }];

	const privacyModeOptions = [{ value: ALL, label: 'Any privacy' }, { value: '__unset__', label: 'Not set' }, { value: 'training_off', label: 'Training off' }, { value: 'training_set_cf_blocked', label: 'CF blocked' }, { value: 'training_set_failed', label: 'Set failed' }];
	let rows = $state<Account[]>([]); let total = $state(0); let loading = $state(false); let busy = $state(false); let loadError = $state<string | null>(null);
	let page = $state(1); let search = $state(''); let platformF = $state(ALL); let typeF = $state(ALL); let statusF = $state(ALL); let groupF = $state('');
	let privacyF = $state(ALL); let schedulableF = $state(ALL); let hasProxyF = $state(ALL);
	let selectedIds = $state<Set<number>>(new Set());

	let formOpen = $state(false); let formAccount = $state<Account | null>(null);
	let toolsOpen = $state(false); let toolsAccount = $state<Account | null>(null);
	let reauthOpen = $state(false); let reauthAccount = $state<Account | null>(null);
	let advancedOpen = $state(false); let dataOpen = $state(false);
	let bulkEditOpen = $state(false); let bulkEditMode = $state<'selected' | 'filtered'>('selected');
	let bulkEditPreview = $state<number | null>(null); let bulkEditJson = $state('{ "status": "inactive" }');
	let exportJson = $state('');
	let deleteOpen = $state(false); let tempOpen = $state(false); let tempAccount = $state<Account | null>(null);
	let tempLoading = $state(false); let tempStatus = $state<Record<string, unknown> | null>(null);

	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
	const useVirtual = $derived(rows.length > VIRTUAL_THRESHOLD);
	const summary = $derived(summarizeAccounts(rows));
	const allSel = $derived(rows.length > 0 && rows.every(r => selectedIds.has(r.id)));

	function filters() {
		return { platform: platformF === ALL ? undefined : platformF, type: typeF === ALL ? undefined : typeF, status: statusF === ALL ? undefined : statusF,
			group: groupF.trim() || undefined, privacy_mode: privacyF === ALL ? undefined : privacyF, schedulable: schedulableF === ALL ? undefined : schedulableF,
			has_proxy: hasProxyF === ALL ? undefined : hasProxyF, search: search.trim() || undefined, sort_by: 'created_at', sort_order: 'desc' as const, lite: 'true' };
	}
	async function loadRows() { loading = true; loadError = null; try { const r = await listAccounts(page, PAGE_SIZE, filters()); rows = r.items; total = r.total; const present = new Set(rows.map(r => r.id)); selectedIds = new Set([...selectedIds].filter(id => present.has(id))); } catch (err) { loadError = err instanceof Error ? err.message : String(err); rows = []; total = 0; } finally { loading = false; } }
	function apply() { page = 1; void loadRows(); }
	function toggleSel(id: number) { const n = new Set(selectedIds); if (n.has(id)) n.delete(id); else n.add(id); selectedIds = n; }
	function togglePage() { if (allSel) { const n = new Set(selectedIds); for (const r of rows) n.delete(r.id); selectedIds = n; } else selectedIds = new Set([...selectedIds, ...rows.map(r => r.id)]); }
	function selArr(): number[] { return [...selectedIds]; }
	async function act(label: string, fn: () => Promise<unknown>) { busy = true; try { await fn(); showSuccess(label); await loadRows(); } catch (err) { showError(err instanceof Error ? err.message : String(err)); } finally { busy = false; } }

	function openCreate() { formAccount = null; formOpen = true; }
	function openEdit(a: Account) { formAccount = a; formOpen = true; }
	function openTools(a: Account) { toolsAccount = a; toolsOpen = true; }
	function openReAuth(a: Account) { reauthAccount = a; reauthOpen = true; }
	async function openBulkEdit(mode: 'selected' | 'filtered') { bulkEditMode = mode; if (mode === 'selected') { bulkEditPreview = selArr().length; } else { busy = true; try { const r = await listAccounts(1, 1, filters()); bulkEditPreview = r.total; } catch { bulkEditPreview = total; } busy = false; } bulkEditOpen = true; }
	async function confirmBulk() { busy = true; try { const ids = bulkEditMode === 'selected' ? selArr() : (await listAccounts(1, 100000, filters())).items.map(r => r.id); await bulkUpdateAccounts({ ids, updates: JSON.parse(bulkEditJson) }); showSuccess('Bulk update applied'); bulkEditOpen = false; await loadRows(); } catch (err) { showError(err instanceof Error ? err.message : String(err)); } finally { busy = false; } }
	async function confirmDelete() { const ids = selArr(); if (!ids.length) return; busy = true; try { await batchDeleteAccounts(ids); selectedIds = new Set(); deleteOpen = false; showSuccess('Deleted'); await loadRows(); } catch (err) { showError(err instanceof Error ? err.message : String(err)); } finally { busy = false; } }
	async function openTemp(a: Account) { tempAccount = a; tempStatus = null; tempOpen = true; tempLoading = true; try { tempStatus = await getTempUnschedulable(a.id); } catch (err) { showError(err instanceof Error ? err.message : String(err)); } finally { tempLoading = false; } }
	async function clearTemp() { if (!tempAccount) return; busy = true; try { await clearTempUnschedulable(tempAccount.id); tempOpen = false; showSuccess('Hold cleared'); await loadRows(); } catch (err) { showError(err instanceof Error ? err.message : String(err)); } finally { busy = false; } }

	let filteredBulkOpen = $state(false); let filteredBulkAction = $state<'refresh' | 'delete'>('refresh'); let filteredBulkCount = $state(0);
	const hasActiveFilters = $derived(search.trim() !== '' || platformF !== ALL || typeF !== ALL || statusF !== ALL || groupF.trim() !== '' || privacyF !== ALL || schedulableF !== ALL || hasProxyF !== ALL);
	const filterLabel = $derived(hasActiveFilters ? `${[search.trim() && 'search', platformF !== ALL && 'platform', typeF !== ALL && 'type', statusF !== ALL && 'status', groupF.trim() && 'group', privacyF !== ALL && 'privacy', schedulableF !== ALL && 'schedulable', hasProxyF !== ALL && 'proxy'].filter(Boolean).length} filter${[search.trim() && 'search', platformF !== ALL && 'platform', typeF !== ALL && 'type', statusF !== ALL && 'status', groupF.trim() && 'group', privacyF !== ALL && 'privacy', schedulableF !== ALL && 'schedulable', hasProxyF !== ALL && 'proxy'].filter(Boolean).length > 1 ? 's' : ''}` : '');

	async function openFilteredBulk(action: 'refresh' | 'delete') { filteredBulkAction = action; busy = true; try { const r = await listAccounts(1, 1, filters()); filteredBulkCount = r.total; } catch { filteredBulkCount = 0; } busy = false; filteredBulkOpen = true; }
	async function confirmFilteredBulk() { busy = true; try { const all = await listAccounts(1, 500, filters()); const ids = all.items.map(r => r.id); if (filteredBulkAction === 'refresh') await batchRefreshAccounts(ids); else await batchDeleteAccounts(ids); showSuccess(`${filteredBulkAction === 'refresh' ? 'Refreshed' : 'Deleted'} ${ids.length} accounts`); filteredBulkOpen = false; await loadRows(); } catch (err) { showError(err instanceof Error ? err.message : String(err)); } finally { busy = false; } }
	async function exportSelected() { busy = true; try { const payload = await exportAccountData({ ids: selArr(), includeProxies: true }); exportJson = JSON.stringify(payload, null, 2); dataOpen = true; } catch (err) { showError(err instanceof Error ? err.message : String(err)); } finally { busy = false; } }

	onMount(() => void loadRows());
</script>

<svelte:head><title>{$_('admin.accountsQuench.title', { default: 'Account Pool' })}</title></svelte:head>

<section class="space-y-5">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
		<div>
			<h1 class="text-2xl font-semibold tracking-normal text-foreground">{$_('admin.accountsQuench.title', { default: 'Account Pool' })}</h1>
			<p class="mt-1 max-w-3xl text-sm text-muted-foreground">{$_('admin.accountsQuench.description', { default: 'Operate upstream accounts, group bindings, proxy fallback state, and pool-mode routing.' })}</p>
		</div>
		<div class="flex gap-2">
			<Button variant="outline" onclick={loadRows} disabled={loading}><RefreshCw size={16} class={loading ? 'animate-spin' : ''} />{$_('common.refresh', { default: 'Refresh' })}</Button>
			<Button onclick={openCreate}><Plus size={16} />New account</Button>
		</div>
	</header>

	<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{#each summary as item}<Card><p class="text-xs font-medium uppercase text-muted-foreground">{item.label}</p><p class="mt-2 text-2xl font-semibold">{item.value}</p></Card>{/each}</div>

	<Card class="p-3">
		<div class="grid gap-3 lg:grid-cols-[minmax(220px,1.5fr)_150px_150px_150px_160px_150px_150px_150px_auto]">
			<label class="relative"><Search class="pointer-events-none absolute left-3 top-2.5 text-muted-foreground" size={16} /><Input class="pl-9" placeholder={$_('admin.accountsQuench.searchPlaceholder', { default: 'Search name, email, note' })} bind:value={search} onkeydown={(e) => e.key === 'Enter' && apply()} /></label>
			<NativeSelect bind:value={platformF} options={platformOptions} onchange={apply} data-testid="accounts-platform-filter" />
			<NativeSelect bind:value={typeF} options={typeOptions} onchange={apply} data-testid="accounts-type-filter" />
			<NativeSelect bind:value={statusF} options={statusOptions} onchange={apply} data-testid="accounts-status-filter" />
			<Input placeholder="Group ID" bind:value={groupF} onkeydown={(e) => e.key === 'Enter' && apply()} data-testid="accounts-group-filter" />
			<NativeSelect bind:value={privacyF} options={privacyModeOptions} onchange={apply} data-testid="accounts-privacy-filter" />
			<NativeSelect bind:value={schedulableF} options={boolOpts} onchange={apply} data-testid="accounts-schedulable-filter" />
			<NativeSelect bind:value={hasProxyF} options={boolOpts} onchange={apply} data-testid="accounts-has-proxy-filter" />
			<Button onclick={apply}>Apply</Button>
		</div>
	</Card>

	{#if hasActiveFilters}<p class="text-sm text-muted-foreground">{filterLabel}</p>{/if}
	<div class="flex flex-wrap items-center gap-2">
		<Button variant="outline" onclick={() => { dataOpen = true; }}>Data tools</Button>
		<Button variant="outline" onclick={() => { advancedOpen = true; }}>Advanced tools</Button>
		<Button variant="outline" disabled={selectedIds.size === 0 || busy} onclick={exportSelected}>Export selected</Button>
		<Button variant="outline" disabled={selectedIds.size === 0 || busy} onclick={() => act('Refreshed', () => batchRefreshAccounts(selArr()))}><RotateCw class="mr-1 inline" size={15} /> Refresh selected</Button>
		<Button variant="outline" disabled={selectedIds.size === 0 || busy} onclick={() => act('Errors cleared', () => batchClearAccountErrors(selArr()))}><ShieldCheck class="mr-1 inline" size={15} /> Clear errors</Button>
		<Button variant="outline" disabled={selectedIds.size === 0} onclick={() => openBulkEdit('selected')}>Edit selected</Button>
		<Button variant="outline" disabled={selectedIds.size === 0} onclick={() => { deleteOpen = true; }}>Delete selected</Button>
		{#if total > 0}
			<Button variant="outline" onclick={() => openBulkEdit('filtered')}>Edit filtered ({total})</Button>
			<Button variant="outline" onclick={() => openFilteredBulk('refresh')}>Refresh filtered</Button>
		{/if}
	</div>

	{#if loadError}<Alert variant="destructive">{loadError}</Alert>{/if}

	<VirtualTable rows={rows} rowHeight={68} {loading} getRowKey={(r) => r.id} class="max-h-[680px]">
		{#snippet header()}<tr class="text-xs text-muted-foreground"><th class="w-8 px-2"><Checkbox checked={allSel} onchange={togglePage} data-testid="accounts-select-all" /></th><th class="px-3">Account</th><th class="px-3">Platform</th><th class="px-3">Status</th><th class="px-3">Groups</th><th class="px-3">Proxy</th><th class="px-3 text-right">Actions</th></tr>{/snippet}
		{#snippet row({ row: account }: { row: Account; index: number })}<tr class="border-b border-border text-sm hover:bg-muted/30" data-testid="account-row">
			<td class="w-8 px-2"><Checkbox checked={selectedIds.has(account.id)} onchange={() => toggleSel(account.id)} aria-label="Select account" /></td>
			<td class="max-w-[220px] truncate px-3 font-medium">{account.name || account.email || `#${account.id}`}</td>
			<td class="px-3"><Badge variant="outline">{account.platform}</Badge></td>
			<td class="px-3"><Badge variant="outline" class={statusTone(account.status)}>{account.status}</Badge>{#if account.status === 'temp_unschedulable'}<Button variant="ghost" size="sm" class="ml-1" onclick={() => openTemp(account)}>temp hold</Button>{/if}</td>
			<td class="max-w-[160px] truncate px-3 text-xs text-muted-foreground">{formatGroupNames(account)}</td>
			<td class="px-3 text-xs">{formatProxyLabel(account.proxy, account.proxy_id)}</td>
			<td class="px-3 text-right">
				<div class="flex justify-end gap-1">
					<Button variant="ghost" size="sm" onclick={() => openEdit(account)}>Edit</Button>
					<Button variant="ghost" size="sm" onclick={() => openTools(account)}>Tools</Button>
					{#if account.type === 'oauth' || account.type === 'setup-token'}
						<Button variant="ghost" size="sm" onclick={() => openReAuth(account)}>ReAuth</Button>
						<Button variant="ghost" size="sm" onclick={() => act('Token refreshed', () => refreshAccount(account.id))}>Refresh token</Button>
					{/if}
					<Button variant="ghost" size="sm" onclick={() => act('Privacy toggled', () => setAccountPrivacy(account.id, true))}>Privacy</Button>
					<Button variant="ghost" size="sm" onclick={() => act('Recovered', () => recoverAccountState(account.id))}>Recover</Button>
					<Button variant="ghost" size="sm" onclick={() => act(account.status === 'active' ? 'Disabled' : 'Activated', () => updateAccountStatus(account.id, account.status === 'active' ? 'inactive' : 'active'))}>{account.status === 'active' ? 'Disable' : 'Enable'}</Button>
				</div>
			</td>
		</tr>{/snippet}
		{#snippet empty()}<p class="py-8 text-center text-muted-foreground">No accounts match the current filters.</p>{/snippet}
	</VirtualTable>

	<div class="flex items-center justify-between text-sm text-muted-foreground">
		<p>{total} accounts · page {page}/{totalPages}</p>
		<div class="flex gap-1"><Button variant="outline" size="sm" disabled={page <= 1} onclick={() => { page--; void loadRows(); }}>Prev</Button><Button variant="outline" size="sm" disabled={page >= totalPages} onclick={() => { page++; void loadRows(); }}>Next</Button></div>
	</div>
</section>

<AccountFormDialog bind:open={formOpen} account={formAccount} defaultPlatform={platformF === ALL ? 'openai' : platformF} onSaved={loadRows} onClose={() => {}} />
<AccountToolsDialog bind:open={toolsOpen} account={toolsAccount} onRefresh={loadRows} onClose={() => {}} />
<AccountReAuthDialog bind:open={reauthOpen} account={reauthAccount} onApplied={loadRows} onClose={() => {}} />
<AccountAdvancedDialog bind:open={advancedOpen} onRefresh={loadRows} onClose={() => {}} />
<AccountDataDialog bind:open={dataOpen} {selectedIds} {exportJson} onRefresh={loadRows} onClose={() => {}} />

<StandardDialog bind:open={bulkEditOpen} title={bulkEditMode === 'selected' ? 'Edit selected accounts' : 'Edit filtered accounts'} width="lg" data-testid="accounts-bulk-edit-dialog">
	<div class="mt-4 space-y-4">
		<p class="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">Apply to {bulkEditPreview ?? '...'} accounts.</p>
		<Textarea rows={8} bind:value={bulkEditJson} data-testid="accounts-bulk-edit-json" />
		<div class="flex justify-end gap-2"><Button variant="outline" onclick={() => (bulkEditOpen = false)}>Cancel</Button><Button disabled={busy || !bulkEditJson.trim()} onclick={confirmBulk} data-testid="accounts-bulk-edit-confirm">{busy ? 'Updating...' : 'Apply'}</Button></div>
	</div>
</StandardDialog>

<StandardDialog bind:open={deleteOpen} title="Delete selected accounts" width="sm" data-testid="accounts-delete-dialog">
	<div class="mt-4 space-y-4">
		<p class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">Delete {selectedIds.size} accounts? This cannot be undone.</p>
		<div class="flex justify-end gap-2"><Button variant="outline" onclick={() => (deleteOpen = false)}>Cancel</Button><Button variant="outline" class="border-destructive/30 text-destructive" disabled={busy} onclick={confirmDelete} data-testid="accounts-delete-confirm">{busy ? 'Deleting...' : 'Delete'}</Button></div>
	</div>
</StandardDialog>

<StandardDialog bind:open={tempOpen} title="Temporary unschedulable" width="md" data-testid="account-temp-unsched-dialog">
	<div class="mt-4 space-y-4">
		<p class="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm font-medium">{tempAccount?.name ?? tempAccount?.email ?? 'Account'}</p>
		{#if tempLoading}<p class="text-sm text-muted-foreground">Loading...</p>
		{:else if tempStatus}<pre class="max-h-72 overflow-auto rounded-md border bg-muted/40 p-3 text-xs" data-testid="account-temp-unsched-json">{JSON.stringify(tempStatus, null, 2)}</pre>
		{:else}<p class="text-sm text-muted-foreground">No status returned.</p>{/if}
		<div class="flex justify-end gap-2"><Button variant="outline" onclick={() => (tempOpen = false)}>Close</Button><Button variant="outline" disabled={busy || !tempAccount} onclick={clearTemp} data-testid="account-temp-unsched-clear">Clear hold</Button></div>
	</div>
</StandardDialog>

<StandardDialog bind:open={filteredBulkOpen} title="{filteredBulkAction === 'refresh' ? 'Refresh' : 'Delete'} filtered accounts" width="sm" data-testid="accounts-filtered-bulk-dialog">
	<div class="mt-4 space-y-4">
		<p class="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">{filteredBulkCount} accounts will be {filteredBulkAction === 'refresh' ? 'refreshed' : 'deleted'}.</p>
		<div class="flex justify-end gap-2"><Button variant="outline" onclick={() => (filteredBulkOpen = false)}>Cancel</Button><Button disabled={busy} onclick={confirmFilteredBulk} data-testid="accounts-filtered-confirm">{busy ? 'Processing...' : 'Confirm'}</Button></div>
	</div>
</StandardDialog>
