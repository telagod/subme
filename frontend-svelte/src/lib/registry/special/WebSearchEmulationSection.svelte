<script lang="ts">
	/**
	 * WebSearchEmulationSection · Web 搜索模拟提供商（M10e · gateway tab）
	 *
	 * 端口自 frontend/src/views/admin/settings-registry/special/WebSearchEmulationSection.vue。
	 *
	 * 设计：
	 *   - 与 flat-form 解耦 —— onMount GET /api/admin/settings/web-search-emulation，
	 *     Save 触发 PUT 整体替换；不进 patchSettings 流水线（同 OverloadCooldown 模式）。
	 *   - 全局 enabled toggle + providers 卡片化 CRUD。
	 *   - select 严格 sentinel-safe —— provider.type 是 brave|tavily 具体值。
	 *
	 * 与 Vue tree 差异：
	 *   - 暂略 ProxySelector（Svelte 仓库尚未端口 /admin/proxies API）—— proxy_id
	 *     退化为 number input。后端契约同源，后续接入 proxies API 时切换为 select 即可。
	 *   - 简化 quota 使用进度条 + 复制 API key + reset usage（Vue tree 包含完整 UI；
	 *     这里保留可视化与重置入口，但不依赖 navigator.clipboard / proxies API）。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import {
		settingsApi,
		type WebSearchEmulationConfig,
		type WebSearchProviderConfig,
		type WebSearchTestResult
	} from '$lib/api/admin/settingsRegistry';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';

	type FieldUpdate = { key: string; value: unknown };

	type Props = {
		values?: Record<string, unknown>;
		dirtyKeys?: Set<string>;
		onFieldUpdate?: (e: FieldUpdate) => void;
	};

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { values: _v, dirtyKeys: _d, onFieldUpdate: _f }: Props = $props();

	const DEFAULT_QUOTA_LIMIT = 1000;

	let loading = $state(true);
	let saving = $state(false);
	let config = $state<WebSearchEmulationConfig>({ enabled: false, providers: [] });
	let expanded = $state<Record<number, boolean>>({});

	// test dialog state
	let testOpen = $state(false);
	let testQuery = $state('');
	let testLoading = $state(false);
	let testResult = $state<WebSearchTestResult | null>(null);

	onMount(async () => {
		loading = true;
		try {
			const resp = await settingsApi.getWebSearchEmulationConfig();
			config = {
				enabled: !!resp?.enabled,
				providers: Array.isArray(resp?.providers) ? [...resp.providers] : []
			};
		} catch {
			// 静默 —— 404/网络错误时保持默认空 config。
		} finally {
			loading = false;
		}
	});

	function toggleEnabled() {
		config = { ...config, enabled: !config.enabled };
	}

	function updateProvider(index: number, patch: Partial<WebSearchProviderConfig>) {
		config = {
			...config,
			providers: config.providers.map((p, i) => (i === index ? { ...p, ...patch } : p))
		};
	}

	function onTypeChange(index: number, e: Event) {
		updateProvider(index, {
			type: (e.target as HTMLSelectElement).value as WebSearchProviderConfig['type']
		});
	}

	function onApiKeyInput(index: number, e: Event) {
		updateProvider(index, { api_key: (e.target as HTMLInputElement).value });
	}

	function onQuotaLimitInput(index: number, e: Event) {
		const raw = (e.target as HTMLInputElement).value;
		updateProvider(index, { quota_limit: raw === '' ? null : Number(raw) });
	}

	function onProxyIdInput(index: number, e: Event) {
		const raw = (e.target as HTMLInputElement).value;
		updateProvider(index, { proxy_id: raw === '' ? null : Number(raw) });
	}

	function addProvider() {
		const idx = config.providers.length;
		config = {
			...config,
			providers: [
				...config.providers,
				{
					type: 'brave',
					api_key: '',
					api_key_configured: false,
					quota_limit: DEFAULT_QUOTA_LIMIT,
					subscribed_at: null,
					proxy_id: null,
					expires_at: null
				}
			]
		};
		expanded = { ...expanded, [idx]: true };
	}

	function removeProvider(index: number) {
		config = {
			...config,
			providers: config.providers.filter((_, i) => i !== index)
		};
		const next: Record<number, boolean> = {};
		Object.keys(expanded).forEach((k) => {
			const n = Number(k);
			if (n < index) next[n] = expanded[n];
			else if (n > index) next[n - 1] = expanded[n];
		});
		expanded = next;
	}

	function toggleExpand(index: number) {
		expanded = { ...expanded, [index]: !expanded[index] };
	}

	function quotaPercentage(p: WebSearchProviderConfig): number {
		if (!p.quota_limit || p.quota_limit <= 0) return 0;
		return ((p.quota_used ?? 0) / p.quota_limit) * 100;
	}

	function quotaColor(pct: number): string {
		if (pct > 90) return 'bg-destructive';
		if (pct > 70) return 'bg-amber-500';
		return 'bg-emerald-500';
	}

	async function resetUsage(index: number) {
		const provider = config.providers[index];
		if (!provider) return;
		if (
			typeof window !== 'undefined' &&
			!window.confirm($_('admin.settings.webSearchEmulation.resetUsageConfirm'))
		)
			return;
		try {
			await settingsApi.resetWebSearchUsage(provider.type);
			updateProvider(index, { quota_used: 0 });
			showSuccess($_('admin.settings.webSearchEmulation.resetUsageSuccess'));
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('common.error'));
		}
	}

	async function save() {
		// 校验：quota_limit 若设且 < 1 → 拒绝。
		for (const p of config.providers) {
			const raw = p.quota_limit;
			if (raw != null && Number(raw) !== 0 && Number(raw) < 1) {
				showError($_('admin.settings.webSearchEmulation.quotaLimitMustBePositive'));
				return;
			}
		}
		saving = true;
		try {
			const providers = config.providers.map((p) => ({
				...p,
				quota_limit: Number(p.quota_limit) > 0 ? Number(p.quota_limit) : null
			}));
			await settingsApi.updateWebSearchEmulationConfig({
				enabled: config.enabled,
				providers
			});
			showSuccess($_('common.saved'));
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('common.error'));
		} finally {
			saving = false;
		}
	}

	function openTest() {
		testResult = null;
		testOpen = true;
	}

	function closeTest() {
		testOpen = false;
	}

	async function runTest() {
		testLoading = true;
		testResult = null;
		try {
			const query =
				testQuery.trim() || $_('admin.settings.webSearchEmulation.testDefaultQuery');
			testResult = await settingsApi.testWebSearchEmulation(query);
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('common.error'));
		} finally {
			testLoading = false;
		}
	}
</script>

<div class="flex flex-col gap-5" data-special="web-search-emulation">
	{#if loading}
		<div
			data-testid="web-search-loading"
			class="flex items-center gap-2 text-sm text-muted-foreground"
		>
			{$_('common.loading')}
		</div>
	{:else}
		<!-- global enable toggle -->
		<div class="flex items-center justify-between gap-4">
			<div class="min-w-0">
				<label
					class="block text-sm font-medium text-foreground"
					for="web-search-enabled"
				>
					{$_('admin.settings.webSearchEmulation.enabled')}
				</label>
				<p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
					{$_('admin.settings.webSearchEmulation.enabledHint')}
				</p>
			</div>
			<button
				id="web-search-enabled"
				type="button"
				role="switch"
				aria-checked={config.enabled}
				aria-label={$_('admin.settings.webSearchEmulation.enabled')}
				data-testid="web-search-enabled"
				data-checked={config.enabled}
				onclick={toggleEnabled}
				class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors {config.enabled
					? 'bg-primary'
					: 'bg-muted'}"
			>
				<span
					class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {config.enabled
						? 'translate-x-4'
						: 'translate-x-0.5'}"
				></span>
			</button>
		</div>

		{#if config.enabled}
			<div class="flex flex-col gap-3 border-t border-border pt-4">
				<div class="flex items-center justify-between">
					<label class="block text-sm font-medium text-foreground" for="web-search-add">
						{$_('admin.settings.webSearchEmulation.providers')}
					</label>
					<button
						id="web-search-add"
						type="button"
						data-testid="web-search-add-provider"
						onclick={addProvider}
						class="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs hover:bg-accent"
					>
						{$_('admin.settings.webSearchEmulation.addProvider')}
					</button>
				</div>

				{#if config.providers.length === 0}
					<p
						data-testid="web-search-no-providers"
						class="m-0 rounded-md border border-dashed border-border px-4 py-4 text-center text-sm text-muted-foreground"
					>
						{$_('admin.settings.webSearchEmulation.noProviders')}
					</p>
				{/if}

				{#each config.providers as provider, index (index)}
					<div
						data-testid="web-search-provider"
						data-provider-index={index}
						class="overflow-hidden rounded-md border border-border"
					>
						<!-- header -->
						<div
							class="flex cursor-pointer select-none items-center justify-between gap-2 px-3 py-2"
							onclick={() => toggleExpand(index)}
							role="button"
							tabindex="0"
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') toggleExpand(index);
							}}
						>
							<div class="flex items-center gap-2.5">
								<span
									class="inline-block text-muted-foreground transition-transform {expanded[
										index
									]
										? 'rotate-90'
										: ''}">▶</span
								>
								<select
									data-testid="web-search-provider-type"
									value={provider.type}
									onclick={(e) => e.stopPropagation()}
									onchange={(e) => onTypeChange(index, e)}
									class="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
								>
									<option value="brave">Brave Search</option>
									<option value="tavily">Tavily</option>
								</select>
								<span class="text-xs tabular-nums text-muted-foreground">
									{provider.quota_used ?? 0} /
									{provider.quota_limit != null && provider.quota_limit > 0
										? provider.quota_limit
										: '∞'}
								</span>
								{#if !expanded[index] && provider.api_key_configured}
									<span class="text-xs text-emerald-500">
										{$_('admin.settings.webSearchEmulation.apiKeyConfigured')}
									</span>
								{/if}
							</div>
							<button
								type="button"
								data-testid="web-search-provider-remove"
								onclick={(e) => {
									e.stopPropagation();
									removeProvider(index);
								}}
								class="inline-flex h-7 items-center justify-center rounded-md px-2 text-xs text-destructive hover:bg-destructive/10"
							>
								{$_('admin.settings.webSearchEmulation.removeProvider')}
							</button>
						</div>

						{#if expanded[index]}
							<div
								data-testid="web-search-provider-panel"
								class="flex flex-col gap-3 border-t border-border p-3"
							>
								<div class="flex flex-col gap-1">
									<label
										class="text-xs font-medium text-muted-foreground"
										for="web-search-api-key-{index}"
									>
										{$_('admin.settings.webSearchEmulation.apiKey')}
									</label>
									<input
										id="web-search-api-key-{index}"
										type="password"
										autocomplete="new-password"
										data-testid="web-search-api-key"
										placeholder={provider.api_key_configured
											? '••••••••'
											: $_('admin.settings.webSearchEmulation.apiKeyPlaceholder')}
										value={provider.api_key}
										oninput={(e) => onApiKeyInput(index, e)}
										class="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
									/>
								</div>

								<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
									<div class="flex flex-col gap-1">
										<label
											class="text-xs font-medium text-muted-foreground"
											for="web-search-quota-limit-{index}"
										>
											{$_('admin.settings.webSearchEmulation.quotaLimit')}
										</label>
										<input
											id="web-search-quota-limit-{index}"
											type="number"
											min="1"
											data-testid="web-search-quota-limit"
											placeholder="∞"
											value={provider.quota_limit ?? ''}
											oninput={(e) => onQuotaLimitInput(index, e)}
											class="h-9 rounded-md border border-input bg-background px-3 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring"
										/>
										<p class="m-0 text-[11px] leading-snug text-muted-foreground">
											{$_('admin.settings.webSearchEmulation.quotaLimitHint')}
										</p>
									</div>
									<div class="flex flex-col gap-1">
										<label
											class="text-xs font-medium text-muted-foreground"
											for="web-search-proxy-id-{index}"
										>
											{$_('admin.settings.webSearchEmulation.proxy')}
										</label>
										<input
											id="web-search-proxy-id-{index}"
											type="number"
											min="0"
											data-testid="web-search-proxy-id"
											placeholder="0"
											value={provider.proxy_id ?? ''}
											oninput={(e) => onProxyIdInput(index, e)}
											class="h-9 rounded-md border border-input bg-background px-3 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring"
										/>
									</div>
								</div>

								<!-- quota usage bar -->
								<div class="flex items-center gap-2">
									<span class="text-xs text-muted-foreground"
										>{$_('admin.settings.webSearchEmulation.quotaUsage')}:</span
									>
									{#if provider.quota_limit != null && provider.quota_limit > 0}
										<div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
											<div
												class="h-full rounded-full transition-[width] duration-300 {quotaColor(
													quotaPercentage(provider)
												)}"
												style="width: {Math.min(quotaPercentage(provider), 100)}%"
											></div>
										</div>
									{:else}
										<div class="flex-1"></div>
									{/if}
									<span class="text-xs text-muted-foreground">
										{provider.quota_used ?? 0} /
										{provider.quota_limit != null && provider.quota_limit > 0
											? provider.quota_limit
											: '∞'}
									</span>
									{#if (provider.quota_used ?? 0) > 0}
										<button
											type="button"
											data-testid="web-search-reset-usage"
											onclick={() => resetUsage(index)}
											class="inline-flex h-7 items-center whitespace-nowrap rounded-md px-2 text-xs text-primary hover:underline"
										>
											{$_('admin.settings.webSearchEmulation.resetUsage')}
										</button>
									{/if}
								</div>

								<div class="flex justify-end">
									<button
										type="button"
										data-testid="web-search-open-test"
										onclick={openTest}
										class="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs hover:bg-accent"
									>
										{$_('admin.settings.webSearchEmulation.test')}
									</button>
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		<div class="flex justify-end border-t border-border pt-4">
			<button
				type="button"
				data-testid="web-search-save"
				disabled={saving}
				onclick={save}
				class="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm hover:bg-accent disabled:opacity-50"
			>
				{saving ? $_('common.saving') : $_('common.save')}
			</button>
		</div>
	{/if}

	{#if testOpen}
		<div
			data-testid="web-search-test-dialog"
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/55"
			onclick={(e) => {
				if (e.target === e.currentTarget) closeTest();
			}}
			onkeydown={(e) => {
				if (e.key === 'Escape') closeTest();
			}}
			role="dialog"
			tabindex="-1"
			aria-modal="true"
		>
			<div class="mx-4 w-full max-w-lg rounded-md border border-border bg-card p-5">
				<h3 class="m-0 mb-3 text-base font-semibold text-foreground">
					{$_('admin.settings.webSearchEmulation.testResultTitle')}
				</h3>
				<div class="flex items-center gap-2">
					<input
						type="text"
						data-testid="web-search-test-query"
						placeholder={$_('admin.settings.webSearchEmulation.testDefaultQuery')}
						value={testQuery}
						oninput={(e) => (testQuery = (e.target as HTMLInputElement).value)}
						onkeyup={(e) => {
							if (e.key === 'Enter') runTest();
						}}
						class="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
					/>
					<button
						type="button"
						data-testid="web-search-run-test"
						disabled={testLoading}
						onclick={runTest}
						class="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md border border-input bg-background px-3 text-sm hover:bg-accent disabled:opacity-50"
					>
						{testLoading
							? $_('admin.settings.webSearchEmulation.testing')
							: $_('admin.settings.webSearchEmulation.test')}
					</button>
				</div>
				{#if testResult}
					<div class="mt-4 max-h-80 overflow-y-auto rounded-md bg-muted p-3">
						<p class="m-0 mb-2 text-sm font-medium text-foreground">
							{$_('admin.settings.webSearchEmulation.testResultProvider')}: {testResult.provider}
						</p>
						{#if testResult.results.length === 0}
							<p class="m-0 text-sm text-muted-foreground">
								{$_('admin.settings.webSearchEmulation.testNoResults')}
							</p>
						{:else}
							{#each testResult.results as r, rIdx (rIdx)}
								<div
									class="mt-2.5 border-t border-border pt-2.5 first:mt-0 first:border-t-0 first:pt-0"
								>
									<a
										href={r.url}
										target="_blank"
										rel="noopener noreferrer"
										class="text-sm font-medium text-primary no-underline hover:underline">{r.title}</a
									>
									<p class="m-0 mt-1 text-xs leading-snug text-muted-foreground">
										{r.snippet}
									</p>
								</div>
							{/each}
						{/if}
					</div>
				{/if}
				<div class="mt-4 flex justify-end">
					<button
						type="button"
						data-testid="web-search-test-close"
						onclick={closeTest}
						class="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm hover:bg-accent"
					>
						{$_('common.close')}
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
