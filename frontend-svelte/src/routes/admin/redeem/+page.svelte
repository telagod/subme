<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import {
		ChevronLeft,
		ChevronRight,
		RefreshCw,
		Search,
		Trash2,
		Zap
	} from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import {
		deleteRedeemCode,
		expireRedeemCode,
		generateRedeemCodes,
		listRedeemCodes,
		type RedeemCode,
		type RedeemCodeStatus,
		type RedeemCodeType
	} from '$lib/api/admin/redeem';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import {
		ALL,
		PAGE_SIZE,
		formatCodeValue,
		formatDate,
		formatMoney,
		statusTone,
		summarizeRedeemCodes
	} from '$lib/features/codes/codes';

	const TYPE_OPTIONS: RedeemCodeType[] = ['balance', 'concurrency', 'subscription', 'invitation'];
	const STATUS_OPTIONS: RedeemCodeStatus[] = ['active', 'unused', 'used', 'expired', 'disabled'];
	const typeOptions = TYPE_OPTIONS.map((value) => ({ value, label: value }));
	const typeFilterOptions = [{ value: ALL, label: 'All types' }, ...typeOptions];
	const statusFilterOptions = [
		{ value: ALL, label: 'All status' },
		...STATUS_OPTIONS.map((value) => ({ value, label: value }))
	];

	let rows = $state<RedeemCode[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let saving = $state(false);
	let loadError = $state<string | null>(null);
	let page = $state(1);
	let searchInput = $state('');
	let typeFilter = $state(ALL);
	let statusFilter = $state(ALL);
	let showGenerate = $state(false);
	let generatedCodes = $state<RedeemCode[]>([]);
	let formType = $state('balance');
	let form = $state({
		count: 1,
		type: 'balance' as RedeemCodeType,
		value: 10,
		group_id: '',
		validity_days: 30,
		expires_in_days: 30
	});

	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
	const summary = $derived(summarizeRedeemCodes(rows));

	async function loadRows() {
		loading = true;
		loadError = null;
		try {
			const resp = await listRedeemCodes(page, PAGE_SIZE, {
				search: searchInput.trim() || undefined,
				type: typeFilter === ALL ? undefined : (typeFilter as RedeemCodeType),
				status: statusFilter === ALL ? undefined : (statusFilter as RedeemCodeStatus),
				sort_by: 'id',
				sort_order: 'desc'
			});
			rows = resp.items;
			total = resp.total;
		} catch (err) {
			loadError = err instanceof Error ? err.message : String(err);
			rows = [];
			total = 0;
		} finally {
			loading = false;
		}
	}

	function resetAndLoad() {
		page = 1;
		void loadRows();
	}

	async function runAction(message: string, action: () => Promise<unknown>) {
		saving = true;
		try {
			await action();
			showSuccess(message);
			await loadRows();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			saving = false;
		}
	}

	async function submitGenerate() {
		saving = true;
		generatedCodes = [];
		try {
			const payload = {
				count: Math.max(1, Number(form.count) || 1),
				type: form.type,
				value: Number(form.value) || 0,
				group_id: form.type === 'subscription' && form.group_id ? Number(form.group_id) : undefined,
				validity_days: form.type === 'subscription' ? Number(form.validity_days) || undefined : undefined,
				expires_in_days: Number(form.expires_in_days) || undefined
			};
			generatedCodes = await generateRedeemCodes(payload);
			showSuccess('Redeem codes generated');
			await loadRows();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			saving = false;
		}
	}

	onMount(() => {
		void loadRows();
	});
</script>

<svelte:head>
	<title>{$_('nav.quench.redeem', { default: '兑换码' })}</title>
</svelte:head>

<div class="space-y-4 px-5 py-5">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-foreground">
				{$_('nav.quench.redeem', { default: '兑换码' })}
			</h1>
			<p class="text-sm text-muted-foreground">{$_('admin.redeem.description', { default: '生成、搜索、过期和删除用户兑换码。' })}</p>
		</div>
		<div class="flex gap-2">
			<Button variant="outline" onclick={loadRows} disabled={loading}>
				<RefreshCw size={15} class={loading ? 'animate-spin' : ''} />{$_('common.refresh', { default: '刷新' })}
			</Button>
			<Button onclick={() => (showGenerate = !showGenerate)}>
				<Zap size={15} />{$_('admin.redeem.generate', { default: '生成' })}
			</Button>
		</div>
	</header>

	<section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
		{#each summary as item}
			<Card class="p-3">
				<p class="text-xs uppercase text-muted-foreground">{item.label}</p>
				<p class="mt-1 text-2xl font-semibold">{item.label === 'Value' ? formatMoney(item.value) : item.value}</p>
			</Card>
		{/each}
	</section>

	{#if showGenerate}
		<Card>
			<div class="grid gap-3 md:grid-cols-6">
				<label class="space-y-1 text-xs font-medium text-muted-foreground">
					<span>{$_('admin.redeem.count', { default: '数量' })}</span>
					<Input class="h-9 px-2" type="number" min="1" bind:value={form.count} />
				</label>
				<label class="space-y-1 text-xs font-medium text-muted-foreground">
					<span>{$_('common.type', { default: '类型' })}</span>
					<NativeSelect class="h-9 w-full px-2" bind:value={formType} options={typeOptions} onchange={() => (form.type = formType as RedeemCodeType)} />
				</label>
				<label class="space-y-1 text-xs font-medium text-muted-foreground">
					<span>{$_('common.value', { default: '值' })}</span>
					<Input class="h-9 px-2" type="number" min="0" step="0.01" bind:value={form.value} />
				</label>
				<label class="space-y-1 text-xs font-medium text-muted-foreground">
					<span>{$_('admin.redeem.groupId', { default: '分组 ID' })}</span>
					<Input class="h-9 px-2" disabled={form.type !== 'subscription'} bind:value={form.group_id} />
				</label>
				<label class="space-y-1 text-xs font-medium text-muted-foreground">
					<span>{$_('admin.redeem.validityDays', { default: '有效天数' })}</span>
					<Input class="h-9 px-2" type="number" min="1" disabled={form.type !== 'subscription'} bind:value={form.validity_days} />
				</label>
				<label class="space-y-1 text-xs font-medium text-muted-foreground">
					<span>{$_('admin.redeem.expiresIn', { default: '有效期' })}</span>
					<Input class="h-9 px-2" type="number" min="0" bind:value={form.expires_in_days} />
				</label>
			</div>
			<div class="mt-3 flex items-center justify-between gap-3">
				<div class="truncate font-mono text-xs text-muted-foreground">{generatedCodes.map((c) => c.code).join(', ')}</div>
				<Button disabled={saving || form.count < 1} onclick={submitGenerate}>{$_('admin.redeem.generate', { default: '生成' })}</Button>
			</div>
		</Card>
	{/if}

	<Card class="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
		<div class="relative flex-1">
			<Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
			<Input class="pl-9" placeholder="Search codes" bind:value={searchInput} onkeydown={(event) => { if (event.key === 'Enter') resetAndLoad(); }} />
		</div>
		<div class="flex flex-wrap gap-2">
			<NativeSelect class="h-9" bind:value={typeFilter} options={typeFilterOptions} onchange={resetAndLoad} data-testid="admin-redeem-type-filter" />
			<NativeSelect class="h-9" bind:value={statusFilter} options={statusFilterOptions} onchange={resetAndLoad} data-testid="admin-redeem-status-filter" />
			<Button class="h-9" onclick={resetAndLoad}>{$_('common.search', { default: '搜索' })}</Button>
		</div>
	</Card>

	{#if loadError}
		<Alert variant="destructive">{loadError}</Alert>
	{/if}

	<Card padded={false} class="overflow-hidden">
		<VirtualTable rows={rows} rowHeight={64} getRowKey={(row) => row.id} loading={loading}>
			{#snippet header()}
				<div class="grid grid-cols-[210px_120px_140px_110px_120px_120px_160px] border-b bg-muted/60 px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
					<div>{$_('admin.redeem.code', { default: '代码' })}</div><div>{$_('common.type', { default: '类型' })}</div><div>{$_('common.value', { default: '值' })}</div><div>{$_('common.status', { default: '状态' })}</div><div>{$_('admin.redeem.usedBy', { default: 'Used by' })}</div><div>{$_('admin.redeem.expires', { default: '过期' })}</div><div class="text-right">{$_('common.actions', { default: '操作' })}</div>
				</div>
			{/snippet}
			{#snippet row({ row })}
				<div class="grid min-w-[980px] grid-cols-[210px_120px_140px_110px_120px_120px_160px] items-center border-b px-3 py-3 text-sm" data-testid="admin-redeem-row" data-code-id={row.id}>
					<code class="truncate font-mono text-xs">{row.code}</code>
					<div class="text-xs text-muted-foreground">{row.type}</div>
					<div class="truncate text-xs">{formatCodeValue(row)}</div>
					<div><Badge variant="outline" class={statusTone(row.status)}>{row.status}</Badge></div>
					<div class="text-xs text-muted-foreground">{row.used_by ?? '—'}</div>
					<div class="text-xs text-muted-foreground">{formatDate(row.expires_at)}</div>
					<div class="flex justify-end gap-1.5">
						<Button variant="outline" size="sm" disabled={saving || row.status === 'expired'} onclick={() => runAction($_('admin.redeem.codeExpired', { default: 'Redeem code expired' }), () => expireRedeemCode(row.id))}>{$_('admin.redeem.expire', { default: '过期' })}</Button>
						<Button
							variant="outline"
							size="icon"
							class="text-destructive"
							disabled={saving}
							onclick={() => runAction($_('admin.redeem.codeDeleted', { default: '兑换码已删除' }), () => deleteRedeemCode(row.id))}
							aria-label="Delete redeem code"
						>
							<Trash2 class="h-3.5 w-3.5" />
						</Button>
					</div>
				</div>
			{/snippet}
			{#snippet empty()}<div class="p-6 text-center text-sm text-muted-foreground">{$_('admin.redeem.noCodesFound', { default: '暂无兑换码' })}</div>{/snippet}
			{#snippet loadingSlot()}<div class="p-4 text-sm text-muted-foreground">{$_('admin.redeem.loadingCodes', { default: '加载兑换码中...' })}</div>{/snippet}
		</VirtualTable>
		<div class="flex items-center justify-between border-t px-3 py-2 text-sm text-muted-foreground">
			<span>{total} codes · page {page} / {totalPages}</span>
			<div class="flex gap-2">
				<Button variant="outline" size="icon" disabled={page <= 1 || loading} onclick={() => { page -= 1; void loadRows(); }} aria-label="Previous page"><ChevronLeft size={16} /></Button>
				<Button variant="outline" size="icon" disabled={page >= totalPages || loading} onclick={() => { page += 1; void loadRows(); }} aria-label="Next page"><ChevronRight size={16} /></Button>
			</div>
		</div>
	</Card>
</div>
