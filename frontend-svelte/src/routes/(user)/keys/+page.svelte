<script lang="ts">
	/**
	 * /(user)/keys · API Keys 管理（M6）
	 *
	 * 设计：
	 *   - 列表来源：listKeys() —— 一次性拉到（默认 page_size=50）。后续超大量
	 *     用户再追分页/虚拟切换。
	 *   - 行数 > 50 切 VirtualTable；否则原生 table（更接近 Vue tree 视觉）。
	 *     50 阈值 = 与默认 page_size 一致，跨过即触发虚拟化。
	 *   - 状态筛选 Select 强制 '__all__' sentinel —— reshadcn-migration 红线。
	 *   - 顶部：title + Create button。
	 *   - 空态：CTA 「Create your first key」直接打开 CreateKeyDialog。
	 *   - 行 Actions：Revoke（confirm dialog）。Edit/Toggle 后续 M6+ 增量。
	 *
	 * RED LINE：
	 *   - 列表行的 plaintext key **不存在**（后端 list 已 mask 为 prefix-suffix）；
	 *     完整 key 仅在 CreateKeyDialog reveal panel 出现一次。
	 *   - 不复制后端 mask 逻辑到这里 —— api/user/apiKeys.ts mapKey() 是唯一事实源。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { Plus, Pencil, Trash2, KeyRound, RotateCw, Power } from '@lucide/svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import CreateKeyDialog from '$lib/features/keys/CreateKeyDialog.svelte';
	import EditKeyDialog from '$lib/features/keys/EditKeyDialog.svelte';
	import RevokeKeyDialog from '$lib/features/keys/RevokeKeyDialog.svelte';
	import { listKeys, toggleKeyStatus, type ApiKey, type ApiKeyStatus } from '$lib/api/user/apiKeys';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';

	// ── 数据 ────────────────────────────────────────────────────────────
	let keys = $state<ApiKey[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);

	// ── 筛选 ────────────────────────────────────────────────────────────
	// reshadcn-migration: '__all__' sentinel 禁空字符串 value。
	const STATUS_ALL = '__all__' as const;
	let statusFilter = $state<typeof STATUS_ALL | ApiKeyStatus>(STATUS_ALL);

	// ── Dialog 状态 ─────────────────────────────────────────────────────
	let createOpen = $state(false);
	let editOpen = $state(false);
	let editTarget = $state<ApiKey | null>(null);
	let revokeOpen = $state(false);
	let revokeTarget = $state<ApiKey | null>(null);

	function openEdit(key: ApiKey) { editTarget = key; editOpen = true; }

	// 阈值：> 50 行落虚拟表
	const VIRTUAL_THRESHOLD = 50;
	const filteredKeys = $derived.by(() => {
		if (statusFilter === STATUS_ALL) return keys;
		return keys.filter((k) => k.status === statusFilter);
	});
	const useVirtual = $derived(filteredKeys.length > VIRTUAL_THRESHOLD);

	async function refreshList() {
		loading = true;
		loadError = null;
		try {
			const resp = await listKeys({
				page: 1,
				page_size: 100,
				status: statusFilter
			});
			keys = resp.items;
		} catch (err) {
			const e = err as Error;
			loadError = e?.message ?? 'Failed to load keys';
			showError($_('user.keys.failedToLoad', { default: 'Failed to load API keys' }));
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		refreshList();
	});

	// 状态筛选变化即触发 refetch —— 显式 onchange，避免 $effect 在
	// vitest mount 上下文里被误判为 orphan effect。
	function handleStatusChange(e: Event) {
		const v = (e.currentTarget as HTMLSelectElement).value;
		statusFilter = v as typeof STATUS_ALL | ApiKeyStatus;
		refreshList();
	}

	function openCreate() {
		createOpen = true;
	}
	function handleCreated(_key: ApiKey) {
		// 创建后立即刷新；reveal panel 仍打开供 copy。
		refreshList();
	}
	function openRevoke(k: ApiKey) {
		revokeTarget = k;
		revokeOpen = true;
	}
	function handleRevoked(_id: number) {
		refreshList();
	}
	let toggling = $state<Set<number>>(new Set());
	async function handleToggleStatus(k: ApiKey) {
		if (toggling.has(k.id)) return;
		toggling = new Set([...toggling, k.id]);
		try {
			const updated = await toggleKeyStatus(k.id, k.status);
			// Update the key in place
			keys = keys.map(existing => existing.id === updated.id ? updated : existing);
			const label = updated.status === 'active'
				? $_('user.keys.enabled', { default: 'Key enabled' })
				: $_('user.keys.disabled', { default: 'Key disabled' });
			showSuccess(label);
		} catch (err) {
			showError((err as Error)?.message ?? $_('user.keys.toggleError', { default: 'Failed to toggle key status' }));
		} finally {
			const next = new Set(toggling);
			next.delete(k.id);
			toggling = next;
		}
	}

	// 显示工具
	function maskKey(k: ApiKey): string {
		return `${k.prefix}…${k.suffix}`;
	}
	function fmtQuota(k: ApiKey): string {
		if (!k.quotaTotal) {
			return `$${k.quotaUsed.toFixed(2)} / ${$_('user.keys.unlimited', { default: 'Unlimited' })}`;
		}
		return `$${k.quotaUsed.toFixed(2)} / $${k.quotaTotal.toFixed(2)}`;
	}
	function fmtDate(s: string | null): string {
		if (!s) return '—';
		try {
			return new Date(s).toLocaleString();
		} catch {
			return s;
		}
	}
	function statusBadgeClass(s: ApiKeyStatus): string {
		switch (s) {
			case 'active':
				return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
			case 'inactive':
				return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
			case 'quota_exhausted':
				return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200';
			case 'expired':
				return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
		}
	}
	function statusLabel(s: ApiKeyStatus): string {
		return $_(`user.keys.status.${s}`, { default: s });
	}
</script>

<svelte:head>
	<title>{$_('nav.apiKeys', { default: 'API Keys' })} · sub2api</title>
</svelte:head>

<section class="space-y-6" data-testid="keys-page">
	<!-- Header -->
	<header class="flex items-start justify-between gap-4">
		<div class="space-y-1">
			<h1 class="text-2xl font-semibold tracking-tight text-foreground">
				{$_('user.keys.pageTitle', { default: 'API Keys' })}
			</h1>
			<p class="text-sm text-muted-foreground">
				{$_('user.keys.pageSubtitle', {
					default: 'Create and manage your API keys for programmatic access.'
				})}
			</p>
		</div>
		<div class="flex shrink-0 items-center gap-2">
			<Button
				variant="outline"
				size="icon"
				aria-label={$_('user.keys.refresh', { default: 'Refresh' })}
				data-testid="keys-refresh-btn"
				onclick={refreshList}
				class="h-9 w-9 text-muted-foreground"
			>
				<RotateCw class="h-4 w-4" />
			</Button>
			<Button
				data-testid="keys-create-btn"
				onclick={openCreate}
				class="h-9 gap-1.5 px-3"
			>
				<Plus class="h-4 w-4" />
				{$_('user.keys.newKey', { default: 'New API Key' })}
			</Button>
		</div>
	</header>

	<!-- Filters -->
	<div class="flex flex-wrap items-center gap-3">
		<label class="text-sm text-muted-foreground" for="status-filter">
			{$_('user.keys.statusFilter', { default: 'State' })}
		</label>
		<NativeSelect
			id="status-filter"
			data-testid="keys-status-filter"
			bind:value={statusFilter}
			onchange={handleStatusChange}
			class="h-9"
		>
			<option value={STATUS_ALL}>{$_('user.keys.allStatus', { default: 'All statuses' })}</option>
			<option value="active">{statusLabel('active')}</option>
			<option value="inactive">{statusLabel('inactive')}</option>
			<option value="quota_exhausted">{statusLabel('quota_exhausted')}</option>
			<option value="expired">{statusLabel('expired')}</option>
		</NativeSelect>
	</div>

	<!-- Table -->
	{#if loading}
		<div class="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground" data-testid="keys-loading">
			{$_('user.keys.loading', { default: 'Loading...' })}
		</div>
	{:else if loadError && filteredKeys.length === 0}
		<Alert variant="destructive" class="p-8 text-center" data-testid="keys-error">
			<p class="text-sm font-medium text-destructive">
				{$_('user.keys.failedToLoad', { default: 'Failed to load API keys' })}
			</p>
			<p class="mt-1 text-xs text-muted-foreground">{loadError}</p>
			<Button
				variant="outline"
				size="sm"
				onclick={refreshList}
				class="mt-4"
			>
				{$_('user.keys.retry', { default: 'Retry' })}
			</Button>
		</Alert>
	{:else if filteredKeys.length === 0}
		<!-- Empty state -->
		<div
			class="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card p-12 text-center"
			data-testid="keys-empty-state"
		>
			<div class="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
				<KeyRound class="h-6 w-6" />
			</div>
			<div class="space-y-1">
				<h2 class="text-base font-semibold text-foreground">
					{$_('user.keys.emptyTitle', { default: 'No API keys' })}
				</h2>
				<p class="max-w-sm text-sm text-muted-foreground">
					{$_('user.keys.emptyDescription', {
						default: 'Create your first key to start making API calls.'
					})}
				</p>
			</div>
			<Button
				data-testid="keys-empty-create-btn"
				onclick={openCreate}
				class="mt-1 h-9 gap-1.5"
			>
				<Plus class="h-4 w-4" />
				{$_('user.keys.createFirstKey', { default: 'Create your first key' })}
			</Button>
		</div>
	{:else if useVirtual}
		<!-- Virtual table 路径（> 50 行） -->
		<div class="rounded-lg border border-border bg-card" data-testid="keys-virtual-wrap">
			<div class="grid grid-cols-[1.2fr_1.4fr_0.8fr_0.9fr_1fr_0.7fr_0.9fr_0.8fr] gap-3 border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
				<div>{$_('user.keys.colName', { default: 'Name' })}</div>
				<div>{$_('user.keys.colKey', { default: 'Key' })}</div>
				<div>{$_('user.keys.colGroup', { default: 'Group' })}</div>
				<div>{$_('user.keys.colUsage', { default: 'Usage' })}</div>
				<div>{$_('user.keys.colQuota', { default: 'Quota' })}</div>
				<div>{$_('user.keys.colStatus', { default: 'State' })}</div>
				<div>{$_('user.keys.colCreated', { default: 'Created' })}</div>
				<div class="text-right">{$_('user.keys.colActions', { default: 'Actions' })}</div>
			</div>
			<div class="h-[60vh]">
				<VirtualTable rows={filteredKeys} rowHeight={56} getRowKey={(r) => r.id}>
					{#snippet row({ row: k })}
						<div
							data-testid="keys-row"
							data-key-id={k.id}
							class="grid h-full grid-cols-[1.2fr_1.4fr_0.8fr_0.9fr_1fr_0.7fr_0.9fr_0.8fr] items-center gap-3 border-b border-border px-4 text-sm"
						>
							<div class="truncate font-medium text-foreground" title={k.name}>{k.name}</div>
							<div>
								<code class="rounded bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
									{maskKey(k)}
								</code>
							</div>
							<div>
								{#if k.group}
									<span class="truncate text-sm text-foreground">{k.group.name}</span>
								{:else}
									<span class="text-sm text-muted-foreground">-</span>
								{/if}
							</div>
							<div class="text-xs text-muted-foreground space-y-0.5">
								<div>{$_('user.keys.today', { default: 'Today' })}: <span class="font-mono tabular-nums text-foreground">${(k.usageToday ?? 0).toFixed(4)}</span></div>
								<div>{$_('user.keys.total', { default: 'Total' })}: <span class="font-mono tabular-nums text-foreground">${(k.usageTotal ?? 0).toFixed(4)}</span></div>
							</div>
							<div class="text-muted-foreground">{fmtQuota(k)}</div>
							<div>
								<Badge class={statusBadgeClass(k.status)}>
									{statusLabel(k.status)}
								</Badge>
							</div>
							<div class="truncate text-muted-foreground">{fmtDate(k.createdAt)}</div>
							<div class="flex justify-end gap-1">
								<Button
									variant="outline"
									size="icon"
									aria-label={k.status === 'active'
										? $_('user.keys.disableAria', { default: 'Disable key' })
										: $_('user.keys.enableAria', { default: 'Enable key' })}
									data-testid="keys-toggle-btn"
									onclick={() => handleToggleStatus(k)}
									disabled={toggling.has(k.id)}
									class="h-8 w-8 {k.status === 'active' ? 'text-emerald-600' : 'text-muted-foreground'}"
								>
									<Power class="h-3.5 w-3.5" />
								</Button>
								<Button
									variant="outline"
									size="icon"
									aria-label={$_('user.keys.editAria', { default: 'Edit key' })}
									data-testid="keys-edit-btn"
									onclick={() => openEdit(k)}
									class="h-8 w-8"
								>
									<Pencil class="h-3.5 w-3.5" />
								</Button>
								<Button
									variant="outline"
									size="icon"
									aria-label={$_('user.keys.revokeAria', { default: 'Revoke key' })}
									data-testid="keys-revoke-btn"
									data-key-id={k.id}
									onclick={() => openRevoke(k)}
									class="h-8 w-8 text-destructive hover:bg-destructive/10"
								>
									<Trash2 class="h-3.5 w-3.5" />
								</Button>
							</div>
						</div>
					{/snippet}
				</VirtualTable>
			</div>
		</div>
	{:else}
		<!-- 原生 table 路径 -->
		<div class="overflow-hidden rounded-lg border border-border bg-card" data-testid="keys-table-wrap">
			<table class="w-full text-sm" data-testid="keys-table">
				<thead>
					<tr class="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
						<th class="px-4 py-2 text-left font-medium">{$_('user.keys.colName', { default: 'Name' })}</th>
						<th class="px-4 py-2 text-left font-medium">{$_('user.keys.colKey', { default: 'Key' })}</th>
						<th class="px-4 py-2 text-left font-medium">{$_('user.keys.colGroup', { default: 'Group' })}</th>
						<th class="px-4 py-2 text-left font-medium">{$_('user.keys.colUsage', { default: 'Usage' })}</th>
						<th class="px-4 py-2 text-left font-medium">{$_('user.keys.colQuota', { default: 'Quota' })}</th>
						<th class="px-4 py-2 text-left font-medium">{$_('user.keys.colStatus', { default: 'State' })}</th>
						<th class="px-4 py-2 text-left font-medium">{$_('user.keys.colCreated', { default: 'Created' })}</th>
						<th class="px-4 py-2 text-right font-medium">{$_('user.keys.colActions', { default: 'Actions' })}</th>
					</tr>
				</thead>
				<tbody>
					{#each filteredKeys as k (k.id)}
						<tr
							data-testid="keys-row"
							data-key-id={k.id}
							class="border-b border-border last:border-b-0 hover:bg-accent/40"
						>
							<td class="px-4 py-3 font-medium text-foreground">
								<span class="block max-w-[180px] truncate" title={k.name}>{k.name}</span>
							</td>
							<td class="px-4 py-3">
								<code class="rounded bg-muted px-2 py-0.5 font-mono text-xs text-foreground">
									{maskKey(k)}
								</code>
							</td>
							<td class="px-4 py-3">
								{#if k.group}
									<span class="text-sm text-foreground">{k.group.name}</span>
								{:else}
									<span class="text-sm text-muted-foreground">-</span>
								{/if}
							</td>
							<td class="px-4 py-3">
								<div class="text-xs text-muted-foreground space-y-0.5">
									<div>{$_('user.keys.today', { default: 'Today' })}: <span class="font-mono tabular-nums text-foreground">${(k.usageToday ?? 0).toFixed(4)}</span></div>
									<div>{$_('user.keys.total', { default: 'Total' })}: <span class="font-mono tabular-nums text-foreground">${(k.usageTotal ?? 0).toFixed(4)}</span></div>
								</div>
							</td>
							<td class="px-4 py-3 text-muted-foreground">{fmtQuota(k)}</td>
							<td class="px-4 py-3">
								<Badge class={statusBadgeClass(k.status)}>
									{statusLabel(k.status)}
								</Badge>
							</td>
							<td class="px-4 py-3 text-muted-foreground">{fmtDate(k.createdAt)}</td>
							<td class="px-4 py-3 text-right">
								<div class="flex justify-end gap-1">
									<Button
										variant="outline"
										size="icon"
										aria-label={k.status === 'active'
											? $_('user.keys.disableAria', { default: 'Disable key' })
											: $_('user.keys.enableAria', { default: 'Enable key' })}
										data-testid="keys-toggle-btn"
										onclick={() => handleToggleStatus(k)}
										disabled={toggling.has(k.id)}
										class="h-8 w-8 {k.status === 'active' ? 'text-emerald-600' : 'text-muted-foreground'}"
									>
										<Power class="h-3.5 w-3.5" />
									</Button>
									<Button
										variant="outline"
										size="icon"
										aria-label={$_('user.keys.editAria', { default: 'Edit key' })}
										data-testid="keys-edit-btn"
										onclick={() => openEdit(k)}
										class="h-8 w-8"
									>
										<Pencil class="h-3.5 w-3.5" />
									</Button>
									<Button
										variant="outline"
										size="icon"
										aria-label={$_('user.keys.revokeAria', { default: 'Revoke key' })}
										data-testid="keys-revoke-btn"
										data-key-id={k.id}
										onclick={() => openRevoke(k)}
										class="h-8 w-8 text-destructive hover:bg-destructive/10"
									>
										<Trash2 class="h-3.5 w-3.5" />
									</Button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<CreateKeyDialog bind:open={createOpen} onCreated={handleCreated} />
<EditKeyDialog bind:open={editOpen} apiKey={editTarget} onUpdated={() => { editOpen = false; refreshList(); }} />
<RevokeKeyDialog bind:open={revokeOpen} apiKey={revokeTarget} onRevoked={handleRevoked} />
