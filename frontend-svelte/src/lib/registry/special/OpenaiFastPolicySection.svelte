<script lang="ts">
	/**
	 * OpenaiFastPolicySection · OpenAI fast/flex service_tier 策略列表（M10e · gateway tab）
	 *
	 * 端口自 frontend/src/views/admin/settings-registry/special/OpenaiFastPolicySection.vue。
	 *
	 * 契约：
	 *   - 与 flat-form 同流水线 —— 整组 rules 以 flat key
	 *     `openai_fast_policy_settings = { rules: [...] }` 上抛父级。
	 *   - 父级 reset / 拉新快照时 $effect 检测并刷新本地副本。
	 *   - 之所以是 special：rule 是复合对象，FieldRenderer 9 类原子字段无法表达；
	 *     用 special 把"卡片化 CRUD + cascading subfields"包成黑盒。
	 *   - select 严格 sentinel-safe —— 所有 value 是具体语义值。
 */
	import { _ } from 'svelte-i18n';
	import { X } from '@lucide/svelte';
	import type { OpenAIFastPolicyRule } from '$lib/api/admin/settingsRegistry';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';

	type FieldUpdate = { key: string; value: unknown };

	type Props = {
		values: Record<string, unknown>;
		dirtyKeys?: Set<string>;
		onFieldUpdate?: (e: FieldUpdate) => void;
	};

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { values, dirtyKeys: _d, onFieldUpdate }: Props = $props();

	function parseRules(raw: unknown): OpenAIFastPolicyRule[] {
		if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
			const obj = raw as Record<string, unknown>;
			if (Array.isArray(obj['rules'])) {
				return (obj['rules'] as OpenAIFastPolicyRule[]).map((rule) => ({
					...rule,
					model_whitelist: rule.model_whitelist ? [...rule.model_whitelist] : []
				}));
			}
		}
		return [];
	}

	let localRules = $state<OpenAIFastPolicyRule[]>([]);
	let _initialized = false;

	$effect(() => {
		const incoming = parseRules(values['openai_fast_policy_settings']);
		if (!_initialized) {
			localRules = incoming;
			_initialized = true;
			return;
		}
		if (JSON.stringify(incoming) !== JSON.stringify(localRules)) {
			localRules = incoming;
		}
	});

	function emit() {
		const cleaned = localRules.map((rule) => {
			const whitelist = (rule.model_whitelist ?? [])
				.map((p) => p.trim())
				.filter((p) => p !== '');
			const hasWhitelist = whitelist.length > 0;
			return {
				service_tier: rule.service_tier,
				action: rule.action,
				scope: rule.scope,
				error_message: rule.action === 'block' ? rule.error_message : undefined,
				model_whitelist: hasWhitelist ? whitelist : undefined,
				fallback_action: hasWhitelist ? rule.fallback_action ?? 'pass' : undefined,
				fallback_error_message:
					hasWhitelist && rule.fallback_action === 'block'
						? rule.fallback_error_message
						: undefined
			} satisfies OpenAIFastPolicyRule;
		});
		onFieldUpdate?.({
			key: 'openai_fast_policy_settings',
			value: { rules: cleaned }
		});
	}

	function updateRule(index: number, patch: Partial<OpenAIFastPolicyRule>) {
		localRules = localRules.map((r, i) => (i === index ? { ...r, ...patch } : r));
		emit();
	}

	function addRule() {
		localRules = [
			...localRules,
			{
				service_tier: 'priority',
				action: 'filter',
				scope: 'all',
				error_message: '',
				model_whitelist: [],
				fallback_action: 'pass',
				fallback_error_message: ''
			}
		];
		emit();
	}

	function removeRule(index: number) {
		localRules = localRules.filter((_, i) => i !== index);
		emit();
	}

	function onTierChange(index: number, e: Event) {
		updateRule(index, {
			service_tier: (e.target as HTMLSelectElement)
				.value as OpenAIFastPolicyRule['service_tier']
		});
	}

	function onActionChange(index: number, e: Event) {
		updateRule(index, {
			action: (e.target as HTMLSelectElement).value as OpenAIFastPolicyRule['action']
		});
	}

	function onScopeChange(index: number, e: Event) {
		updateRule(index, {
			scope: (e.target as HTMLSelectElement).value as OpenAIFastPolicyRule['scope']
		});
	}

	function onFallbackChange(index: number, e: Event) {
		updateRule(index, {
			fallback_action: (e.target as HTMLSelectElement)
				.value as OpenAIFastPolicyRule['fallback_action']
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
		const r = localRules[ruleIndex];
		const list = r.model_whitelist ?? [];
		updateRule(ruleIndex, {
			model_whitelist: list.map((p, i) => (i === patternIndex ? raw : p))
		});
	}

	function addWhitelistPattern(ruleIndex: number) {
		const r = localRules[ruleIndex];
		updateRule(ruleIndex, {
			model_whitelist: [...(r.model_whitelist ?? []), '']
		});
	}

	function removeWhitelistPattern(ruleIndex: number, patternIndex: number) {
		const r = localRules[ruleIndex];
		updateRule(ruleIndex, {
			model_whitelist: (r.model_whitelist ?? []).filter((_, i) => i !== patternIndex)
		});
	}
</script>

<div class="flex flex-col gap-4" data-special="openai-fast-policy">
	{#if localRules.length === 0}
		<p
			data-testid="openai-fast-policy-empty"
			class="m-0 rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
		>
			{$_('admin.settings.openaiFastPolicy.empty')}
		</p>
	{/if}

	{#each localRules as rule, index (index)}
		<div
			data-testid="openai-fast-policy-rule"
			data-rule-index={index}
			class="flex flex-col gap-3 rounded-md border border-border p-4"
		>
			<div class="flex items-center justify-between gap-2">
				<span class="text-sm font-semibold text-foreground">
					{$_('admin.settings.openaiFastPolicy.ruleHeader').replace(
						'{index}',
						String(index + 1)
					)}
				</span>
				<Button
					variant="ghost"
					size="icon"
					data-testid="openai-fast-policy-remove"
					aria-label={$_('admin.settings.openaiFastPolicy.removeRule')}
					onclick={() => removeRule(index)}
					class="h-7 w-7 text-muted-foreground hover:border-destructive/25 hover:bg-destructive/10 hover:text-destructive"
				>
					<X class="h-3 w-3" />
				</Button>
			</div>

			<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
				<div class="flex flex-col gap-1">
					<label
						class="text-xs font-medium text-muted-foreground"
						for="openai-fast-policy-tier-{index}"
					>
						{$_('admin.settings.openaiFastPolicy.serviceTier')}
					</label>
					<NativeSelect
						id="openai-fast-policy-tier-{index}"
						data-testid="openai-fast-policy-tier"
						value={rule.service_tier}
						onchange={(e) => onTierChange(index, e)}
						class="h-9 w-full"
					>
						<option value="all">{$_('admin.settings.openaiFastPolicy.tierAll')}</option>
						<option value="priority"
							>{$_('admin.settings.openaiFastPolicy.tierPriority')}</option
						>
						<option value="flex">{$_('admin.settings.openaiFastPolicy.tierFlex')}</option>
					</NativeSelect>
				</div>

				<div class="flex flex-col gap-1">
					<label
						class="text-xs font-medium text-muted-foreground"
						for="openai-fast-policy-action-{index}"
					>
						{$_('admin.settings.openaiFastPolicy.action')}
					</label>
					<NativeSelect
						id="openai-fast-policy-action-{index}"
						data-testid="openai-fast-policy-action"
						value={rule.action}
						onchange={(e) => onActionChange(index, e)}
						class="h-9 w-full"
					>
						<option value="pass"
							>{$_('admin.settings.openaiFastPolicy.actionPass')}</option
						>
						<option value="filter"
							>{$_('admin.settings.openaiFastPolicy.actionFilter')}</option
						>
						<option value="block"
							>{$_('admin.settings.openaiFastPolicy.actionBlock')}</option
						>
					</NativeSelect>
				</div>

				<div class="flex flex-col gap-1">
					<label
						class="text-xs font-medium text-muted-foreground"
						for="openai-fast-policy-scope-{index}"
					>
						{$_('admin.settings.openaiFastPolicy.scope')}
					</label>
					<NativeSelect
						id="openai-fast-policy-scope-{index}"
						data-testid="openai-fast-policy-scope"
						value={rule.scope}
						onchange={(e) => onScopeChange(index, e)}
						class="h-9 w-full"
					>
						<option value="all">{$_('admin.settings.openaiFastPolicy.scopeAll')}</option>
						<option value="oauth"
							>{$_('admin.settings.openaiFastPolicy.scopeOAuth')}</option
						>
						<option value="apikey"
							>{$_('admin.settings.openaiFastPolicy.scopeAPIKey')}</option
						>
						<option value="bedrock"
							>{$_('admin.settings.openaiFastPolicy.scopeBedrock')}</option
						>
					</NativeSelect>
				</div>
			</div>

			{#if rule.action === 'block'}
				<div class="flex flex-col gap-1">
					<label
						class="text-xs font-medium text-muted-foreground"
						for="openai-fast-policy-error-message-{index}"
					>
						{$_('admin.settings.openaiFastPolicy.errorMessage')}
					</label>
					<Input
						id="openai-fast-policy-error-message-{index}"
						type="text"
						data-testid="openai-fast-policy-error-message"
						placeholder={$_('admin.settings.openaiFastPolicy.errorMessagePlaceholder')}
						value={rule.error_message ?? ''}
						oninput={(e) => onErrorMessageInput(index, e)}
						class="h-9"
					/>
					<p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
						{$_('admin.settings.openaiFastPolicy.errorMessageHint')}
					</p>
				</div>
			{/if}

			<div class="flex flex-col gap-1">
				<label
					class="text-xs font-medium text-muted-foreground"
					for="openai-fast-policy-whitelist-{index}-0"
				>
					{$_('admin.settings.openaiFastPolicy.modelWhitelist')}
				</label>
				<p class="m-0 text-xs leading-relaxed text-muted-foreground">
					{$_('admin.settings.openaiFastPolicy.modelWhitelistHint')}
				</p>
				{#each rule.model_whitelist ?? [] as pattern, pIdx (pIdx)}
					<div
						data-testid="openai-fast-policy-whitelist-row"
						class="flex items-center gap-2"
					>
						<Input
							id="openai-fast-policy-whitelist-{index}-{pIdx}"
							type="text"
							data-testid="openai-fast-policy-whitelist-input"
							placeholder={$_('admin.settings.openaiFastPolicy.modelPatternPlaceholder')}
							value={pattern}
							oninput={(e) => onWhitelistInput(index, pIdx, e)}
							class="h-8 flex-1 font-mono text-xs"
						/>
						<Button
							variant="ghost"
							size="icon"
							data-testid="openai-fast-policy-whitelist-remove"
							aria-label={$_('common.delete')}
							onclick={() => removeWhitelistPattern(index, pIdx)}
							class="h-7 w-7 text-muted-foreground hover:border-destructive/25 hover:bg-destructive/10 hover:text-destructive"
						>
							<X class="h-3 w-3" />
						</Button>
					</div>
				{/each}
				<Button
					variant="outline"
					size="sm"
					data-testid="openai-fast-policy-whitelist-add"
					onclick={() => addWhitelistPattern(index)}
					class="w-fit"
				>
					+ {$_('admin.settings.openaiFastPolicy.addModelPattern')}
				</Button>
			</div>

			{#if (rule.model_whitelist ?? []).length > 0}
				<div class="flex flex-col gap-1">
					<label
						class="text-xs font-medium text-muted-foreground"
						for="openai-fast-policy-fallback-{index}"
					>
						{$_('admin.settings.openaiFastPolicy.fallbackAction')}
					</label>
					<NativeSelect
						id="openai-fast-policy-fallback-{index}"
						data-testid="openai-fast-policy-fallback"
						value={rule.fallback_action ?? 'pass'}
						onchange={(e) => onFallbackChange(index, e)}
						class="h-9 w-full"
					>
						<option value="pass"
							>{$_('admin.settings.openaiFastPolicy.actionPass')}</option
						>
						<option value="filter"
							>{$_('admin.settings.openaiFastPolicy.actionFilter')}</option
						>
						<option value="block"
							>{$_('admin.settings.openaiFastPolicy.actionBlock')}</option
						>
					</NativeSelect>
					<p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
						{$_('admin.settings.openaiFastPolicy.fallbackActionHint')}
					</p>
					{#if rule.fallback_action === 'block'}
						<Input
							type="text"
							data-testid="openai-fast-policy-fallback-error-message"
							placeholder={$_(
								'admin.settings.openaiFastPolicy.fallbackErrorMessagePlaceholder'
							)}
							value={rule.fallback_error_message ?? ''}
							oninput={(e) => onFallbackErrorInput(index, e)}
							class="mt-1 h-9"
						/>
					{/if}
				</div>
			{/if}
		</div>
	{/each}

	<div class="flex flex-col gap-1.5">
		<Button
			variant="outline"
			data-testid="openai-fast-policy-add"
			onclick={addRule}
			class="h-9 w-fit"
		>
			+ {$_('admin.settings.openaiFastPolicy.addRule')}
		</Button>
		<p class="m-0 text-xs leading-relaxed text-muted-foreground">
			{$_('admin.settings.openaiFastPolicy.saveHint')}
		</p>
	</div>
</div>
