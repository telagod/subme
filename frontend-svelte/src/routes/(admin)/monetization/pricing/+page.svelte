<script lang="ts">
	/**
	 * Admin · Monetization · Pricing Desk（POC 5 · 完整 port）
	 *
	 * 与 Vue PricingModelListView.vue 对齐：
	 *   - Header: title + summary line + Refresh + Sync Catalog 双 actions
	 *   - Sync 成功 toast（3500ms 自动消失）
	 *   - Filter bar: search input + sort Select + only-overridden switch
	 *   - Provider pill tabs（白名单声明顺序 + ALL_SENTINEL 在前）
	 *   - VirtualTable rendering sortedModels —— Model / Provider / Input $/M /
	 *     Output $/M / Cache Read / Context / Source 七列
	 *   - 行点击（button role）打开 ProviderVerifyDrawer
	 *   - empty / loading / error 三状态
	 *
	 * 红线：
	 *   - 唯一 API 入口：modelCatalogApi（5 端点）。不引用后端 billing 计费 service / channel 路由。
	 *   - Select sentinel: 用 ALL_SENTINEL = '__all__'，禁止 value=""。
	 *   - drawer override-saved → re-fetch listModels。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import {
		RefreshCw,
		CloudDownload,
		Search,
		PackageSearch,
		SquarePen,
		AlertCircle
	} from '@lucide/svelte';
	import VirtualTable from '$lib/ui/table/VirtualTable.svelte';
	import ProviderVerifyDrawer from '$lib/features/pricing/ProviderVerifyDrawer.svelte';
	import {
		modelCatalogApi,
		type CatalogModelListItem
	} from '$lib/api/admin/modelCatalog';
	import {
		MAINSTREAM_PROVIDER_WHITELIST,
		ALL_SENTINEL,
		extractProvider,
		prettifyProvider,
		fmtPriceMTok,
		fmtCtx,
		sourceLabel,
		lastSyncedText
	} from '$lib/utils/pricing';

	type SortKey =
		| 'alpha-asc'
		| 'input-asc'
		| 'input-desc'
		| 'output-asc'
		| 'output-desc'
		| 'context-desc';

	let allModels = $state<CatalogModelListItem[]>([]);
	let lastUpdated = $state<string>('');
	let loading = $state(false);
	let loadError = $state<string | null>(null);

	let searchInput = $state('');
	let activeProvider = $state<string>(ALL_SENTINEL);
	let sortKey = $state<SortKey>('alpha-asc');
	let onlyOverridden = $state(false);

	let syncLoading = $state(false);
	let syncToast = $state<number | null>(null);
	let syncToastTimer: ReturnType<typeof setTimeout> | null = null;

	let drawerOpen = $state(false);
	let drawerSlug = $state<string | null>(null);
	let drawerModelName = $state<string | null>(null);

	// 用于 lastSyncedText 派生时间刷新
	let nowMs = $state(Date.now());

	async function fetchList() {
		loading = true;
		loadError = null;
		try {
			const resp = await modelCatalogApi.listModels();
			allModels = resp.models ?? [];
			lastUpdated = resp.last_updated ?? '';
			nowMs = Date.now();
		} catch (e) {
			loadError = e instanceof Error ? e.message : String(e);
			allModels = [];
		} finally {
			loading = false;
		}
	}

	async function handleSync() {
		if (syncLoading) return;
		syncLoading = true;
		try {
			const result = await modelCatalogApi.syncCatalog();
			syncToast = result.synced;
			if (syncToastTimer) clearTimeout(syncToastTimer);
			syncToastTimer = setTimeout(() => {
				syncToast = null;
			}, 3500);
			await fetchList();
		} catch (e) {
			loadError = e instanceof Error ? e.message : String(e);
		} finally {
			syncLoading = false;
		}
	}

	onMount(() => {
		void fetchList();
	});

	function openDetail(m: CatalogModelListItem) {
		drawerSlug = m.id;
		drawerModelName = m.name || m.id;
		drawerOpen = true;
	}

	function handleRowKey(e: KeyboardEvent, m: CatalogModelListItem) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			openDetail(m);
		}
	}

	function onOverrideSaved() {
		void fetchList();
	}

	// ── 派生：mainstream providers 聚合（白名单顺序 + alias 合并） ──
	interface ProviderEntry {
		tag: string;
		count: number;
		aliases: ReadonlyArray<string>;
	}

	const mainstreamProviders = $derived.by<ProviderEntry[]>(() => {
		const counts = new Map<string, number>();
		for (const m of allModels) {
			const raw = extractProvider(m.id);
			if (!raw) continue;
			counts.set(raw.toLowerCase().trim(), (counts.get(raw.toLowerCase().trim()) ?? 0) + 1);
		}
		const out: ProviderEntry[] = [];
		for (const wl of MAINSTREAM_PROVIDER_WHITELIST) {
			const aliases = wl.aliases.map((a) => a.toLowerCase().trim());
			let count = 0;
			for (const a of aliases) count += counts.get(a) ?? 0;
			if (count > 0) out.push({ tag: wl.tag, count, aliases });
		}
		return out;
	});

	const mainstreamTagSet = $derived.by<Set<string>>(() => {
		const s = new Set<string>();
		for (const p of mainstreamProviders) for (const a of p.aliases) s.add(a);
		return s;
	});

	const activeAliasSet = $derived.by<Set<string> | null>(() => {
		if (activeProvider === ALL_SENTINEL) return null;
		const e = mainstreamProviders.find((p) => p.tag === activeProvider);
		return e ? new Set(e.aliases) : null;
	});

	interface ProviderTab {
		key: string;
		label: string;
		count: number;
	}

	const providerTabs = $derived.by<ProviderTab[]>(() => {
		const total = mainstreamProviders.reduce((acc, p) => acc + p.count, 0);
		const tabs: ProviderTab[] = [
			{
				key: ALL_SENTINEL,
				label: $_('admin.pricingList.providerTabs.all', { default: 'All' }),
				count: total
			}
		];
		for (const p of mainstreamProviders) {
			tabs.push({ key: p.tag, label: prettifyProvider(p.tag), count: p.count });
		}
		return tabs;
	});

	const filteredModels = $derived.by<CatalogModelListItem[]>(() => {
		const q = searchInput.trim().toLowerCase();
		const tagSet = mainstreamTagSet;
		const aliasSet = activeAliasSet;
		return allModels.filter((m) => {
			const provKey = extractProvider(m.id).toLowerCase().trim();
			if (!provKey || !tagSet.has(provKey)) return false;
			if (aliasSet && !aliasSet.has(provKey)) return false;
			if (onlyOverridden && !m.has_override) return false;
			if (q) {
				const id = m.id.toLowerCase();
				const name = (m.name || '').toLowerCase();
				if (!id.includes(q) && !name.includes(q)) return false;
			}
			return true;
		});
	});

	const visibleTotalCount = $derived.by(() => {
		const tagSet = mainstreamTagSet;
		return allModels.reduce((acc, m) => {
			const key = extractProvider(m.id).toLowerCase().trim();
			return key && tagSet.has(key) ? acc + 1 : acc;
		}, 0);
	});

	function priceOf(m: CatalogModelListItem, kind: 'input' | 'output'): number {
		const b = m.baseline;
		if (!b) return Number.POSITIVE_INFINITY;
		const v = kind === 'input' ? b.input : b.output;
		return v && v > 0 ? v : Number.POSITIVE_INFINITY;
	}

	const sortedModels = $derived.by<CatalogModelListItem[]>(() => {
		const list = [...filteredModels];
		switch (sortKey) {
			case 'input-asc':
				return list.sort((a, b) => priceOf(a, 'input') - priceOf(b, 'input'));
			case 'input-desc':
				return list.sort((a, b) => priceOf(b, 'input') - priceOf(a, 'input'));
			case 'output-asc':
				return list.sort((a, b) => priceOf(a, 'output') - priceOf(b, 'output'));
			case 'output-desc':
				return list.sort((a, b) => priceOf(b, 'output') - priceOf(a, 'output'));
			case 'context-desc':
				return list.sort((a, b) => (b.context_len ?? 0) - (a.context_len ?? 0));
			case 'alpha-asc':
			default:
				return list.sort((a, b) =>
					(a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: 'base' })
				);
		}
	});

	const syncedText = $derived(
		lastSyncedText(lastUpdated, nowMs, (k, p) =>
			// svelte-i18n InterpolationValues 是 Record<string, string|number|boolean|Date|...>
			// 这里来源是 lastSyncedText 内部传的 { n: number }，cast 一次安全。
			$_(k, {
				values: (p ?? {}) as Record<
					string,
					string | number | boolean | Date | null | undefined
				>
			})
		)
	);
</script>

<svelte:head>
	<title>{$_('admin.pricingList.title', { default: 'PayGo Pricing' })} · sub2api admin</title>
</svelte:head>

<section class="flex h-[calc(100vh-8rem)] flex-col gap-3" data-testid="pricing-page">
	<!-- Header -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-2xl font-semibold tracking-tight">
				{$_('admin.pricingList.title', { default: 'PayGo Pricing' })}
			</h1>
			<p class="text-sm text-muted-foreground">
				{$_('admin.pricingList.subtitle', { default: 'OpenRouter pricing catalog' })}
			</p>
			<div class="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
				<span data-testid="pricing-summary">
					{$_('admin.pricingList.mainstreamSummary', {
						values: { models: visibleTotalCount, providers: mainstreamProviders.length },
						default: '{models} models · {providers} providers'
					})}
				</span>
				<span>·</span>
				<span>{$_('admin.pricingList.sourceHint', { default: 'Source: OpenRouter + LiteLLM' })}</span>
				{#if syncedText}
					<span>·</span>
					<span>
						{$_('admin.pricingList.lastSynced', {
							values: { time: syncedText },
							default: 'last synced {time}'
						})}
					</span>
				{/if}
			</div>
		</div>
		<div class="flex items-center gap-2">
			<button
				type="button"
				class="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
				onclick={fetchList}
				disabled={loading}
				data-testid="pricing-refresh"
			>
				<RefreshCw class="h-3.5 w-3.5 {loading ? 'animate-spin' : ''}" />
				{$_('admin.pricingList.refresh', { default: 'Refresh' })}
			</button>
			<button
				type="button"
				class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
				onclick={handleSync}
				disabled={syncLoading}
				data-testid="pricing-sync"
			>
				<CloudDownload class="h-3.5 w-3.5 {syncLoading ? 'animate-spin' : ''}" />
				{$_('admin.pricingList.syncCatalog', { default: 'Sync catalog' })}
			</button>
		</div>
	</div>

	<!-- Sync success toast -->
	{#if syncToast != null}
		<div
			class="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary"
			data-testid="pricing-sync-toast"
		>
			{$_('admin.pricingList.syncSuccess', {
				values: { n: syncToast },
				default: '{n} models synced'
			})}
		</div>
	{/if}

	{#if loadError}
		<div
			class="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
			data-testid="pricing-error"
		>
			<AlertCircle class="h-4 w-4" />
			<span>{$_('admin.pricingList.loadFailed', { default: 'Load failed: ' })}{loadError}</span>
			<button
				type="button"
				class="ml-auto rounded border px-2 py-0.5 text-xs"
				onclick={fetchList}
			>
				{$_('admin.providerVerify.retry', { default: 'Retry' })}
			</button>
		</div>
	{/if}

	<!-- Filter bar -->
	<div
		class="flex flex-wrap items-center gap-2 rounded-md border bg-card p-2"
		data-testid="pricing-filters"
	>
		<div class="relative">
			<Search class="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
			<input
				type="search"
				class="h-8 w-56 rounded-md border bg-background pl-7 pr-2 text-sm outline-none focus:ring-1 focus:ring-primary"
				placeholder={$_('admin.pricingList.search.placeholder', {
					default: 'Search by model id or name…'
				})}
				bind:value={searchInput}
				data-testid="pricing-search"
			/>
		</div>

		<label class="ml-1 text-xs text-muted-foreground" for="pricing-sort">
			{$_('admin.pricingList.sort.label', { default: 'Sort' })}
		</label>
		<!--
			Sort Select — uses enum values directly. Memory `reshadcn-migration`:
			NO value="" allowed; every option has a real business value.
		-->
		<select
			id="pricing-sort"
			class="h-8 rounded-md border bg-background px-2 text-sm outline-none"
			bind:value={sortKey}
			data-testid="pricing-sort"
		>
			<option value="alpha-asc">
				{$_('admin.pricingList.sort.alphaAsc', { default: 'Model A-Z' })}
			</option>
			<option value="input-asc">
				{$_('admin.pricingList.sort.inputAsc', { default: 'Input price asc' })}
			</option>
			<option value="input-desc">
				{$_('admin.pricingList.sort.inputDesc', { default: 'Input price desc' })}
			</option>
			<option value="output-asc">
				{$_('admin.pricingList.sort.outputAsc', { default: 'Output price asc' })}
			</option>
			<option value="output-desc">
				{$_('admin.pricingList.sort.outputDesc', { default: 'Output price desc' })}
			</option>
			<option value="context-desc">
				{$_('admin.pricingList.sort.contextDesc', { default: 'Context window desc' })}
			</option>
		</select>

		<!--
			Provider filter Select — kept for accessibility / test contract.
			Sentinel: ALL_SENTINEL '__all__'. Pill tabs below are the primary UI;
			this Select exists for screen reader / keyboard fallback.
		-->
		<label class="ml-2 text-xs text-muted-foreground" for="pricing-provider-filter">
			{$_('admin.pricingList.provider.label', { default: 'Provider' })}
		</label>
		<select
			id="pricing-provider-filter"
			class="h-8 rounded-md border bg-background px-2 text-sm outline-none"
			bind:value={activeProvider}
			data-testid="pricing-provider-filter"
		>
			<option value={ALL_SENTINEL}>
				{$_('admin.pricingList.provider.allOption', { default: 'All providers' })}
			</option>
			{#each providerTabs.slice(1) as t (t.key)}
				<option value={t.key}>{t.label}</option>
			{/each}
		</select>

		<!-- only-overridden switch (native checkbox) -->
		<label class="ml-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
			<input
				type="checkbox"
				class="h-3.5 w-3.5 accent-primary"
				bind:checked={onlyOverridden}
				data-testid="pricing-only-overridden"
			/>
			{$_('admin.pricingList.onlyOverridden', { default: 'Only overridden' })}
		</label>

		<div class="ml-auto text-xs text-muted-foreground tabular-nums">
			{sortedModels.length} / {visibleTotalCount}
		</div>
	</div>

	<!-- Provider pill tabs -->
	<div class="flex flex-wrap gap-1.5" data-testid="pricing-provider-tabs">
		{#each providerTabs as t (t.key)}
			<button
				type="button"
				class="pill"
				class:pill-active={activeProvider === t.key}
				onclick={() => (activeProvider = t.key)}
				data-testid="pricing-provider-pill"
				data-pill-key={t.key}
			>
				<span>{t.label}</span>
				<span class="ml-1 tabular-nums opacity-75">{t.count}</span>
			</button>
		{/each}
	</div>

	<!-- Table -->
	<div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-card">
		<VirtualTable
			rows={sortedModels}
			rowHeight={56}
			overscan={8}
			{loading}
			getRowKey={(r) => r.id}
		>
			{#snippet header()}
				<div class="pricing-row pricing-head">
					<div>{$_('admin.pricingList.columns.model', { default: 'Model' })}</div>
					<div>{$_('admin.pricingList.columns.provider', { default: 'Provider' })}</div>
					<div class="text-right">
						{$_('admin.pricingList.columns.input', { default: 'Input' })}
					</div>
					<div class="text-right">
						{$_('admin.pricingList.columns.output', { default: 'Output' })}
					</div>
					<div class="text-right">
						{$_('admin.pricingList.columns.cacheRead', { default: 'Cache Read' })}
					</div>
					<div class="text-right">
						{$_('admin.pricingList.columns.context', { default: 'Context' })}
					</div>
					<div>{$_('admin.pricingList.columns.source', { default: 'Source' })}</div>
				</div>
			{/snippet}

			{#snippet row({ row: m })}
				<div
					class="pricing-row pricing-body"
					role="button"
					tabindex="0"
					data-testid="pricing-row"
					data-model-id={m.id}
					onclick={() => openDetail(m)}
					onkeydown={(e) => handleRowKey(e, m)}
				>
					<div class="min-w-0">
						<div class="flex items-center gap-1 truncate text-sm font-medium">
							<span class="truncate">{m.name}</span>
							{#if m.has_override}
								<SquarePen
									class="h-3 w-3 flex-shrink-0 text-amber-600"
									data-testid="pricing-override-badge"
								/>
							{/if}
						</div>
						<div class="truncate font-mono text-[10px] text-muted-foreground">{m.id}</div>
					</div>
					<div class="text-xs">
						<span
							class="inline-flex items-center rounded border bg-background px-1.5 py-0.5 font-mono uppercase"
						>
							{extractProvider(m.id) || '—'}
						</span>
					</div>
					<div class="text-right text-sm tabular-nums">{fmtPriceMTok(m.baseline?.input)}</div>
					<div class="text-right text-sm tabular-nums">{fmtPriceMTok(m.baseline?.output)}</div>
					<div class="text-right text-sm tabular-nums text-muted-foreground">
						{fmtPriceMTok(m.baseline?.cache_read)}
					</div>
					<div class="text-right text-sm tabular-nums text-muted-foreground">
						{fmtCtx(m.context_len)}
					</div>
					<div class="text-xs">
						<span
							class="inline-flex items-center rounded border bg-background px-1.5 py-0.5 font-mono uppercase"
						>
							{sourceLabel(m.baseline?.source)}
						</span>
					</div>
				</div>
			{/snippet}

			{#snippet empty()}
				<div
					class="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground"
					data-testid="pricing-empty"
				>
					<PackageSearch class="h-8 w-8 opacity-30" />
					<div>{$_('admin.pricingList.empty.title', { default: 'No models in catalog' })}</div>
					<div class="text-xs">
						{$_('admin.pricingList.empty.hint', { default: 'Sync to pull latest models' })}
					</div>
					<button
						type="button"
						class="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
						onclick={handleSync}
						disabled={syncLoading}
						data-testid="pricing-empty-sync"
					>
						<CloudDownload class="h-3.5 w-3.5 {syncLoading ? 'animate-spin' : ''}" />
						{$_('admin.pricingList.empty.action', { default: 'Sync catalog' })}
					</button>
				</div>
			{/snippet}

			{#snippet loadingSlot()}
				<div class="space-y-2 p-3" data-testid="pricing-loading">
					{#each Array(6) as _, i (i)}
						<div class="h-10 w-full animate-pulse rounded bg-muted"></div>
					{/each}
				</div>
			{/snippet}
		</VirtualTable>
	</div>
</section>

<ProviderVerifyDrawer
	bind:open={drawerOpen}
	slug={drawerSlug}
	modelName={drawerModelName}
	on:override-saved={onOverrideSaved}
/>

<style>
	.pricing-row {
		display: grid;
		grid-template-columns: minmax(0, 2.4fr) 0.9fr 0.9fr 0.9fr 0.9fr 0.8fr 0.9fr;
		gap: 0.5rem;
		align-items: center;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid hsl(var(--border));
		min-height: var(--row-h, 56px);
	}
	:global([data-density='compact']) .pricing-row {
		--row-h: 36px;
	}
	.pricing-head {
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: hsl(var(--muted-foreground));
		background-color: hsl(var(--card));
	}
	.pricing-body {
		cursor: pointer;
		transition: background-color 0.12s;
	}
	.pricing-body:hover {
		background-color: hsl(var(--muted) / 0.4);
	}
	.pricing-body:focus-visible {
		outline: 2px solid hsl(var(--primary) / 0.5);
		outline-offset: -2px;
	}
	.pill {
		display: inline-flex;
		align-items: center;
		height: 26px;
		padding: 0 0.625rem;
		border-radius: 9999px;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--secondary));
		color: hsl(var(--secondary-foreground));
		font-size: 11.5px;
		line-height: 1;
		font-weight: 500;
		cursor: pointer;
		transition:
			background-color 0.15s,
			color 0.15s,
			border-color 0.15s;
		white-space: nowrap;
	}
	.pill:hover {
		background: hsl(var(--muted));
	}
	.pill-active {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border-color: hsl(var(--primary));
	}
	.pill-active:hover {
		background: hsl(var(--primary) / 0.9);
	}
</style>
