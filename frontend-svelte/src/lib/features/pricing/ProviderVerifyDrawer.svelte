<script lang="ts">
	/**
	 * ProviderVerifyDrawer · OpenRouter 报价 + 价格覆盖核心（POC 5）
	 *
	 * 红线（memory `openrouter-pricing-done` analyze 澄清后）：
	 *   - 后端计费 service 的取价函数（含 fallback 链事实源）不可触碰 —— 本抽屉不引用。
	 *   - admin/channels 下的 model-pricing 端点不可触碰 —— 本抽屉不引用。
	 *   - IN-SCOPE: /admin/model-catalog/* 全部 5 端点（GET detail / POST sync / PUT override / DELETE override）。
	 *
	 * 视图：
	 *   1) Head bar (Layers icon + 名称 + slug + 关闭 X)
	 *   2) Meta row (context badge + capability badges + Overridden badge if detail.overridden)
	 *   3) Description 3-line clamp + Show more/less toggle
	 *   4) Baseline note band (source badge + Manual 标签 if overridden)
	 *   5) Sync-failed amber inline band + Retry button
	 *   6) Provider table (baseline-source-first sort，BASELINE / PINNED 高亮)
	 *   7) Edit footer 按钮 → 显示 RadioGroup（auto/pinned/manual） + Note input + Save/Restore
	 *
	 * Override 提交契约：
	 *   - auto + 当前 overridden → DELETE /override → 触发 override-saved
	 *   - pinned + tag → PUT /override { pinned_provider_tag: tag }
	 *   - manual + 任一字段非空 → PUT /override { manual_input, manual_output, ... }
	 *     （UI 收集 per-MTok，提交时 / 1e6 转 per-token）
	 *
	 * 测试钩子：
	 *   - data-testid="provider-verify-drawer"
	 *   - data-testid="provider-verify-close"
	 *   - data-testid="provider-verify-edit-toggle"
	 *   - data-testid="provider-verify-mode-auto" / -pinned / -manual
	 *   - data-testid="provider-verify-save"
	 *   - data-testid="provider-verify-restore"
	 *   - data-testid="provider-verify-pinned-select"
	 */
	import {
		X,
		RefreshCw,
		Info,
		Hash,
		Layers,
		ShieldCheck,
		AlertTriangle,
		ChevronDown,
		Save,
		Trash2,
		Edit
	} from '@lucide/svelte';
	import { _ } from 'svelte-i18n';
	import { createEventDispatcher } from 'svelte';
	import {
		modelCatalogApi,
		type CatalogModelDetail,
		type CatalogProvider,
		type UpsertOverridePayload
	} from '$lib/api/admin/modelCatalog';
	import {
		fmtPriceMTok,
		fmtCtx,
		fmtUptime,
		uptimeColor,
		sourceLabel,
		SHOW_CAPS,
		CAP_LABELS
	} from '$lib/utils/pricing';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import StandardDrawer from '$lib/ui/StandardDrawer.svelte';

	const PINNED_NONE = '__none__';

	type Props = {
		open: boolean;
		slug: string | null;
		modelName: string | null;
	};

	let { open = $bindable(false), slug = null, modelName = null }: Props = $props();

	const dispatch = createEventDispatcher<{ 'override-saved': string }>();

	type OverrideMode = 'auto' | 'pinned' | 'manual';

	// ── 远端状态 ──
	let loading = $state(false);
	let error = $state<string | null>(null);
	let detail = $state<CatalogModelDetail | null>(null);
	let syncing = $state(false);
	let syncFailed = $state(false);

	// ── 编辑面板状态 ──
	let editOpen = $state(false);
	let mode = $state<OverrideMode>('auto');
	let pinnedTag = $state<string>(PINNED_NONE);
	let manualInput = $state<string>('');
	let manualOutput = $state<string>('');
	let manualCacheRead = $state<string>('');
	let manualCacheWrite = $state<string>('');
	let note = $state<string>('');
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let descExpanded = $state(false);

	let lastFetchedFor = $state<string | null>(null);

	$effect(() => {
		if (open && slug && slug !== lastFetchedFor) {
			lastFetchedFor = slug;
			void load(slug);
		}
		if (!open) {
			lastFetchedFor = null;
			editOpen = false;
			descExpanded = false;
			saveError = null;
		}
	});

	async function load(s: string) {
		loading = true;
		error = null;
		detail = null;
		syncFailed = false;
		try {
			const d = await modelCatalogApi.getModel(s);
			if (d.providers?.length === 0) {
				detail = d;
				loading = false;
				syncing = true;
				try {
					await modelCatalogApi.syncModel(s);
					detail = await modelCatalogApi.getModel(s);
					syncFailed = false;
				} catch (e) {
					syncFailed = true;
					// eslint-disable-next-line no-console
					console.warn('[ProviderVerifyDrawer] lazy sync failed', e);
				} finally {
					syncing = false;
				}
			} else {
				detail = d;
			}
			seedForm(detail);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	async function retrySync() {
		if (!detail || syncing) return;
		const s = detail.id;
		syncing = true;
		syncFailed = false;
		try {
			await modelCatalogApi.syncModel(s);
			detail = await modelCatalogApi.getModel(s);
			seedForm(detail);
		} catch (e) {
			syncFailed = true;
			// eslint-disable-next-line no-console
			console.warn('[ProviderVerifyDrawer] retry sync failed', e);
		} finally {
			syncing = false;
		}
	}

	function seedForm(d: CatalogModelDetail | null) {
		const ov = d?.override;
		if (!ov) {
			mode = 'auto';
			pinnedTag = PINNED_NONE;
			manualInput = '';
			manualOutput = '';
			manualCacheRead = '';
			manualCacheWrite = '';
			note = '';
			return;
		}
		note = ov.note ?? '';
		const hasManual =
			ov.manual_input != null ||
			ov.manual_output != null ||
			ov.manual_cache_read != null ||
			ov.manual_cache_write != null;
		if (hasManual) {
			mode = 'manual';
			manualInput = ov.manual_input != null ? String(ov.manual_input * 1e6) : '';
			manualOutput = ov.manual_output != null ? String(ov.manual_output * 1e6) : '';
			manualCacheRead = ov.manual_cache_read != null ? String(ov.manual_cache_read * 1e6) : '';
			manualCacheWrite = ov.manual_cache_write != null ? String(ov.manual_cache_write * 1e6) : '';
			pinnedTag = PINNED_NONE;
		} else if (ov.pinned_provider_tag) {
			mode = 'pinned';
			pinnedTag = ov.pinned_provider_tag;
		} else {
			mode = 'auto';
			pinnedTag = PINNED_NONE;
		}
	}

	function parseMtok(v: string): number | null {
		if (!v && v !== '0') return null;
		const n = parseFloat(v);
		return Number.isNaN(n) ? null : n / 1e6;
	}

	// derived: sorted providers, baseline-source 优先 + input asc
	const sortedProviders = $derived.by<CatalogProvider[]>(() => {
		if (!detail?.providers) return [];
		const src = detail.baseline?.source;
		return [...detail.providers].sort((a, b) => {
			if (a.tag === src && b.tag !== src) return -1;
			if (a.tag !== src && b.tag === src) return 1;
			return (a.input ?? Infinity) - (b.input ?? Infinity);
		});
	});

	const filteredCaps = $derived.by(() =>
		detail?.capabilities?.filter((c) => SHOW_CAPS.includes(c)) ?? []
	);

	function capLabel(c: string) {
		return CAP_LABELS[c] ?? c;
	}

	function isBaseline(p: CatalogProvider): boolean {
		return p.tag === detail?.baseline?.source;
	}

	function isPinned(p: CatalogProvider): boolean {
		return !!(
			detail?.override?.pinned_provider_tag && p.tag === detail.override.pinned_provider_tag
		);
	}

	const canSave = $derived.by(() => {
		if (mode === 'pinned') return pinnedTag !== PINNED_NONE;
		if (mode === 'manual') {
			return !!(manualInput || manualOutput || manualCacheRead || manualCacheWrite);
		}
		return false;
	});

	async function handleSave() {
		if (!detail || saving) return;
		saving = true;
		saveError = null;
		try {
			const payload: UpsertOverridePayload = {
				model_id: detail.id,
				note: note || undefined
			};
			if (mode === 'pinned') {
				payload.pinned_provider_tag = pinnedTag;
			} else if (mode === 'manual') {
				payload.manual_input = parseMtok(manualInput);
				payload.manual_output = parseMtok(manualOutput);
				payload.manual_cache_read = parseMtok(manualCacheRead);
				payload.manual_cache_write = parseMtok(manualCacheWrite);
			}
			await modelCatalogApi.upsertOverride(payload);
			// 重拉详情，刷新 overridden / baseline
			detail = await modelCatalogApi.getModel(detail.id);
			seedForm(detail);
			dispatch('override-saved', modelName ?? detail.id);
		} catch (e) {
			saveError = e instanceof Error ? e.message : String(e);
		} finally {
			saving = false;
		}
	}

	async function handleRestore() {
		if (!detail || saving) return;
		saving = true;
		saveError = null;
		try {
			await modelCatalogApi.deleteOverride(detail.id);
			detail = await modelCatalogApi.getModel(detail.id);
			seedForm(detail);
			dispatch('override-saved', modelName ?? detail.id);
		} catch (e) {
			saveError = e instanceof Error ? e.message : String(e);
		} finally {
			saving = false;
		}
	}

	function close() {
		open = false;
	}

	function toggleEdit() {
		editOpen = !editOpen;
		saveError = null;
	}
</script>

<StandardDrawer
	bind:open
	width="md"
	showHeader={false}
	title={modelName ?? detail?.name ?? slug ?? 'Provider pricing'}
	data-testid="provider-verify-drawer"
	class="pvd-content gap-0 p-0"
>
			<!-- Head -->
			<div class="flex items-center justify-between border-b bg-muted px-4 py-3">
				<div class="flex min-w-0 items-center gap-2">
					<Layers class="h-4 w-4 flex-shrink-0 text-primary" />
					<div class="min-w-0">
						<h2 class="truncate text-sm font-semibold tracking-tight">
							{modelName ?? detail?.name ?? slug ?? '—'}
						</h2>
						<div class="truncate font-mono text-[11px] text-muted-foreground" title={slug ?? ''}>
							{slug ?? '—'}
						</div>
					</div>
				</div>
				<Button
					variant="ghost"
					size="icon"
					class="h-8 w-8 text-muted-foreground hover:bg-muted hover:text-foreground"
					aria-label={$_('admin.providerVerify.close', { default: 'Close' })}
					data-testid="provider-verify-close"
					onclick={close}
				>
					<X class="h-4 w-4" />
				</Button>
			</div>

			<!-- Body -->
			<div class="flex-1 overflow-y-auto px-4 py-4">
				{#if loading}
					<div class="space-y-3" data-testid="provider-verify-skeleton">
						<div class="h-5 w-1/3 animate-pulse rounded bg-muted"></div>
						<div class="h-16 w-full animate-pulse rounded bg-muted"></div>
						<div class="h-32 w-full animate-pulse rounded bg-muted"></div>
					</div>
				{:else if error}
					<div
						class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
						data-testid="provider-verify-error"
					>
						<div class="mb-2 font-medium">
							{$_('admin.providerVerify.loadError', { default: 'Load failed: ' })}{error}
						</div>
						{#if slug}
							<Button
								variant="outline"
								size="sm"
								class="h-7 border-destructive/40 px-2 hover:bg-destructive/20"
								onclick={() => load(slug!)}
							>
								{$_('admin.providerVerify.retry', { default: 'Retry' })}
							</Button>
						{/if}
					</div>
				{:else if detail}
					<!-- Meta row -->
					<div class="mb-3 flex flex-wrap items-center gap-1.5">
						{#if detail.context_len}
							<span
								class="inline-flex items-center gap-1 rounded border bg-background px-1.5 py-0.5 text-[10.5px] font-semibold"
							>
								<Hash class="h-2.5 w-2.5" />
								{fmtCtx(detail.context_len)} ctx
							</span>
						{/if}
						{#each filteredCaps as c (c)}
							<span
								class="inline-flex items-center rounded border bg-background px-1.5 py-0.5 text-[10.5px]"
							>
								{capLabel(c)}
							</span>
						{/each}
						{#if detail.overridden}
							<span
								class="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-primary"
								data-testid="provider-verify-overridden-badge"
							>
								<ShieldCheck class="h-2.5 w-2.5" />
								{$_('admin.providerVerify.overriddenBadge', { default: 'Overridden' })}
							</span>
						{/if}
					</div>

					<!-- Description -->
					{#if detail.description}
						<div class="mb-3 rounded-md border bg-muted px-3 py-2">
							<p
								class="m-0 text-[12px] leading-relaxed text-muted-foreground"
								class:line-clamp-3={!descExpanded}
							>
								{detail.description}
							</p>
							{#if detail.description.length > 160}
								<Button
									variant="ghost"
									size="sm"
									class="mt-1 h-auto px-0 py-0 text-[10.5px] text-primary hover:bg-transparent hover:underline"
									onclick={() => (descExpanded = !descExpanded)}
								>
									{descExpanded
										? $_('admin.providerVerify.showLess', { default: 'Show less' })
										: $_('admin.providerVerify.showMore', { default: 'Show more' })}
								</Button>
							{/if}
						</div>
					{/if}

					<!-- Baseline note band -->
					<div
						class="mb-3 flex items-center gap-2 rounded-md border px-3 py-2 text-[11.5px] text-muted-foreground"
						class:baseline-band-overridden={detail.overridden}
						class:baseline-band-default={!detail.overridden}
					>
						<Info class="h-3 w-3 flex-shrink-0 text-primary" />
						<span>
							{$_('admin.providerVerify.baselineNote', { default: 'Baseline source: ' })}
						</span>
						<span
							class="rounded border border-primary/25 bg-primary/10 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-primary"
						>
							{sourceLabel(detail.baseline?.source)}
						</span>
						{#if detail.overridden}
							<span
								class="rounded border border-primary/40 bg-primary/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary"
							>
								{$_('admin.providerVerify.overriddenLabel', { default: 'overridden' })}
							</span>
						{/if}
					</div>

					<!-- Sync failed inline band -->
					{#if syncFailed}
						<div
							class="mb-3 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700"
							data-testid="provider-verify-sync-failed"
						>
							<AlertTriangle class="h-3.5 w-3.5" />
							<span>
								{$_('admin.providerVerify.syncFailed', {
									default: 'Sync failed, list may not be up to date'
								})}
							</span>
							<Button
								variant="outline"
								size="sm"
								class="ml-auto h-6 border-amber-500/40 px-2 text-[11px] hover:bg-amber-500/20"
								onclick={retrySync}
								disabled={syncing}
							>
								{$_('admin.providerVerify.retry', { default: 'Retry' })}
							</Button>
						</div>
					{/if}

					<!-- Provider table -->
					{#if sortedProviders.length > 0}
						<div class="overflow-hidden rounded-md border">
							<table class="w-full text-[12px]">
								<thead class="bg-muted text-[9.5px] uppercase tracking-wider text-muted-foreground">
									<tr>
										<th class="px-2.5 py-2 text-left">
											{$_('admin.providerVerify.colProvider', { default: 'Provider' })}
										</th>
										<th class="px-2.5 py-2 text-right">
											{$_('admin.providerVerify.colIn', { default: 'In /M' })}
										</th>
										<th class="px-2.5 py-2 text-right">
											{$_('admin.providerVerify.colOut', { default: 'Out /M' })}
										</th>
										<th class="px-2.5 py-2 text-right">
											{$_('admin.providerVerify.colCacheRead', { default: 'Cache R /M' })}
										</th>
										<th class="px-2.5 py-2 text-right">
											{$_('admin.providerVerify.colCacheWrite', { default: 'Cache W /M' })}
										</th>
										<th class="px-2.5 py-2 text-right">
											{$_('admin.providerVerify.colUptime', { default: 'Uptime' })}
										</th>
										<th class="px-2.5 py-2 text-center">
											{$_('admin.providerVerify.colQuant', { default: 'Quant' })}
										</th>
									</tr>
								</thead>
								<tbody>
									{#each sortedProviders as p (p.tag)}
										{@const pinnedRow = isPinned(p)}
										{@const baselineRow = isBaseline(p)}
										{@const upColor = uptimeColor(p.uptime_1d)}
										<tr
											class="border-t"
											class:row-baseline={baselineRow}
											class:row-pinned={pinnedRow}
										>
											<td class="px-2.5 py-2">
												<div class="flex items-center gap-1.5">
													{#if baselineRow}
														<span class="row-edge-bar"></span>
													{/if}
													<span class="text-[12px] font-medium">{p.provider || p.tag}</span>
													{#if baselineRow}
														<span
															class="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary"
														>
															{$_('admin.providerVerify.baselineBadge', { default: 'Baseline' })}
														</span>
													{/if}
													{#if pinnedRow}
														<span
															class="rounded bg-primary/25 px-1.5 py-0.5 text-[9px] font-bold uppercase text-primary"
														>
															{$_('admin.providerVerify.pinnedBadge', { default: 'Pinned' })}
														</span>
													{/if}
												</div>
											</td>
											<td class="px-2.5 py-2 text-right font-mono tabular-nums">
												{fmtPriceMTok(p.input)}
											</td>
											<td class="px-2.5 py-2 text-right font-mono tabular-nums">
												{fmtPriceMTok(p.output)}
											</td>
											<td class="px-2.5 py-2 text-right font-mono tabular-nums text-muted-foreground">
												{fmtPriceMTok(p.cache_read)}
											</td>
											<td class="px-2.5 py-2 text-right font-mono tabular-nums text-muted-foreground">
												{fmtPriceMTok(p.cache_write)}
											</td>
											<td
												class="px-2.5 py-2 text-right tabular-nums"
												class:uptime-ok={upColor === 'ok'}
												class:uptime-warn={upColor === 'warn'}
												class:uptime-muted={upColor === 'muted'}
											>
												{fmtUptime(p.uptime_1d)}
											</td>
											<td class="px-2.5 py-2 text-center">
												{#if p.quant}
													<span
														class="rounded border bg-background px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground"
													>
														{p.quant}
													</span>
												{:else}
													<span class="text-muted-foreground">—</span>
												{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{:else}
						<div
							class="rounded-md border bg-muted p-4 text-center text-xs text-muted-foreground"
							data-testid="provider-verify-no-providers"
						>
							{$_('admin.providerVerify.noProviders', { default: 'No provider data yet' })}
						</div>
					{/if}

					<!-- Edit footer toggle -->
					<div class="mt-4 flex items-center justify-end gap-2 border-t pt-3">
						<Button
							variant="outline"
							size="sm"
							class="px-3"
							onclick={toggleEdit}
							data-testid="provider-verify-edit-toggle"
							aria-expanded={editOpen}
						>
							<Edit class="h-3.5 w-3.5" />
							{$_('admin.providerVerify.editBtn', { default: 'Override price' })}
							<ChevronDown class="h-3.5 w-3.5 transition-transform {editOpen ? 'rotate-180' : ''}" />
						</Button>
					</div>

					<!-- Edit panel -->
					{#if editOpen}
						<div
							class="mt-3 rounded-md border border-primary/25 bg-primary/5 p-3"
							data-testid="provider-verify-edit-panel"
						>
							<h3
								class="m-0 mb-3 text-[11.5px] font-bold uppercase tracking-wider text-primary"
							>
								{$_('admin.providerVerify.panelTitle', { default: 'Edit price override' })}
							</h3>

							<!-- RadioGroup -->
							<div class="flex flex-col gap-2">
								<label
									class="radio-item"
									class:radio-active={mode === 'auto'}
									data-testid="provider-verify-mode-auto"
								>
									<Input
										type="radio"
										value="auto"
										checked={mode === 'auto'}
										onchange={() => (mode = 'auto')}
										class="sr-only"
									/>
									<span class="radio-dot"></span>
									<span class="text-[12.5px] font-semibold">
										{$_('admin.providerVerify.modeAuto', { default: 'Auto lowest price' })}
									</span>
									<span class="ml-auto text-[10.5px] text-muted-foreground">
										{$_('admin.providerVerify.modeAutoHint', { default: 'Restore default' })}
									</span>
								</label>

								<label
									class="radio-item"
									class:radio-active={mode === 'pinned'}
									data-testid="provider-verify-mode-pinned"
								>
									<Input
										type="radio"
										value="pinned"
										checked={mode === 'pinned'}
										onchange={() => (mode = 'pinned')}
										class="sr-only"
									/>
									<span class="radio-dot"></span>
									<span class="text-[12.5px] font-semibold">
										{$_('admin.providerVerify.modePinned', { default: 'Pin provider' })}
									</span>
								</label>

								{#if mode === 'pinned'}
									<NativeSelect
										class="ml-7 h-8 px-2 text-xs"
										bind:value={pinnedTag}
										data-testid="provider-verify-pinned-select"
									>
										<option value={PINNED_NONE} disabled hidden>
											{$_('admin.providerVerify.selectProviderPlaceholder', {
												default: '— select provider —'
											})}
										</option>
										{#each sortedProviders as p (p.tag)}
											<option value={p.tag}>
												{p.provider || p.tag} ({fmtPriceMTok(p.input)}/{fmtPriceMTok(p.output)})
											</option>
										{/each}
									</NativeSelect>
								{/if}

								<label
									class="radio-item"
									class:radio-active={mode === 'manual'}
									data-testid="provider-verify-mode-manual"
								>
									<Input
										type="radio"
										value="manual"
										checked={mode === 'manual'}
										onchange={() => (mode = 'manual')}
										class="sr-only"
									/>
									<span class="radio-dot"></span>
									<span class="text-[12.5px] font-semibold">
										{$_('admin.providerVerify.modeManual', { default: 'Manual input' })}
									</span>
									<span class="ml-auto text-[10.5px] text-muted-foreground">
										{$_('admin.providerVerify.modeManualHint', { default: 'per-MTok' })}
									</span>
								</label>

								{#if mode === 'manual'}
									<div class="ml-7 grid grid-cols-2 gap-2">
										<div class="flex flex-col gap-1">
											<label
												for="pvd-manual-input"
												class="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"
											>
												{$_('admin.providerVerify.fieldInput', { default: 'Input' })}
											</label>
											<div class="flex items-center gap-1">
												<span class="text-[10.5px] text-muted-foreground">$</span>
												<Input
													id="pvd-manual-input"
													type="text"
													inputmode="decimal"
													class="h-8 px-2 text-xs"
													placeholder={$_('admin.providerVerify.fieldPlaceholder', {
														default: 'leave blank'
													})}
													bind:value={manualInput}
													data-testid="provider-verify-manual-input"
												/>
												<span class="text-[10.5px] text-muted-foreground">/M</span>
											</div>
										</div>
										<div class="flex flex-col gap-1">
											<label
												for="pvd-manual-output"
												class="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"
											>
												{$_('admin.providerVerify.fieldOutput', { default: 'Output' })}
											</label>
											<div class="flex items-center gap-1">
												<span class="text-[10.5px] text-muted-foreground">$</span>
												<Input
													id="pvd-manual-output"
													type="text"
													inputmode="decimal"
													class="h-8 px-2 text-xs"
													placeholder={$_('admin.providerVerify.fieldPlaceholder', {
														default: 'leave blank'
													})}
													bind:value={manualOutput}
													data-testid="provider-verify-manual-output"
												/>
												<span class="text-[10.5px] text-muted-foreground">/M</span>
											</div>
										</div>
										<div class="flex flex-col gap-1">
											<label
												for="pvd-manual-cr"
												class="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"
											>
												{$_('admin.providerVerify.fieldCacheRead', { default: 'Cache Read' })}
											</label>
											<div class="flex items-center gap-1">
												<span class="text-[10.5px] text-muted-foreground">$</span>
												<Input
													id="pvd-manual-cr"
													type="text"
													inputmode="decimal"
													class="h-8 px-2 text-xs"
													placeholder={$_('admin.providerVerify.fieldPlaceholder', {
														default: 'leave blank'
													})}
													bind:value={manualCacheRead}
												/>
												<span class="text-[10.5px] text-muted-foreground">/M</span>
											</div>
										</div>
										<div class="flex flex-col gap-1">
											<label
												for="pvd-manual-cw"
												class="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"
											>
												{$_('admin.providerVerify.fieldCacheWrite', { default: 'Cache Write' })}
											</label>
											<div class="flex items-center gap-1">
												<span class="text-[10.5px] text-muted-foreground">$</span>
												<Input
													id="pvd-manual-cw"
													type="text"
													inputmode="decimal"
													class="h-8 px-2 text-xs"
													placeholder={$_('admin.providerVerify.fieldPlaceholder', {
														default: 'leave blank'
													})}
													bind:value={manualCacheWrite}
												/>
												<span class="text-[10.5px] text-muted-foreground">/M</span>
											</div>
										</div>
									</div>
								{/if}

								<!-- Note -->
								<div class="mt-2 flex flex-col gap-1">
									<label
										for="pvd-note"
										class="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground"
									>
										{$_('admin.providerVerify.noteLabel', { default: 'Note (optional)' })}
									</label>
									<Input
										id="pvd-note"
										type="text"
										maxlength={200}
										class="h-8 px-2 text-xs"
										placeholder={$_('admin.providerVerify.notePlaceholder', {
											default: 'e.g. negotiated rate'
										})}
										bind:value={note}
										data-testid="provider-verify-note"
									/>
								</div>

								<!-- Action row -->
								<div class="mt-2 flex items-center justify-end gap-2">
									{#if saveError}
										<span class="mr-auto truncate text-[11.5px] text-destructive" title={saveError}>
											{saveError}
										</span>
									{/if}
									{#if mode === 'auto'}
										{#if detail.overridden}
											<Button
												variant="outline"
												size="sm"
												class="border-destructive/40 bg-destructive/10 px-3 text-destructive hover:bg-destructive/20"
												onclick={handleRestore}
												disabled={saving}
												data-testid="provider-verify-restore"
											>
												<Trash2 class="h-3.5 w-3.5" />
												{$_('admin.providerVerify.restoreBtn', { default: 'Restore auto' })}
											</Button>
										{:else}
											<span class="text-[11px] text-muted-foreground">
												{$_('admin.providerVerify.modeAutoHint', {
													default: 'Already using auto pricing'
												})}
											</span>
										{/if}
									{:else}
										<Button
											size="sm"
											class="px-3"
											onclick={handleSave}
											disabled={saving || !canSave}
											data-testid="provider-verify-save"
										>
											<Save class="h-3.5 w-3.5" />
											{saving
												? $_('admin.providerVerify.saving', { default: 'Saving…' })
												: $_('admin.providerVerify.saveBtn', { default: 'Save' })}
										</Button>
									{/if}
								</div>
							</div>
						</div>
					{/if}
				{:else if !slug}
					<div class="p-6 text-center text-sm text-muted-foreground">
						{$_('admin.providerVerify.noSlug', { default: 'No model slug specified' })}
					</div>
				{/if}

				{#if syncing}
					<div
						class="mt-3 flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-xs text-muted-foreground"
						data-testid="provider-verify-syncing"
					>
						<RefreshCw class="h-3.5 w-3.5 animate-spin text-primary" />
						{$_('admin.providerVerify.syncing', { default: 'Syncing provider prices…' })}
					</div>
				{/if}
			</div>
		</StandardDrawer>

<style>
	.baseline-band-default {
		background: hsl(var(--primary) / 0.08);
		border-color: hsl(var(--primary) / 0.2);
	}
	.baseline-band-overridden {
		background: hsl(var(--primary) / 0.13);
		border-color: hsl(var(--primary) / 0.35);
	}
	.row-baseline {
		background: hsl(var(--primary) / 0.07);
	}
	.row-baseline:hover {
		background: hsl(var(--primary) / 0.12);
	}
	.row-pinned {
		background: hsl(var(--primary) / 0.1);
	}
	.row-pinned:hover {
		background: hsl(var(--primary) / 0.16);
	}
	.row-edge-bar {
		display: inline-block;
		width: 3px;
		height: 16px;
		border-radius: 2px;
		background: hsl(var(--primary));
		flex-shrink: 0;
	}
	.uptime-ok {
		color: #46c98c;
	}
	.uptime-warn {
		color: #f4a64a;
	}
	.uptime-muted {
		color: hsl(var(--muted-foreground));
	}
	.line-clamp-3 {
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.radio-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border-radius: 8px;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--muted));
		cursor: pointer;
		transition:
			border-color 0.14s,
			background 0.14s;
	}
	.radio-item:hover {
		border-color: hsl(var(--input));
		background: hsl(var(--card));
	}
	.radio-active {
		border-color: hsl(var(--primary) / 0.4) !important;
		background: hsl(var(--primary) / 0.07) !important;
	}
	.radio-dot {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: 2px solid hsl(var(--input));
		flex-shrink: 0;
		transition:
			border-color 0.14s,
			background 0.14s;
	}
	.radio-active .radio-dot {
		border-color: hsl(var(--primary));
		background: hsl(var(--primary));
		box-shadow: 0 0 0 3px hsl(var(--primary) / 0.18);
	}
</style>
