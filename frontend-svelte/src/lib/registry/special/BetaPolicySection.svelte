<script lang="ts">
	/**
	 * BetaPolicySection · Anthropic Beta token 策略矩阵（M10e · gateway tab）
	 *
	 * 端口自 frontend/src/views/admin/settings-registry/special/BetaPolicySection.vue。
	 *
	 * 设计：
	 *   - 与 flat-form 解耦 —— onMount GET /api/admin/settings/beta-policy，
	 *     Save 触发 PUT 整体替换；不进 patchSettings 流水线。
	 *   - 服务端返回 rules: BetaPolicyRule[]；rules 数量与 beta_token 固定（来自上游）。
	 *   - select 严格 sentinel-safe —— 所有 value 是具体语义值（pass/filter/block;all/oauth/apikey/bedrock）。
	 *   - 简化：略去 quick presets（Vue tree 临时实验态），保留 model_whitelist 与
	 *     fallback_action 主流程。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import {
		settingsApi,
		type BetaPolicyRule
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

	let loading = $state(true);
	let saving = $state(false);
	let rules = $state<BetaPolicyRule[]>([]);

	const BETA_DISPLAY_NAMES: Record<string, string> = {
		'fast-mode-2026-02-01': 'Fast Mode',
		'context-1m-2025-08-07': 'Context 1M'
	};

	function displayName(token: string): string {
		return BETA_DISPLAY_NAMES[token] ?? token;
	}

	onMount(async () => {
		loading = true;
		try {
			const settings = await settingsApi.getBetaPolicySettings();
			rules = (settings.rules ?? []).map((r) => ({
				...r,
				model_whitelist: r.model_whitelist ? [...r.model_whitelist] : []
			}));
		} catch {
			// 静默
		} finally {
			loading = false;
		}
	});

	function updateRule(index: number, patch: Partial<BetaPolicyRule>) {
		rules = rules.map((r, i) => (i === index ? { ...r, ...patch } : r));
	}

	function onActionChange(index: number, e: Event) {
		updateRule(index, {
			action: (e.target as HTMLSelectElement).value as BetaPolicyRule['action']
		});
	}

	function onScopeChange(index: number, e: Event) {
		updateRule(index, {
			scope: (e.target as HTMLSelectElement).value as BetaPolicyRule['scope']
		});
	}

	function onFallbackChange(index: number, e: Event) {
		updateRule(index, {
			fallback_action: (e.target as HTMLSelectElement)
				.value as BetaPolicyRule['fallback_action']
		});
	}

	function onErrorMessageInput(index: number, e: Event) {
		updateRule(index, { error_message: (e.target as HTMLInputElement).value });
	}

	function onFallbackErrorInput(index: number, e: Event) {
		updateRule(index, { fallback_error_message: (e.target as HTMLInputElement).value });
	}

	function onWhitelistInput(ruleIndex: number, patternIndex: number, e: Event) {
		const raw = (e.target as HTMLInputElement).value;
		const r = rules[ruleIndex];
		const list = r.model_whitelist ?? [];
		const next = list.map((p, i) => (i === patternIndex ? raw : p));
		updateRule(ruleIndex, { model_whitelist: next });
	}

	function addWhitelistPattern(ruleIndex: number) {
		const r = rules[ruleIndex];
		updateRule(ruleIndex, {
			model_whitelist: [...(r.model_whitelist ?? []), '']
		});
	}

	function removeWhitelistPattern(ruleIndex: number, patternIndex: number) {
		const r = rules[ruleIndex];
		const next = (r.model_whitelist ?? []).filter((_, i) => i !== patternIndex);
		updateRule(ruleIndex, { model_whitelist: next });
	}

	async function save() {
		saving = true;
		try {
			const cleaned = rules.map((rule) => {
				const whitelist = (rule.model_whitelist ?? [])
					.map((p) => p.trim())
					.filter((p) => p !== '');
				const hasWhitelist = whitelist.length > 0;
				return {
					beta_token: rule.beta_token,
					action: rule.action,
					scope: rule.scope,
					error_message: rule.action === 'block' ? rule.error_message : undefined,
					model_whitelist: hasWhitelist ? whitelist : undefined,
					fallback_action: hasWhitelist ? rule.fallback_action ?? 'pass' : undefined,
					fallback_error_message:
						hasWhitelist && rule.fallback_action === 'block'
							? rule.fallback_error_message
							: undefined
				} satisfies BetaPolicyRule;
			});
			const updated = await settingsApi.updateBetaPolicySettings({ rules: cleaned });
			rules = (updated.rules ?? []).map((r) => ({
				...r,
				model_whitelist: r.model_whitelist ? [...r.model_whitelist] : []
			}));
			showSuccess($_('admin.settings.betaPolicy.saved'));
		} catch (err) {
			showError(
				err instanceof Error ? err.message : $_('admin.settings.betaPolicy.saveFailed')
			);
		} finally {
			saving = false;
		}
	}
</script>

<div class="flex flex-col gap-4" data-special="beta-policy">
	{#if loading}
		<div
			data-testid="beta-policy-loading"
			class="flex items-center gap-2 text-sm text-muted-foreground"
		>
			{$_('common.loading')}
		</div>
	{:else if rules.length === 0}
		<p
			data-testid="beta-policy-empty"
			class="m-0 rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
		>
			{$_('admin.settings.betaPolicy.description')}
		</p>
	{:else}
		{#each rules as rule, index (rule.beta_token)}
			<div
				data-testid="beta-policy-rule"
				data-beta-token={rule.beta_token}
				class="flex flex-col gap-3 rounded-md border border-border p-4"
			>
				<div class="flex flex-wrap items-center gap-2">
					<span class="text-sm font-semibold text-foreground">
						{displayName(rule.beta_token)}
					</span>
					<span
						class="rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
					>
						{rule.beta_token}
					</span>
				</div>

				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<div class="flex flex-col gap-1">
						<label
							class="text-xs font-medium text-muted-foreground"
							for="beta-policy-action-{index}"
						>
							{$_('admin.settings.betaPolicy.action')}
						</label>
						<select
							id="beta-policy-action-{index}"
							data-testid="beta-policy-action"
							value={rule.action}
							onchange={(e) => onActionChange(index, e)}
							class="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
						>
							<option value="pass">{$_('admin.settings.betaPolicy.actionPass')}</option>
							<option value="filter">{$_('admin.settings.betaPolicy.actionFilter')}</option>
							<option value="block">{$_('admin.settings.betaPolicy.actionBlock')}</option>
						</select>
					</div>

					<div class="flex flex-col gap-1">
						<label
							class="text-xs font-medium text-muted-foreground"
							for="beta-policy-scope-{index}"
						>
							{$_('admin.settings.betaPolicy.scope')}
						</label>
						<select
							id="beta-policy-scope-{index}"
							data-testid="beta-policy-scope"
							value={rule.scope}
							onchange={(e) => onScopeChange(index, e)}
							class="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
						>
							<option value="all">{$_('admin.settings.betaPolicy.scopeAll')}</option>
							<option value="oauth">{$_('admin.settings.betaPolicy.scopeOAuth')}</option>
							<option value="apikey">{$_('admin.settings.betaPolicy.scopeAPIKey')}</option>
							<option value="bedrock">{$_('admin.settings.betaPolicy.scopeBedrock')}</option>
						</select>
					</div>
				</div>

				{#if rule.action === 'block'}
					<div class="flex flex-col gap-1">
						<label
							class="text-xs font-medium text-muted-foreground"
							for="beta-policy-error-message-{index}"
						>
							{$_('admin.settings.betaPolicy.errorMessage')}
						</label>
						<input
							id="beta-policy-error-message-{index}"
							type="text"
							data-testid="beta-policy-error-message"
							placeholder={$_('admin.settings.betaPolicy.errorMessagePlaceholder')}
							value={rule.error_message ?? ''}
							oninput={(e) => onErrorMessageInput(index, e)}
							class="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
						/>
						<p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
							{$_('admin.settings.betaPolicy.errorMessageHint')}
						</p>
					</div>
				{/if}

				<div class="flex flex-col gap-1">
					<label class="text-xs font-medium text-muted-foreground" for="beta-policy-whitelist-{index}">
						{$_('admin.settings.betaPolicy.modelWhitelist')}
					</label>
					<p class="m-0 text-xs leading-relaxed text-muted-foreground">
						{$_('admin.settings.betaPolicy.modelWhitelistHint')}
					</p>
					{#each rule.model_whitelist ?? [] as pattern, pIdx (pIdx)}
						<div
							data-testid="beta-policy-whitelist-row"
							class="flex items-center gap-2"
						>
							<input
								id="beta-policy-whitelist-{index}-{pIdx}"
								type="text"
								data-testid="beta-policy-whitelist-input"
								placeholder={$_('admin.settings.betaPolicy.modelPatternPlaceholder')}
								value={pattern}
								oninput={(e) => onWhitelistInput(index, pIdx, e)}
								class="h-8 flex-1 rounded-md border border-input bg-background px-3 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring"
							/>
							<button
								type="button"
								data-testid="beta-policy-whitelist-remove"
								aria-label={$_('admin.settings.betaPolicy.removePattern')}
								onclick={() => removeWhitelistPattern(index, pIdx)}
								class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground hover:border-destructive/25 hover:bg-destructive/10 hover:text-destructive"
							>
								✕
							</button>
						</div>
					{/each}
					<button
						type="button"
						data-testid="beta-policy-whitelist-add"
						onclick={() => addWhitelistPattern(index)}
						class="inline-flex h-8 w-fit items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs hover:bg-accent"
					>
						+ {$_('admin.settings.betaPolicy.addModelPattern')}
					</button>
				</div>

				{#if (rule.model_whitelist ?? []).length > 0}
					<div class="flex flex-col gap-1">
						<label
							class="text-xs font-medium text-muted-foreground"
							for="beta-policy-fallback-{index}"
						>
							{$_('admin.settings.betaPolicy.fallbackAction')}
						</label>
						<select
							id="beta-policy-fallback-{index}"
							data-testid="beta-policy-fallback"
							value={rule.fallback_action ?? 'pass'}
							onchange={(e) => onFallbackChange(index, e)}
							class="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
						>
							<option value="pass">{$_('admin.settings.betaPolicy.actionPass')}</option>
							<option value="filter">{$_('admin.settings.betaPolicy.actionFilter')}</option>
							<option value="block">{$_('admin.settings.betaPolicy.actionBlock')}</option>
						</select>
						<p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
							{$_('admin.settings.betaPolicy.fallbackActionHint')}
						</p>
						{#if rule.fallback_action === 'block'}
							<input
								type="text"
								data-testid="beta-policy-fallback-error-message"
								placeholder={$_('admin.settings.betaPolicy.fallbackErrorMessagePlaceholder')}
								value={rule.fallback_error_message ?? ''}
								oninput={(e) => onFallbackErrorInput(index, e)}
								class="mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
							/>
						{/if}
					</div>
				{/if}
			</div>
		{/each}

		<div class="flex justify-end border-t border-border pt-4">
			<button
				type="button"
				data-testid="beta-policy-save"
				disabled={saving}
				onclick={save}
				class="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm hover:bg-accent disabled:opacity-50"
			>
				{saving ? $_('common.saving') : $_('common.save')}
			</button>
		</div>
	{/if}
</div>
