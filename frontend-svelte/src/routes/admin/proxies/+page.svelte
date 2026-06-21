<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { AlertTriangle, ChevronLeft, ChevronRight, Network, Plus, RefreshCw, Search, Wifi } from '@lucide/svelte';
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
		import {
			batchCreateProxies,
			batchDeleteProxies,
			checkProxyQuality,
			createProxy,
			deleteProxy,
			exportProxyData,
			importProxyData,
			listAllProxies,
			listProxyAccounts,
			listProxies,
			testProxy,
		updateProxy,
		updateProxyStatus,
			type Proxy,
			type ProxyAccountSummary,
			type ProxyQualityCheckResult,
			type ProxyTestResult,
			type SaveProxyPayload
		} from '$lib/api/admin/proxies';
	import { showError, showSuccess, showInfo } from '$lib/stores/toast.svelte';
	import { ALL, PAGE_SIZE, formatProxyLabel, proxyAccountCount, statusTone, summarizeProxies } from '$lib/features/supply/supply';

	const PROTOCOL_OPTIONS = ['http', 'https', 'socks5', 'socks5h'];
	const protocolOptions = $derived([
		{ value: ALL, label: 'All protocols' },
		...PROTOCOL_OPTIONS.map((value) => ({ value, label: value }))
	]);
	const formProtocolOptions = $derived(PROTOCOL_OPTIONS.map((value) => ({ value, label: value })));
	const statusOptions = [
		{ value: ALL, label: 'All statuses' },
		{ value: 'active', label: 'active' },
		{ value: 'inactive', label: 'inactive' },
		{ value: 'expired', label: 'expired' }
	];
	const formStatusOptions = [
		{ value: 'active', label: 'active' },
		{ value: 'inactive', label: 'inactive' }
	];
	const fallbackModeOptions = [
		{ value: 'none', label: 'No fallback' },
		{ value: 'proxy', label: 'Backup proxy' },
		{ value: 'direct', label: 'Direct connection' }
	];
	type ProxyBatchParseResult = {
		mode: 'empty' | 'json' | 'url';
		total: number;
		valid: number;
		invalid: number;
		duplicate: number;
		proxies: SaveProxyPayload[];
		error?: string;
	};
	type ProxyBatchScope = 'selected' | 'all';

	let rows = $state<Proxy[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let saving = $state(false);
	let loadError = $state<string | null>(null);
	let page = $state(1);
	let searchInput = $state('');
	let protocolFilter = $state(ALL);
		let statusFilter = $state(ALL);
		let selectedIds = $state<Set<number>>(new Set());
		let dialogOpen = $state(false);
		let editing = $state<Proxy | null>(null);
			let dataOpen = $state(false);
			let dataJson = $state('');
			let dataFileName = $state('');
			let dataImportResult = $state<Record<string, unknown> | null>(null);
			let batchJson = $state('socks5://127.0.0.1:1080\nhttp://user:pass@192.0.2.10:8080');
			let batchParse = $state<ProxyBatchParseResult>({
				mode: 'empty',
				total: 0,
				valid: 0,
				invalid: 0,
				duplicate: 0,
				proxies: []
			});
			let dataBusy = $state(false);
			let lastQualityResult = $state<string | null>(null);
			let batchActionResult = $state<string | null>(null);
			let qualityDialogOpen = $state(false);
			let qualitySubject = $state<Proxy | null>(null);
			let qualityReport = $state<ProxyQualityCheckResult | null>(null);
			let deleteDialogOpen = $state(false);
		let deleteMode = $state<'single' | 'selected'>('selected');
		let deleteTarget = $state<Proxy | null>(null);
		let accountsOpen = $state(false);
	let accountsLoading = $state(false);
	let accountsSubject = $state<Proxy | null>(null);
	let accounts = $state<ProxyAccountSummary[]>([]);
	let form = $state<SaveProxyPayload>({
		name: '',
		protocol: 'socks5',
		host: '',
		port: 1080,
		username: '',
		password: '',
		status: 'active',
		fallback_mode: 'none',
		backup_proxy_id: null,
		expiry_warn_days: null
	});
	let formExpiresAt = $state('');

		const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
		const summary = $derived(summarizeProxies(rows));
		const allPageSelected = $derived(rows.length > 0 && rows.every((row) => selectedIds.has(row.id)));
		let formProtocol = $state('socks5');
		let formStatus = $state('active');
		let formFallbackMode = $state('none');

	async function loadRows() {
		loading = true;
		loadError = null;
		try {
			const resp = await listProxies(page, PAGE_SIZE, {
				...currentFilters()
				});
				rows = resp.items;
				total = resp.total;
				const present = new Set(rows.map((row) => row.id));
				selectedIds = new Set([...selectedIds].filter((id) => present.has(id)));
			} catch (err) {
				loadError = err instanceof Error ? err.message : String(err);
			rows = [];
			total = 0;
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void loadRows();
	});

	function applyFilters() {
		page = 1;
			void loadRows();
		}

		function toggleOne(id: number) {
			const next = new Set(selectedIds);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			selectedIds = next;
		}

		function togglePageSelection() {
			if (allPageSelected) {
				const next = new Set(selectedIds);
				for (const row of rows) next.delete(row.id);
				selectedIds = next;
				return;
			}
			selectedIds = new Set([...selectedIds, ...rows.map((row) => row.id)]);
		}

		function selectedArray(): number[] {
			return [...selectedIds];
		}

		function currentFilters() {
			return {
				protocol: protocolFilter === ALL ? undefined : protocolFilter,
				status: statusFilter === ALL ? undefined : statusFilter,
				search: searchInput.trim() || undefined,
				sort_by: 'created_at',
				sort_order: 'desc' as const
			};
		}

		function downloadJson(filename: string, payload: string) {
			if (typeof document === 'undefined') return;
			const blob = new Blob([payload], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = filename;
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
		}

		async function readFileAsText(file: File): Promise<string> {
			if (typeof file.text === 'function') return file.text();
			const buffer = await file.arrayBuffer();
			return new TextDecoder().decode(buffer);
		}

		function importResultSummary(result: Record<string, unknown> | null): string {
			if (!result) return '';
			const created = result.proxy_created ?? result.created ?? result.imported ?? 0;
			const reused = result.proxy_reused ?? result.reused ?? 0;
			const failed = result.proxy_failed ?? result.failed ?? 0;
			return `Created ${created} · reused ${reused} · failed ${failed}`;
		}

		function importResultErrors(result: Record<string, unknown> | null): string[] {
			if (!result) return [];
			const source = result.errors ?? result.proxy_errors ?? result.failures;
			if (!Array.isArray(source)) return [];
			return source.map((item) => {
				if (typeof item === 'string') return item;
				if (item && typeof item === 'object') {
					const row = item as Record<string, unknown>;
					return String(row.error ?? row.message ?? row.reason ?? JSON.stringify(row));
				}
				return String(item);
			});
		}

		function qualityScoreText(result: ProxyQualityCheckResult | null): string {
			return typeof result?.score === 'number' ? String(result.score) : '-';
		}

		function qualityMessage(result: ProxyQualityCheckResult | null): string {
			if (!result) return '-';
			const summary = result.summary;
			if (typeof summary === 'string' && summary.trim()) return summary;
			if (typeof result.message === 'string' && result.message.trim()) return result.message;
			return result.success ? 'Quality check passed' : 'Quality check failed';
		}

		function qualityDetailRows(result: ProxyQualityCheckResult | null): Array<Record<string, unknown>> {
			if (!result) return [];
			if (Array.isArray(result.items)) return result.items as Array<Record<string, unknown>>;
			if (Array.isArray(result.results)) return result.results;
			return [];
		}

		function detailText(value: unknown, fallback = '-'): string {
			if (value === null || value === undefined || value === '') return fallback;
			return String(value);
		}

		function formatLatency(value: unknown): string {
			return typeof value === 'number' ? `${value}ms` : '-';
		}

		function testResultText(proxy: Proxy, result: ProxyTestResult): string {
			const latency = typeof result.latency_ms === 'number' ? ` · ${result.latency_ms}ms` : '';
			return `${proxy.name}: ${result.success ? 'OK' : 'failed'}${latency}${result.message ? ` · ${result.message}` : ''}`;
		}

		function proxyNoun(count: number): string {
			return count === 1 ? 'proxy' : 'proxies';
		}

		function batchDeleteCount(result: Awaited<ReturnType<typeof batchDeleteProxies>>, fallback: number): number {
			const record = result as unknown as Record<string, unknown>;
			if (Array.isArray(result.deleted_ids)) return result.deleted_ids.length;
			for (const key of ['deleted', 'deleted_count', 'count', 'success']) {
				const value = record[key];
				if (typeof value === 'number') return value;
			}
			return fallback;
		}

		function batchSkipCount(result: Awaited<ReturnType<typeof batchDeleteProxies>>): number {
			const skipped = (result as unknown as Record<string, unknown>).skipped;
			if (Array.isArray(skipped)) return skipped.length;
			return typeof skipped === 'number' ? skipped : 0;
		}

		async function batchTargetRows(scope: ProxyBatchScope): Promise<Proxy[]> {
			if (scope === 'all') return listAllProxies();
			return rows.filter((row) => selectedIds.has(row.id));
		}

		function emptyBatchParse(): ProxyBatchParseResult {
			return {
				mode: 'empty',
				total: 0,
				valid: 0,
				invalid: 0,
				duplicate: 0,
				proxies: []
			};
		}

		function parseProxyUrlLine(line: string): SaveProxyPayload | null {
			const trimmed = line.trim();
			if (!trimmed) return null;
			try {
				const parsed = new URL(trimmed);
				const protocol = parsed.protocol.replace(':', '').toLowerCase();
				if (!PROTOCOL_OPTIONS.includes(protocol)) return null;
				const port = Number(parsed.port);
				if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
				const host = parsed.hostname.replace(/^\[(.*)\]$/, '$1');
				if (!host) return null;
				return {
					name: `${protocol}-${host}-${port}`,
					protocol,
					host,
					port,
					username: parsed.username ? decodeURIComponent(parsed.username) : '',
					password: parsed.password ? decodeURIComponent(parsed.password) : '',
					status: 'active'
				};
			} catch {
				return null;
			}
		}

		function parseProxyUrlBatch(value: string): ProxyBatchParseResult {
			const lines = value
				.split('\n')
				.map((line) => line.trim())
				.filter(Boolean);
			if (lines.length === 0) return emptyBatchParse();
			const seen = new Set<string>();
			const proxies: SaveProxyPayload[] = [];
			let invalid = 0;
			let duplicate = 0;
			for (const line of lines) {
				const proxy = parseProxyUrlLine(line);
				if (!proxy) {
					invalid += 1;
					continue;
				}
				const key = `${proxy.protocol}:${proxy.host}:${proxy.port}:${proxy.username ?? ''}:${proxy.password ?? ''}`;
				if (seen.has(key)) {
					duplicate += 1;
					continue;
				}
				seen.add(key);
				proxies.push(proxy);
			}
			return {
				mode: 'url',
				total: lines.length,
				valid: proxies.length,
				invalid,
				duplicate,
				proxies
			};
		}

		function parseProxyBatch(value: string): ProxyBatchParseResult {
			const trimmed = value.trim();
			if (!trimmed) return emptyBatchParse();
			if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
				try {
					const parsed = JSON.parse(trimmed);
					const proxies = Array.isArray(parsed) ? parsed : parsed.proxies;
					if (!Array.isArray(proxies)) {
						return { ...emptyBatchParse(), mode: 'json', error: 'Batch JSON must be an array or { proxies: [] }' };
					}
					return {
						mode: 'json',
						total: proxies.length,
						valid: proxies.length,
						invalid: 0,
						duplicate: 0,
						proxies
					};
				} catch (err) {
					return {
						...emptyBatchParse(),
						mode: 'json',
						total: 1,
						invalid: 1,
						error: err instanceof Error ? err.message : String(err)
					};
				}
			}
			return parseProxyUrlBatch(trimmed);
		}

		function refreshBatchParse() {
			batchParse = parseProxyBatch(batchJson);
		}

	function openCreate() {
		editing = null;
		form = {
			name: '',
			protocol: protocolFilter === ALL ? 'socks5' : protocolFilter,
			host: '',
			port: protocolFilter === 'http' || protocolFilter === 'https' ? 8080 : 1080,
			username: '',
			password: '',
			status: 'active',
			fallback_mode: 'none',
			backup_proxy_id: null,
			expiry_warn_days: null
		};
		formProtocol = form.protocol ?? 'socks5';
		formStatus = form.status ?? 'active';
		formFallbackMode = form.fallback_mode ?? 'none';
		formExpiresAt = '';
		dialogOpen = true;
	}

	function openEdit(proxy: Proxy) {
		editing = proxy;
		form = {
			name: proxy.name,
			protocol: proxy.protocol,
			host: proxy.host,
			port: proxy.port,
			username: proxy.username ?? '',
			password: '',
			status: proxy.status,
			expires_at: null,
			fallback_mode: proxy.fallback_mode ?? 'none',
			backup_proxy_id: proxy.backup_proxy_id ?? null,
			expiry_warn_days: proxy.expiry_warn_days ?? null
		};
		formProtocol = form.protocol ?? 'socks5';
		formStatus = form.status ?? 'active';
		formFallbackMode = form.fallback_mode ?? 'none';
		formExpiresAt = proxy.expires_at ? proxy.expires_at.slice(0, 10) : '';
		dialogOpen = true;
	}

	function expiryUnixSeconds(date: string): number | null {
		if (!date) return null;
		const ms = new Date(`${date}T00:00:00Z`).getTime();
		return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
	}

	function optionalPositiveInteger(value: unknown): number | null {
		if (value === null || value === undefined || value === '') return null;
		const parsed = Number(value);
		return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
	}

	function buildProxyPayload(): SaveProxyPayload {
		const fallbackMode = formFallbackMode === 'proxy' || formFallbackMode === 'direct' ? formFallbackMode : 'none';
		return {
			...form,
			protocol: formProtocol,
			status: formStatus,
			port: Number(form.port),
			expires_at: expiryUnixSeconds(formExpiresAt),
			fallback_mode: fallbackMode,
			backup_proxy_id: fallbackMode === 'proxy' ? optionalPositiveInteger(form.backup_proxy_id) : null,
			expiry_warn_days: optionalPositiveInteger(form.expiry_warn_days)
		};
	}

	async function saveProxy() {
		if (!form.name.trim() || !form.host.trim()) return;
		saving = true;
		try {
			const payload = buildProxyPayload();
			if (!payload.password) delete payload.password;
			if (editing) await updateProxy(editing.id, payload);
			else await createProxy(payload);
			showSuccess(editing ? 'Proxy updated' : 'Proxy created');
			dialogOpen = false;
			await loadRows();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			saving = false;
		}
	}

	function openDeleteProxyDialog(proxy: Proxy) {
		deleteMode = 'single';
		deleteTarget = proxy;
		deleteDialogOpen = true;
	}

	function openDeleteSelectedDialog() {
		if (selectedIds.size === 0) return;
		deleteMode = 'selected';
		deleteTarget = null;
		deleteDialogOpen = true;
	}

	async function confirmDeleteProxy() {
		saving = true;
		try {
			if (deleteMode === 'single' && deleteTarget) {
				await deleteProxy(deleteTarget.id);
				const message = `Deleted proxy "${deleteTarget.name}"`;
				batchActionResult = message;
				lastQualityResult = null;
				showSuccess('Proxy deleted');
			} else {
				const ids = selectedArray();
				if (ids.length === 0) return;
				const result = await batchDeleteProxies(ids);
				const deleted = batchDeleteCount(result, ids.length);
				const skipped = batchSkipCount(result);
				const skippedText = skipped > 0 ? ` · skipped ${skipped}` : '';
				const message = `Deleted ${deleted} selected ${proxyNoun(deleted)}${skippedText}`;
				batchActionResult = message;
				lastQualityResult = null;
				selectedIds = new Set();
				showSuccess(message);
			}
			deleteDialogOpen = false;
			deleteTarget = null;
			await loadRows();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			saving = false;
		}
	}

	async function runTest(proxy: Proxy) {
		saving = true;
		try {
			const result = await testProxy(proxy.id);
			batchActionResult = testResultText(proxy, result);
			if (result.success) showSuccess(result.latency_ms ? `Proxy OK · ${result.latency_ms}ms` : 'Proxy OK');
			else showError(result.message || 'Proxy test failed');
			await loadRows();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			saving = false;
		}
	}

	async function runQualityCheck(proxy: Proxy) {
		saving = true;
		try {
			const result = await checkProxyQuality(proxy.id);
			const score = typeof result.score === 'number' ? ` · score ${result.score}` : '';
			lastQualityResult = `${proxy.name}: ${result.success ? 'OK' : 'failed'}${score}${result.message ? ` · ${result.message}` : ''}`;
			qualitySubject = proxy;
			qualityReport = result;
			qualityDialogOpen = true;
			if (result.success) showSuccess(`Proxy quality OK${score}`);
			else showError(result.message || 'Proxy quality check failed');
			await loadRows();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			saving = false;
			}
		}

		async function runBatchTest(scope: ProxyBatchScope = 'selected') {
			saving = true;
			try {
				const targets = await batchTargetRows(scope);
				if (targets.length === 0) {
					batchActionResult = scope === 'all' ? 'No proxies available to test' : 'No selected proxies to test';
					showInfo(batchActionResult);
					return;
				}
				const results = await Promise.all(
					targets.map(async (proxy) => ({ proxy, result: await testProxy(proxy.id) }))
				);
				const passed = results.filter(({ result }) => result.success).length;
				batchActionResult = `Proxy tests: ${passed}/${results.length} passed`;
				lastQualityResult = null;
				if (passed === results.length) showSuccess(batchActionResult);
				else showError(batchActionResult);
				await loadRows();
			} catch (err) {
				showError(err instanceof Error ? err.message : String(err));
			} finally {
				saving = false;
			}
		}

		async function runBatchQualityCheck(scope: ProxyBatchScope = 'selected') {
			saving = true;
			try {
				const targets = await batchTargetRows(scope);
				if (targets.length === 0) {
					batchActionResult = scope === 'all' ? 'No proxies available to check' : 'No selected proxies to check';
					showInfo(batchActionResult);
					return;
				}
				const results = await Promise.all(
					targets.map(async (proxy) => ({ proxy, result: await checkProxyQuality(proxy.id) }))
				);
				const passed = results.filter(({ result }) => result.success).length;
				const scored = results
					.map(({ result }) => (typeof result.score === 'number' ? result.score : null))
					.filter((score): score is number => score !== null);
				const averageScore = scored.length ? ` · avg score ${Math.round(scored.reduce((sum, score) => sum + score, 0) / scored.length)}` : '';
				batchActionResult = `Proxy quality: ${passed}/${results.length} passed${averageScore}`;
				const last = results[results.length - 1];
				qualitySubject = last.proxy;
				qualityReport = last.result;
				qualityDialogOpen = true;
				lastQualityResult = `${last.proxy.name}: ${last.result.success ? 'OK' : 'failed'}${typeof last.result.score === 'number' ? ` · score ${last.result.score}` : ''}`;
				if (passed === results.length) showSuccess(batchActionResult);
				else showError(batchActionResult);
				await loadRows();
			} catch (err) {
				showError(err instanceof Error ? err.message : String(err));
			} finally {
				saving = false;
			}
		}

			function openDataTools() {
				refreshBatchParse();
				dataImportResult = null;
				dataOpen = true;
			}

		async function exportSelected() {
			dataBusy = true;
			try {
				const payload = await exportProxyData({ ids: selectedArray() });
				dataJson = JSON.stringify(payload, null, 2);
				dataOpen = true;
				showSuccess('Proxy data exported');
			} catch (err) {
				showError(err instanceof Error ? err.message : String(err));
			} finally {
				dataBusy = false;
			}
		}

		async function exportFiltered() {
			dataBusy = true;
			try {
				const payload = await exportProxyData({ filters: currentFilters() });
				dataJson = JSON.stringify(payload, null, 2);
				dataOpen = true;
				showSuccess('Filtered proxy data exported');
			} catch (err) {
				showError(err instanceof Error ? err.message : String(err));
			} finally {
				dataBusy = false;
			}
		}

		function downloadDataJson() {
			if (!dataJson.trim()) return;
			downloadJson(`proxies-${new Date().toISOString().slice(0, 10)}.json`, dataJson);
			showInfo('Proxy data download started');
		}

		async function importData() {
			dataBusy = true;
			try {
				const parsed = JSON.parse(dataJson);
				dataImportResult = await importProxyData({ data: parsed });
				const failed = Number(dataImportResult.proxy_failed ?? dataImportResult.failed ?? 0);
				if (failed > 0) showError(`Proxy data imported with ${failed} failure${failed === 1 ? '' : 's'}`);
				else showSuccess('Proxy data imported');
				await loadRows();
			} catch (err) {
				showError(err instanceof Error ? err.message : String(err));
			} finally {
				dataBusy = false;
			}
		}

		async function importDataFile(event: Event) {
			const input = event.currentTarget as HTMLInputElement;
			const file = input.files?.[0];
			if (!file) return;
			dataBusy = true;
			dataFileName = file.name;
			try {
				dataJson = await readFileAsText(file);
				const parsed = JSON.parse(dataJson);
				dataImportResult = await importProxyData({ data: parsed });
				const failed = Number(dataImportResult.proxy_failed ?? dataImportResult.failed ?? 0);
				if (failed > 0) showError(`Proxy data imported with ${failed} failure${failed === 1 ? '' : 's'}`);
				else showSuccess('Proxy data imported');
				await loadRows();
			} catch (err) {
				showError(err instanceof SyntaxError ? 'Proxy data file is not valid JSON' : err instanceof Error ? err.message : String(err));
			} finally {
				dataBusy = false;
				input.value = '';
			}
		}

			async function createBatch() {
				refreshBatchParse();
				if (batchParse.valid === 0) {
					showError(batchParse.error || 'No valid proxies to create');
					return;
				}
				dataBusy = true;
				try {
					await batchCreateProxies(batchParse.proxies);
					const skipped = batchParse.invalid + batchParse.duplicate;
					showSuccess(skipped > 0 ? `Proxy batch created · skipped ${skipped}` : 'Proxy batch created');
					await loadRows();
				} catch (err) {
					showError(err instanceof Error ? err.message : String(err));
			} finally {
				dataBusy = false;
			}
		}

	async function openAccounts(proxy: Proxy) {
		accountsSubject = proxy;
		accountsOpen = true;
		accountsLoading = true;
		accounts = [];
		try {
			accounts = await listProxyAccounts(proxy.id);
			if (accounts.length === 0) showInfo('No accounts use this proxy');
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			accountsLoading = false;
		}
	}
</script>

<svelte:head>
	<title>{$_('admin.proxies.title', { default: 'Proxies' })}</title>
</svelte:head>

<section class="space-y-5">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
		<div>
			<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">M13 · Supply</p>
			<h1 class="text-2xl font-semibold tracking-normal text-foreground">{$_('admin.proxies.title', { default: 'Proxies' })}</h1>
			<p class="mt-1 max-w-3xl text-sm text-muted-foreground">
				{$_('admin.proxies.description', { default: 'Manage outbound proxies, expiry fallback, and account usage.' })}
			</p>
		</div>
			<div class="flex gap-2">
				<Button variant="outline" onclick={loadRows} disabled={loading}>
					<RefreshCw size={16} class={loading ? 'animate-spin' : ''} /> Refresh
				</Button>
				<Button variant="outline" onclick={openDataTools} disabled={dataBusy}>
					Data tools
				</Button>
				<Button onclick={openCreate}>
					<Plus size={16} /> New proxy
				</Button>
		</div>
	</header>

	<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
		{#each summary as item}
			<Card>
				<p class="text-xs font-medium uppercase text-muted-foreground">{item.label}</p>
				<p class="mt-2 text-2xl font-semibold">{item.value}</p>
			</Card>
		{/each}
	</div>

	<Card class="p-3">
		<div class="grid gap-3 lg:grid-cols-[1fr_160px_160px_auto]">
			<label class="relative">
				<Search class="pointer-events-none absolute left-3 top-2.5 text-muted-foreground" size={16} />
				<Input class="pl-9" placeholder="Search proxies" bind:value={searchInput} onkeydown={(e) => e.key === 'Enter' && applyFilters()} />
			</label>
			<NativeSelect bind:value={protocolFilter} options={protocolOptions} onchange={applyFilters} data-testid="proxies-protocol-filter" />
			<NativeSelect bind:value={statusFilter} options={statusOptions} onchange={applyFilters} data-testid="proxies-status-filter" />
			<Button onclick={applyFilters}>Apply</Button>
		</div>
	</Card>

		{#if loadError}
			<Alert variant="destructive" class="flex items-center gap-2">
				<AlertTriangle size={16} /> {loadError}
			</Alert>
		{/if}

			{#if lastQualityResult}
				<Alert class="flex items-center gap-2">
					<Wifi size={16} /> {lastQualityResult}
				</Alert>
			{/if}

			{#if batchActionResult}
				<Alert class="flex items-center gap-2" data-testid="proxy-batch-action-result">
					<Wifi size={16} /> {batchActionResult}
				</Alert>
			{/if}

			<Card class="p-3">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<p class="text-sm text-muted-foreground">{selectedIds.size} selected</p>
					<div class="flex flex-wrap gap-2">
						<Button variant="outline" disabled={selectedIds.size === 0 || saving} onclick={() => runBatchTest('selected')}>Test selected</Button>
						<Button variant="outline" disabled={selectedIds.size === 0 || saving} onclick={() => runBatchQualityCheck('selected')}>Quality selected</Button>
						<Button variant="outline" disabled={total === 0 || saving} onclick={() => runBatchTest('all')}>Test all</Button>
						<Button variant="outline" disabled={total === 0 || saving} onclick={() => runBatchQualityCheck('all')}>Quality all</Button>
						<Button variant="outline" disabled={selectedIds.size === 0 || dataBusy} onclick={exportSelected}>Export selected</Button>
						<Button variant="outline" class="text-destructive" disabled={selectedIds.size === 0 || saving} onclick={openDeleteSelectedDialog}>Delete selected</Button>
					</div>
			</div>
		</Card>

		<Card padded={false} class="overflow-hidden" data-testid="proxies-page">
			<VirtualTable rows={rows} rowHeight={64} loading={loading} getRowKey={(row) => row.id} class="max-h-[680px]">
				{#snippet header()}
					<div class="grid grid-cols-[44px_1.4fr_1.3fr_1fr_1fr_1fr_230px] gap-3 border-b px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">
						<label class="flex items-center">
							<Checkbox checked={allPageSelected} onchange={togglePageSelection} aria-label="Select page" />
						</label>
						<span>Proxy</span><span>Endpoint</span><span>Status</span><span>Accounts</span><span>Expiry</span><span>Actions</span>
					</div>
				{/snippet}
				{#snippet row({ row })}
					<div class="grid grid-cols-[44px_1.4fr_1.3fr_1fr_1fr_1fr_230px] items-center gap-3 border-b px-4 py-3 text-sm" data-testid="proxy-row">
						<Checkbox checked={selectedIds.has(row.id)} onchange={() => toggleOne(row.id)} aria-label="Select proxy" />
						<div class="min-w-0">
							<div class="flex items-center gap-2">
								<Network size={15} class="text-muted-foreground" />
							<p class="truncate font-medium">{row.name}</p>
						</div>
						<p class="truncate text-xs text-muted-foreground">ID {row.id}</p>
					</div>
					<p class="truncate text-xs" title={formatProxyLabel(row)}>{row.protocol}://{row.host}:{row.port}</p>
					<Badge variant="outline" class={statusTone(row.status)}>{row.status}</Badge>
					<Button variant="ghost" size="sm" class="h-auto w-fit p-0 text-left text-xs underline hover:bg-transparent" onclick={() => openAccounts(row)}>{proxyAccountCount(row)} accounts</Button>
					<p class="text-xs text-muted-foreground">{row.expires_at ? new Date(row.expires_at).toLocaleDateString() : 'None'}</p>
					<div class="flex flex-wrap gap-1.5">
						<Button variant="outline" size="sm" disabled={saving} onclick={() => runTest(row)}><Wifi class="mr-1 inline" size={13} />Test</Button>
						<Button variant="outline" size="sm" disabled={saving} onclick={() => runQualityCheck(row)}>Quality</Button>
						<Button variant="outline" size="sm" onclick={() => openEdit(row)}>Edit</Button>
						<Button variant="outline" size="sm" disabled={saving} onclick={() => updateProxyStatus(row.id, row.status === 'active' ? 'inactive' : 'active').then(loadRows)}>
							{row.status === 'active' ? 'Disable' : 'Enable'}
						</Button>
						<Button variant="outline" size="sm" class="text-destructive" disabled={saving} onclick={() => openDeleteProxyDialog(row)}>Delete</Button>
					</div>
				</div>
			{/snippet}
			{#snippet empty()}
				<div class="p-10 text-center text-sm text-muted-foreground">No proxies match the current filters.</div>
			{/snippet}
		</VirtualTable>
	</Card>

	<div class="flex items-center justify-between">
		<p class="text-sm text-muted-foreground">{total} total</p>
		<div class="flex items-center gap-2">
			<Button variant="outline" size="icon" disabled={page <= 1 || loading} onclick={() => { page -= 1; void loadRows(); }} aria-label="Previous page"><ChevronLeft size={16} /></Button>
			<span class="text-sm">{page} / {totalPages}</span>
			<Button variant="outline" size="icon" disabled={page >= totalPages || loading} onclick={() => { page += 1; void loadRows(); }} aria-label="Next page"><ChevronRight size={16} /></Button>
		</div>
	</div>
</section>

<StandardDialog bind:open={dialogOpen} title={editing ? 'Edit proxy' : 'New proxy'} data-testid="proxy-dialog">
	<div class="mt-4 grid gap-3">
		<label class="grid gap-1 text-sm">Name<Input bind:value={form.name} /></label>
		<div class="grid gap-3 sm:grid-cols-[130px_1fr_110px]">
			<label class="grid gap-1 text-sm">Protocol<NativeSelect bind:value={formProtocol} options={formProtocolOptions} onchange={() => (form.protocol = formProtocol)} /></label>
			<label class="grid gap-1 text-sm">Host<Input bind:value={form.host} /></label>
			<label class="grid gap-1 text-sm">Port<Input type="number" bind:value={form.port} /></label>
		</div>
		<div class="grid gap-3 sm:grid-cols-2">
			<label class="grid gap-1 text-sm">Username<Input bind:value={form.username} /></label>
			<label class="grid gap-1 text-sm">Password<Input type="password" bind:value={form.password} placeholder={editing ? 'Leave blank to keep existing' : ''} /></label>
		</div>
		<div class="grid gap-3 sm:grid-cols-3">
			<label class="grid gap-1 text-sm">Status<NativeSelect bind:value={formStatus} options={formStatusOptions} onchange={() => (form.status = formStatus)} /></label>
			<label class="grid gap-1 text-sm">Expires<Input type="date" bind:value={formExpiresAt} /></label>
			<label class="grid gap-1 text-sm">Warn days<Input type="number" min="1" step="1" bind:value={form.expiry_warn_days} data-testid="proxy-form-warn-days" /></label>
		</div>
		<div class="grid gap-3 sm:grid-cols-2">
			<label class="grid gap-1 text-sm">
				Fallback mode
				<NativeSelect bind:value={formFallbackMode} options={fallbackModeOptions} data-testid="proxy-form-fallback-mode" />
			</label>
			<label class="grid gap-1 text-sm">
				Backup proxy ID
				<Input
					type="number"
					min="1"
					step="1"
					bind:value={form.backup_proxy_id}
					disabled={formFallbackMode !== 'proxy'}
					data-testid="proxy-form-backup-proxy"
				/>
			</label>
		</div>
	</div>
	<div class="mt-5 flex justify-end gap-2">
		<Button variant="outline" onclick={() => (dialogOpen = false)}>Cancel</Button>
		<Button disabled={saving || !form.name.trim() || !form.host.trim()} onclick={saveProxy}>Save</Button>
	</div>
</StandardDialog>

	<StandardDialog bind:open={accountsOpen} title={`${accountsSubject?.name ?? 'Proxy'} accounts`} width="sm" data-testid="proxy-accounts-dialog">
	<div class="mt-4 max-h-80 overflow-auto rounded-md border">
		{#if accountsLoading}
			<p class="p-4 text-sm text-muted-foreground">Loading…</p>
		{:else if accounts.length === 0}
			<p class="p-4 text-sm text-muted-foreground">No accounts use this proxy.</p>
		{:else}
			{#each accounts as account}
				<div class="border-b p-3 text-sm last:border-b-0">
					<p class="font-medium">{account.name}</p>
					<p class="text-xs text-muted-foreground">{account.platform} · {account.type} · {account.status}</p>
				</div>
			{/each}
		{/if}
	</div>
	<div class="mt-5 flex justify-end">
			<Button variant="outline" onclick={() => (accountsOpen = false)}>Close</Button>
		</div>
	</StandardDialog>

	<StandardDialog bind:open={dataOpen} title="Proxy data tools" width="lg" data-testid="proxy-data-dialog">
		<div class="mt-4 grid gap-4">
				<Card class="space-y-3">
					<div>
						<h2 class="text-sm font-semibold">Batch create</h2>
						<p class="text-xs text-muted-foreground">Paste one proxy URL per line, or a JSON array / {`{ "proxies": [] }`} payload.</p>
					</div>
					<Textarea rows={7} bind:value={batchJson} oninput={refreshBatchParse} data-testid="proxy-batch-json" />
					{#if batchParse.total > 0 || batchParse.error}
						<div class="flex flex-wrap gap-3 rounded-md bg-muted p-3 text-sm" data-testid="proxy-batch-parse-summary">
							<span>Valid {batchParse.valid}</span>
							<span class={batchParse.invalid > 0 ? 'text-amber-600' : 'text-muted-foreground'}>Invalid {batchParse.invalid}</span>
							<span class={batchParse.duplicate > 0 ? 'text-muted-foreground' : 'text-muted-foreground'}>Duplicate {batchParse.duplicate}</span>
							<span class="text-muted-foreground">Mode {batchParse.mode}</span>
							{#if batchParse.error}
								<span class="text-destructive">{batchParse.error}</span>
							{/if}
						</div>
					{/if}
					<div class="flex justify-end">
						<Button disabled={dataBusy || batchParse.valid === 0} onclick={createBatch}>Create batch</Button>
					</div>
				</Card>

			<Card class="space-y-3">
				<div>
					<h2 class="text-sm font-semibold">Import / export data</h2>
					<p class="text-xs text-muted-foreground">Export selected or filtered proxies into JSON, then paste or upload exported data to import.</p>
				</div>
				<label class="grid gap-1 text-sm">
					Import JSON file
					<Input type="file" accept="application/json,.json" disabled={dataBusy} onchange={importDataFile} data-testid="proxy-data-file" />
				</label>
				{#if dataFileName}
					<p class="text-xs text-muted-foreground" data-testid="proxy-data-file-name">{dataFileName}</p>
				{/if}
				<Textarea rows={8} bind:value={dataJson} data-testid="proxy-data-json" />
				<div class="flex flex-wrap justify-end gap-2">
					<Button variant="outline" disabled={dataBusy || selectedIds.size === 0} onclick={exportSelected}>Export selected</Button>
					<Button variant="outline" disabled={dataBusy} onclick={exportFiltered}>Export filtered</Button>
					<Button variant="outline" disabled={dataBusy || !dataJson.trim()} onclick={downloadDataJson}>Download JSON</Button>
					<Button disabled={dataBusy || !dataJson.trim()} onclick={importData}>Import data</Button>
				</div>
				{#if dataImportResult}
					<div class="rounded-md border border-border bg-muted/20 p-3 text-sm" data-testid="proxy-data-import-result">
						<p class="font-medium">{importResultSummary(dataImportResult)}</p>
						{#if importResultErrors(dataImportResult).length > 0}
							<ul class="mt-2 list-disc space-y-1 pl-5 text-xs text-destructive" data-testid="proxy-data-import-errors">
								{#each importResultErrors(dataImportResult) as error}
									<li>{error}</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/if}
			</Card>
		</div>
		<div class="mt-5 flex justify-end">
			<Button variant="outline" onclick={() => (dataOpen = false)}>Close</Button>
		</div>
		</StandardDialog>

		<StandardDialog bind:open={qualityDialogOpen} title="Proxy quality report" width="lg" data-testid="proxy-quality-dialog">
			<div class="mt-4 space-y-4">
				<Card class="space-y-3">
					<div class="flex items-start justify-between gap-4">
						<div class="min-w-0">
							<p class="truncate text-sm font-medium">{qualitySubject?.name ?? 'Proxy'}</p>
							<p class="mt-1 text-sm text-muted-foreground" data-testid="proxy-quality-summary">{qualityMessage(qualityReport)}</p>
						</div>
						<div class="text-right">
							<p class="text-2xl font-semibold" data-testid="proxy-quality-score">{qualityScoreText(qualityReport)}</p>
							<p class="text-xs text-muted-foreground">score</p>
						</div>
					</div>
					<div class="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
						<p>Exit IP: <span class="text-foreground">{detailText(qualityReport?.exit_ip)}</span></p>
						<p>Country: <span class="text-foreground">{detailText(qualityReport?.country)}</span></p>
						<p>Base latency: <span class="text-foreground">{formatLatency(qualityReport?.base_latency_ms)}</span></p>
						<p>Status: <span class="text-foreground">{qualityReport?.success ? 'passed' : 'failed'}</span></p>
					</div>
				</Card>

				<div class="max-h-80 overflow-auto rounded-md border border-border" data-testid="proxy-quality-targets">
					{#if qualityDetailRows(qualityReport).length === 0}
						<p class="p-4 text-sm text-muted-foreground">No target details returned.</p>
					{:else}
						<div class="grid grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_1.6fr] gap-3 border-b px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
							<span>Target</span><span>Status</span><span>HTTP</span><span>Latency</span><span>Message</span>
						</div>
						{#each qualityDetailRows(qualityReport) as item}
							<div class="grid grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_1.6fr] gap-3 border-b px-3 py-2 text-sm last:border-b-0">
								<p class="truncate">{detailText(item.target)}</p>
								<p class="truncate">{detailText(item.status)}</p>
								<p class="truncate">{detailText(item.http_status)}</p>
								<p class="truncate">{formatLatency(item.latency_ms)}</p>
								<p class="truncate text-muted-foreground">{detailText(item.message)}</p>
							</div>
						{/each}
					{/if}
				</div>
			</div>
			<div class="mt-5 flex justify-end">
				<Button variant="outline" onclick={() => (qualityDialogOpen = false)}>Close</Button>
			</div>
		</StandardDialog>

		<StandardDialog bind:open={deleteDialogOpen} title={deleteMode === 'single' ? 'Delete proxy' : 'Delete selected proxies'} width="sm" data-testid="proxies-delete-dialog">
			<div class="mt-4 space-y-4">
				<p class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
				{#if deleteMode === 'single' && deleteTarget}
					Delete proxy "{deleteTarget.name}"? This action cannot be undone.
				{:else}
					Delete {selectedIds.size} selected prox{selectedIds.size === 1 ? 'y' : 'ies'}? This action cannot be undone.
				{/if}
			</p>
			<div class="flex justify-end gap-2 border-t border-border pt-4">
				<Button variant="outline" onclick={() => (deleteDialogOpen = false)}>Cancel</Button>
				<Button
					variant="outline"
					class="border-destructive/30 text-destructive hover:bg-destructive/10"
					disabled={saving || (deleteMode === 'selected' && selectedIds.size === 0)}
					onclick={confirmDeleteProxy}
					data-testid="proxies-delete-confirm"
				>
					{saving ? 'Deleting...' : 'Delete'}
				</Button>
			</div>
		</div>
	</StandardDialog>
