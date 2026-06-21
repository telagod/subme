<script lang="ts">
	/**
	 * Admin · Monetization · Pricing Desk（POC 5 · 完整 port）
	 *
	 * Thin orchestrator — holds page-level state, data fetching, and derived
	 * computations. Visual sections are delegated to:
	 *   - PricingHeader   (title, summary, refresh/sync actions, toasts)
	 *   - PricingSyncBar   (filter bar + provider pill tabs)
	 *   - PricingTable     (virtual table with rows)
	 *   - ProviderVerifyDrawer (detail drawer with price override editing)
	 *
	 * 红线：
	 *   - 唯一 API 入口：modelCatalogApi（5 端点）。不引用后端 billing 计费 service / channel 路由。
	 *   - Select sentinel: 用 ALL_SENTINEL = '__all__'，禁止 value=""。
	 *   - drawer override-saved → re-fetch listModels。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import PricingHeader from '$lib/features/pricing/PricingHeader.svelte';
	import PricingSyncBar from '$lib/features/pricing/PricingSyncBar.svelte';
	import PricingTable from '$lib/features/pricing/PricingTable.svelte';
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
		lastSyncedText
	} from '$lib/utils/pricing';

	type SortKey =
		| 'alpha-asc'
		| 'input-asc'
		| 'input-desc'
		| 'output-asc'
		| 'output-desc'
		| 'context-desc';

	// ── Page-level state ──
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

	let nowMs = $state(Date.now());

	// ── Data fetching ──
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
			syncToastTimer = setTimeout(() => { syncToast = null; }, 3500);
			await fetchList();
		} catch (e) {
			loadError = e instanceof Error ? e.message : String(e);
		} finally {
			syncLoading = false;
		}
	}

	onMount(() => { void fetchList(); });

	// ── Drawer ──
	function openDetail(m: CatalogModelListItem) {
		drawerSlug = m.id;
		drawerModelName = m.name || m.id;
		drawerOpen = true;
	}

	function onOverrideSaved() { void fetchList(); }

	// ── Derived: mainstream providers ──
	interface ProviderEntry { tag: string; count: number; aliases: ReadonlyArray<string>; }

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

	interface ProviderTab { key: string; label: string; count: number; }

	const providerTabs = $derived.by<ProviderTab[]>(() => {
		const total = mainstreamProviders.reduce((acc, p) => acc + p.count, 0);
		const tabs: ProviderTab[] = [{
			key: ALL_SENTINEL,
			label: $_('admin.pricingList.providerTabs.all', { default: 'All' }),
			count: total
		}];
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
			case 'input-asc':  return list.sort((a, b) => priceOf(a, 'input') - priceOf(b, 'input'));
			case 'input-desc': return list.sort((a, b) => priceOf(b, 'input') - priceOf(a, 'input'));
			case 'output-asc':  return list.sort((a, b) => priceOf(a, 'output') - priceOf(b, 'output'));
			case 'output-desc': return list.sort((a, b) => priceOf(b, 'output') - priceOf(a, 'output'));
			case 'context-desc': return list.sort((a, b) => (b.context_len ?? 0) - (a.context_len ?? 0));
			case 'alpha-asc': default:
				return list.sort((a, b) =>
					(a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: 'base' })
				);
		}
	});

	const syncedText = $derived(
		lastSyncedText(lastUpdated, nowMs, (k, p) =>
			$_(k, {
				values: (p ?? {}) as Record<string, string | number | boolean | Date | null | undefined>
			})
		)
	);
</script>

<svelte:head>
	<title>{$_('admin.pricingList.title', { default: 'PayGo Pricing' })} · sub2api admin</title>
</svelte:head>

<section class="flex h-[calc(100vh-8rem)] flex-col gap-3" data-testid="pricing-page">
	<PricingHeader
		{visibleTotalCount}
		providerCount={mainstreamProviders.length}
		{syncedText}
		{loading}
		{syncLoading}
		{syncToast}
		{loadError}
		onRefresh={fetchList}
		onSync={handleSync}
	/>

	<PricingSyncBar
		bind:searchInput
		bind:sortKey
		bind:activeProvider
		bind:onlyOverridden
		{providerTabs}
		filteredCount={sortedModels.length}
		totalCount={visibleTotalCount}
	/>

	<PricingTable
		rows={sortedModels}
		{loading}
		{syncLoading}
		onRowClick={openDetail}
		onSync={handleSync}
	/>
</section>

<ProviderVerifyDrawer
	bind:open={drawerOpen}
	slug={drawerSlug}
	modelName={drawerModelName}
	on:override-saved={onOverrideSaved}
/>
