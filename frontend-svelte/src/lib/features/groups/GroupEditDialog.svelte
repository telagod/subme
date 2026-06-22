<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import {
		createGroup,
		getModelsListCandidates,
		updateGroup,
		type AdminGroup,
		type OpenAIMessagesDispatchModelConfig,
		type SaveGroupPayload
	} from '$lib/api/admin/groups';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';

	interface Props {
		open: boolean;
		editing: AdminGroup | null;
		rows: AdminGroup[];
		onClose: () => void;
		onSaved: () => void;
	}

	let { open = $bindable(), editing, rows, onClose, onSaved }: Props = $props();

	const PLATFORM_OPTIONS = ['anthropic', 'openai', 'gemini', 'antigravity'];
	const formPlatformOptions = $derived(PLATFORM_OPTIONS.map((value) => ({ value, label: value })));
	const formStatusOptions = [
		{ value: 'active', label: 'active' },
		{ value: 'inactive', label: 'inactive' }
	];
	const SUPPORTED_MODEL_SCOPE_OPTIONS = [
		{ value: 'claude', label: 'Claude text' },
		{ value: 'gemini_text', label: 'Gemini text' },
		{ value: 'gemini_image', label: 'Gemini image' }
	];
	const DEFAULT_SUPPORTED_MODEL_SCOPES = SUPPORTED_MODEL_SCOPE_OPTIONS.map((option) => option.value);
	const MESSAGE_DISPATCH_DEFAULTS = {
		opus_mapped_model: 'gpt-5.4',
		sonnet_mapped_model: 'gpt-5.3-codex',
		haiku_mapped_model: 'gpt-5.4-mini'
	};
	type ModelsListItem = { id: string; selected: boolean };
	type ModelRoutingRule = { pattern: string; accountIdsText: string };

	let saving = $state(false);
	let formPlatform = $state('anthropic');
	let formStatus = $state('active');
	let modelsListEnabled = $state(false);
	let modelsListText = $state('');
	let modelsListItems = $state<ModelsListItem[]>([]);
	let modelsListLoading = $state(false);
	let messagesDispatchEnabled = $state(false);
	let messagesOpusModel = $state(MESSAGE_DISPATCH_DEFAULTS.opus_mapped_model);
	let messagesSonnetModel = $state(MESSAGE_DISPATCH_DEFAULTS.sonnet_mapped_model);
	let messagesHaikuModel = $state(MESSAGE_DISPATCH_DEFAULTS.haiku_mapped_model);
	let messagesExactMappingsText = $state('');
	let modelRoutingEnabled = $state(false);
	let modelRoutingRules = $state<ModelRoutingRule[]>([]);
	let copyAccountsGroupIds = $state<number[]>([]);
	let copyAccountsSelect = $state('__none__');
	let form = $state<SaveGroupPayload>({
		name: '',
		description: '',
		platform: 'anthropic',
		status: 'active',
		rate_multiplier: 1,
		is_exclusive: false,
		subscription_type: 'standard',
		daily_limit_usd: null,
		weekly_limit_usd: null,
		monthly_limit_usd: null,
		allow_image_generation: false,
		image_rate_independent: false,
		image_rate_multiplier: 1,
		image_price_1k: null,
		image_price_2k: null,
		image_price_4k: null,
		claude_code_only: false,
		fallback_group_id: null,
		fallback_group_id_on_invalid_request: null,
		require_oauth_only: false,
		require_privacy_set: false,
		mcp_xml_inject: true,
		supported_model_scopes: [...DEFAULT_SUPPORTED_MODEL_SCOPES]
	});

	const copyAccountsOptions = $derived(
		rows
			.filter((row) => row.platform === formPlatform && row.id !== editing?.id && Number(row.total_accounts ?? row.available_accounts ?? 0) > 0)
			.map((row) => ({
				value: String(row.id),
				label: `${row.name} (${Number(row.total_accounts ?? row.available_accounts ?? 0)} accounts)`
			}))
	);
	const copyAccountsSelectOptions = $derived([{ value: '__none__', label: 'Select source group' }, ...copyAccountsOptions]);

	export function openCreate(platformFilter: string) {
		form = {
			name: '',
			description: '',
			platform: platformFilter === '__all__' ? 'anthropic' : platformFilter,
			status: 'active',
			rate_multiplier: 1,
			is_exclusive: false,
			subscription_type: 'standard',
			daily_limit_usd: null,
			weekly_limit_usd: null,
			monthly_limit_usd: null,
			allow_image_generation: false,
			image_rate_independent: false,
			image_rate_multiplier: 1,
			image_price_1k: null,
			image_price_2k: null,
			image_price_4k: null,
			claude_code_only: false,
			fallback_group_id: null,
			fallback_group_id_on_invalid_request: null,
			require_oauth_only: false,
			require_privacy_set: false,
			mcp_xml_inject: true,
			supported_model_scopes: [...DEFAULT_SUPPORTED_MODEL_SCOPES]
		};
		formPlatform = form.platform ?? 'anthropic';
		formStatus = form.status ?? 'active';
		modelsListEnabled = false;
		modelsListText = '';
		modelsListItems = [];
		resetMessagesDispatch(null, false);
		modelRoutingEnabled = false;
		modelRoutingRules = [];
		copyAccountsGroupIds = [];
		copyAccountsSelect = '__none__';
		void loadModelsListCandidatesForForm(0, formPlatform);
		open = true;
	}

	export function openEdit(group: AdminGroup) {
		form = {
			name: group.name,
			description: group.description ?? '',
			platform: group.platform,
			status: group.status,
			rate_multiplier: Number(group.rate_multiplier ?? 1),
			max_concurrent_requests: group.max_concurrent_requests ?? null,
			rpm_limit: group.rpm_limit ?? null,
			is_exclusive: group.is_exclusive ?? false,
			subscription_type: group.subscription_type ?? 'standard',
			daily_limit_usd: group.daily_limit_usd ?? null,
			weekly_limit_usd: group.weekly_limit_usd ?? null,
			monthly_limit_usd: group.monthly_limit_usd ?? null,
			allow_image_generation: group.allow_image_generation ?? false,
			image_rate_independent: group.image_rate_independent ?? false,
			image_rate_multiplier: group.image_rate_multiplier ?? 1,
			image_price_1k: group.image_price_1k ?? null,
			image_price_2k: group.image_price_2k ?? null,
			image_price_4k: group.image_price_4k ?? null,
			claude_code_only: group.claude_code_only ?? false,
			fallback_group_id: group.fallback_group_id ?? null,
			fallback_group_id_on_invalid_request: group.fallback_group_id_on_invalid_request ?? null,
			require_oauth_only: group.require_oauth_only ?? false,
			require_privacy_set: group.require_privacy_set ?? false,
			mcp_xml_inject: group.mcp_xml_inject ?? true,
			supported_model_scopes: group.supported_model_scopes?.length
				? [...group.supported_model_scopes]
				: [...DEFAULT_SUPPORTED_MODEL_SCOPES]
		};
		formPlatform = form.platform ?? 'anthropic';
		formStatus = form.status ?? 'active';
		modelsListEnabled = Boolean(group.models_list_config?.enabled);
		modelsListText = (group.models_list_config?.models ?? []).join('\n');
		modelsListItems = createModelsListItems(group.models_list_config?.models ?? [], []);
		resetMessagesDispatch(group.messages_dispatch_model_config, Boolean(group.allow_messages_dispatch));
		modelRoutingEnabled = Boolean(group.model_routing_enabled);
		modelRoutingRules = routingRulesFromConfig(group.model_routing);
		copyAccountsGroupIds = [];
		copyAccountsSelect = '__none__';
		void loadModelsListCandidatesForForm(group.id, formPlatform);
		open = true;
	}

	// ── helpers ──────────────────────────────────────────────────────────────

	function modelScopeEnabled(scope: string) {
		return Array.isArray(form.supported_model_scopes) && form.supported_model_scopes.includes(scope);
	}

	function toggleModelScope(scope: string, checked: boolean) {
		const current = Array.isArray(form.supported_model_scopes) ? form.supported_model_scopes : [];
		form.supported_model_scopes = checked ? [...new Set([...current, scope])] : current.filter((item) => item !== scope);
	}

	function handleFormPlatformChange() {
		form.platform = formPlatform;
		copyAccountsGroupIds = [];
		copyAccountsSelect = '__none__';
		void loadModelsListCandidatesForForm(editing?.id ?? 0, formPlatform);
	}

	function handleModelScopeChange(scope: string, event: Event) {
		toggleModelScope(scope, (event.currentTarget as HTMLInputElement).checked);
	}

	function optionalNumber(value: unknown) {
		if (value === '' || value == null) return null;
		const numeric = Number(value);
		return Number.isFinite(numeric) ? numeric : null;
	}

	function imageMultiplier(value: unknown) {
		const numeric = optionalNumber(value);
		return numeric != null && numeric >= 0 ? numeric : 1;
	}

	function optionalIdForPayload(value: unknown) {
		const numeric = optionalNumber(value);
		return numeric != null && numeric > 0 ? numeric : 0;
	}

	function resetMessagesDispatch(config?: OpenAIMessagesDispatchModelConfig | null, enabled = false) {
		messagesDispatchEnabled = enabled;
		messagesOpusModel = config?.opus_mapped_model?.trim() || MESSAGE_DISPATCH_DEFAULTS.opus_mapped_model;
		messagesSonnetModel = config?.sonnet_mapped_model?.trim() || MESSAGE_DISPATCH_DEFAULTS.sonnet_mapped_model;
		messagesHaikuModel = config?.haiku_mapped_model?.trim() || MESSAGE_DISPATCH_DEFAULTS.haiku_mapped_model;
		messagesExactMappingsText = Object.entries(config?.exact_model_mappings ?? {})
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([claudeModel, targetModel]) => `${claudeModel}=${targetModel}`)
			.join('\n');
	}

	function parseMessagesExactMappings() {
		const mappings: Record<string, string> = {};
		for (const raw of messagesExactMappingsText.split('\n')) {
			const line = raw.trim();
			if (!line) continue;
			const separator = line.includes('=>') ? '=>' : '=';
			const index = line.indexOf(separator);
			if (index <= 0) continue;
			const claudeModel = line.slice(0, index).trim();
			const targetModel = line.slice(index + separator.length).trim();
			if (claudeModel && targetModel) mappings[claudeModel] = targetModel;
		}
		return mappings;
	}

	function messagesDispatchConfig(): OpenAIMessagesDispatchModelConfig {
		return {
			opus_mapped_model: messagesOpusModel.trim(),
			sonnet_mapped_model: messagesSonnetModel.trim(),
			haiku_mapped_model: messagesHaikuModel.trim(),
			exact_model_mappings: parseMessagesExactMappings()
		};
	}

	function parsePositiveIds(text: string) {
		const ids: number[] = [];
		const seen = new Set<number>();
		for (const raw of text.split(/[\n, ]+/)) {
			const id = Number(raw.trim());
			if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
			seen.add(id);
			ids.push(id);
		}
		return ids;
	}

	function routingRulesFromConfig(config?: Record<string, number[]> | null): ModelRoutingRule[] {
		return Object.entries(config ?? {}).map(([pattern, accountIds]) => ({
			pattern,
			accountIdsText: (accountIds ?? []).join(', ')
		}));
	}

	function modelRoutingConfig() {
		const routing: Record<string, number[]> = {};
		for (const rule of modelRoutingRules) {
			const pattern = rule.pattern.trim();
			const accountIds = parsePositiveIds(rule.accountIdsText);
			if (pattern && accountIds.length > 0) routing[pattern] = accountIds;
		}
		return Object.keys(routing).length > 0 ? routing : null;
	}

	function addModelRoutingRule() {
		modelRoutingRules = [...modelRoutingRules, { pattern: '', accountIdsText: '' }];
	}

	function removeModelRoutingRule(index: number) {
		modelRoutingRules = modelRoutingRules.filter((_, itemIndex) => itemIndex !== index);
	}

	function updateModelRoutingRule(index: number, patch: Partial<ModelRoutingRule>) {
		modelRoutingRules = modelRoutingRules.map((rule, itemIndex) => (itemIndex === index ? { ...rule, ...patch } : rule));
	}

	function addCopyAccountsGroup() {
		const id = Number(copyAccountsSelect);
		if (Number.isInteger(id) && id > 0 && !copyAccountsGroupIds.includes(id)) {
			copyAccountsGroupIds = [...copyAccountsGroupIds, id];
		}
		copyAccountsSelect = '__none__';
	}

	function removeCopyAccountsGroup(id: number) {
		copyAccountsGroupIds = copyAccountsGroupIds.filter((item) => item !== id);
	}

	function copyAccountsLabel(id: number) {
		return copyAccountsOptions.find((option) => option.value === String(id))?.label ?? `#${id}`;
	}

	function uniqueModels(models: string[]) {
		const seen = new Set<string>();
		const out: string[] = [];
		for (const raw of models) {
			const model = raw.trim();
			if (!model || seen.has(model)) continue;
			seen.add(model);
			out.push(model);
		}
		return out;
	}

	function splitModelsText(text: string) {
		return text
			.split(/[\n,]+/)
			.map((model) => model.trim())
			.filter(Boolean);
	}

	function normalizedModelList() {
		const seen = new Set<string>();
		const models: string[] = [];
		const rawModels = modelsListItems.length > 0
			? modelsListItems.filter((item) => item.selected).map((item) => item.id)
			: modelsListText.split(/[\n,]+/);
		for (const raw of rawModels) {
			const model = raw.trim();
			if (!model || seen.has(model)) continue;
			seen.add(model);
			models.push(model);
		}
		return models;
	}

	function createModelsListItems(savedModels: string[], candidates: string[]) {
		const saved = uniqueModels(savedModels);
		const candidateList = uniqueModels(candidates);
		const savedSet = new Set(saved);
		const hasSaved = saved.length > 0;
		return uniqueModels([...saved, ...candidateList]).map((id) => ({
			id,
			selected: hasSaved ? savedSet.has(id) : true
		}));
	}

	function syncModelsListTextFromItems() {
		modelsListText = modelsListItems.filter((item) => item.selected).map((item) => item.id).join('\n');
	}

	function setModelsListItem(id: string, checked: boolean) {
		modelsListItems = modelsListItems.map((item) => (item.id === id ? { ...item, selected: checked } : item));
		syncModelsListTextFromItems();
	}

	function selectAllModelsListItems() {
		modelsListItems = modelsListItems.map((item) => ({ ...item, selected: true }));
		syncModelsListTextFromItems();
	}

	function invertModelsListItems() {
		modelsListItems = modelsListItems.map((item) => ({ ...item, selected: !item.selected }));
		syncModelsListTextFromItems();
	}

	function moveModelsListItem(index: number, offset: -1 | 1) {
		const target = index + offset;
		if (target < 0 || target >= modelsListItems.length) return;
		const next = [...modelsListItems];
		const [item] = next.splice(index, 1);
		next.splice(target, 0, item);
		modelsListItems = next;
		syncModelsListTextFromItems();
	}

	function syncModelsListItemsFromText() {
		const selected = uniqueModels(splitModelsText(modelsListText));
		const selectedSet = new Set(selected);
		const existing = new Set(modelsListItems.map((item) => item.id));
		const extra = selected.filter((model) => !existing.has(model)).map((id) => ({ id, selected: true }));
		modelsListItems = [...modelsListItems.map((item) => ({ ...item, selected: selectedSet.has(item.id) })), ...extra];
	}

	async function loadModelsListCandidatesForForm(groupId: number, platform: string) {
		modelsListLoading = true;
		try {
			const candidates = await getModelsListCandidates(groupId, platform);
			const saved = splitModelsText(modelsListText);
			modelsListItems = createModelsListItems(saved, candidates);
			syncModelsListTextFromItems();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			modelsListLoading = false;
		}
	}

	function groupPayload(): SaveGroupPayload {
		return {
			...form,
			platform: formPlatform,
			status: formStatus,
			rate_multiplier: optionalNumber(form.rate_multiplier) ?? 1,
			max_concurrent_requests: optionalNumber(form.max_concurrent_requests),
			rpm_limit: optionalNumber(form.rpm_limit),
			daily_limit_usd: optionalNumber(form.daily_limit_usd),
			weekly_limit_usd: optionalNumber(form.weekly_limit_usd),
			monthly_limit_usd: optionalNumber(form.monthly_limit_usd),
			allow_image_generation: Boolean(form.allow_image_generation),
			image_rate_independent: Boolean(form.image_rate_independent),
			image_rate_multiplier: imageMultiplier(form.image_rate_multiplier),
			image_price_1k: optionalNumber(form.image_price_1k),
			image_price_2k: optionalNumber(form.image_price_2k),
			image_price_4k: optionalNumber(form.image_price_4k),
			claude_code_only: Boolean(form.claude_code_only),
			fallback_group_id: optionalIdForPayload(form.fallback_group_id),
			fallback_group_id_on_invalid_request: optionalIdForPayload(form.fallback_group_id_on_invalid_request),
			require_oauth_only: Boolean(form.require_oauth_only),
			require_privacy_set: Boolean(form.require_privacy_set),
			mcp_xml_inject: Boolean(form.mcp_xml_inject),
			allow_messages_dispatch: Boolean(messagesDispatchEnabled),
			messages_dispatch_model_config: formPlatform === 'openai' ? messagesDispatchConfig() : undefined,
			model_routing_enabled: Boolean(modelRoutingEnabled),
			model_routing: modelRoutingConfig(),
			copy_accounts_from_group_ids: copyAccountsGroupIds,
			models_list_config: {
				enabled: modelsListEnabled,
				models: normalizedModelList()
			},
			supported_model_scopes: Array.isArray(form.supported_model_scopes)
				? form.supported_model_scopes
				: [...DEFAULT_SUPPORTED_MODEL_SCOPES]
		};
	}

	async function saveGroup() {
		if (!form.name.trim()) return;
		saving = true;
		try {
			const payload = groupPayload();
			if (editing) await updateGroup(editing.id, payload);
			else await createGroup(payload);
			showSuccess(editing ? 'Group updated' : 'Group created');
			open = false;
			onSaved();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			saving = false;
		}
	}
</script>

<StandardDialog bind:open title={editing ? 'Edit group' : 'New group'} data-testid="group-dialog">
	<div class="mt-4 grid gap-3">
		<label class="grid gap-1 text-sm">Name<Input bind:value={form.name} /></label>
		<label class="grid gap-1 text-sm">Description<Input bind:value={form.description} /></label>
		<div class="grid gap-3 sm:grid-cols-2">
			<label class="grid gap-1 text-sm">Platform<NativeSelect bind:value={formPlatform} options={formPlatformOptions} onchange={handleFormPlatformChange} data-testid="group-platform-select" /></label>
			<label class="grid gap-1 text-sm">Status<NativeSelect bind:value={formStatus} options={formStatusOptions} onchange={() => (form.status = formStatus)} /></label>
		</div>
		{#if copyAccountsOptions.length > 0}
			<div class="grid gap-2 rounded-md border border-border p-3">
				<p class="text-sm font-medium">Copy accounts from groups</p>
				{#if copyAccountsGroupIds.length > 0}
					<div class="flex flex-wrap gap-2">
						{#each copyAccountsGroupIds as groupId}
							<Badge variant="outline" class="gap-1">
								{copyAccountsLabel(groupId)}
								<Button variant="ghost" size="sm" class="h-5 px-1" onclick={() => removeCopyAccountsGroup(groupId)} aria-label={`Remove source group ${groupId}`}>{$_('common.remove', { default: 'Remove' })}</Button>
							</Badge>
						{/each}
					</div>
				{/if}
				<div class="grid gap-2 sm:grid-cols-[1fr_auto]">
					<NativeSelect bind:value={copyAccountsSelect} options={copyAccountsSelectOptions} data-testid="group-copy-accounts-select" />
					<Button variant="outline" onclick={addCopyAccountsGroup} disabled={copyAccountsSelect === '__none__'}>Add source</Button>
				</div>
			</div>
		{/if}
		<div class="grid gap-3 sm:grid-cols-3">
			<label class="grid gap-1 text-sm">Rate<Input type="number" step="0.1" bind:value={form.rate_multiplier} /></label>
			<label class="grid gap-1 text-sm">RPM<Input type="number" bind:value={form.rpm_limit} /></label>
			<label class="grid gap-1 text-sm">Concurrency<Input type="number" bind:value={form.max_concurrent_requests} /></label>
		</div>
		<div class="grid gap-2 rounded-md border border-border p-3">
			<p class="text-sm font-medium">Usage limits</p>
			<div class="grid gap-3 sm:grid-cols-3">
				<label class="grid gap-1 text-sm">Daily USD<Input type="number" min="0" step="0.01" bind:value={form.daily_limit_usd} placeholder="No limit" data-testid="group-daily-limit" /></label>
				<label class="grid gap-1 text-sm">Weekly USD<Input type="number" min="0" step="0.01" bind:value={form.weekly_limit_usd} placeholder="No limit" data-testid="group-weekly-limit" /></label>
				<label class="grid gap-1 text-sm">Monthly USD<Input type="number" min="0" step="0.01" bind:value={form.monthly_limit_usd} placeholder="No limit" data-testid="group-monthly-limit" /></label>
			</div>
		</div>
		<div class="grid gap-2 rounded-md border border-border p-3">
			<p class="text-sm font-medium">Image pricing</p>
			<div class="grid gap-2 sm:grid-cols-2">
				<label class="flex items-center gap-2 text-sm">
					<Checkbox bind:checked={form.allow_image_generation} data-testid="group-allow-image" />
					Allow image generation
				</label>
				<label class="flex items-center gap-2 text-sm">
					<Checkbox bind:checked={form.image_rate_independent} data-testid="group-image-independent" />
					Independent multiplier
				</label>
			</div>
			<div class="grid gap-3 sm:grid-cols-4">
				<label class="grid gap-1 text-sm">Multiplier<Input type="number" min="0" step="0.0001" bind:value={form.image_rate_multiplier} placeholder="1" data-testid="group-image-multiplier" /></label>
				<label class="grid gap-1 text-sm">1K USD<Input type="number" min="0" step="0.001" bind:value={form.image_price_1k} placeholder="0.134" data-testid="group-image-price-1k" /></label>
				<label class="grid gap-1 text-sm">2K USD<Input type="number" min="0" step="0.001" bind:value={form.image_price_2k} placeholder="0.201" data-testid="group-image-price-2k" /></label>
				<label class="grid gap-1 text-sm">4K USD<Input type="number" min="0" step="0.001" bind:value={form.image_price_4k} placeholder="0.268" data-testid="group-image-price-4k" /></label>
			</div>
		</div>
		<div class="grid gap-2 rounded-md border border-border p-3">
			<p class="text-sm font-medium">Fallback routing</p>
			<label class="flex items-center gap-2 text-sm">
				<Checkbox bind:checked={form.claude_code_only} data-testid="group-claude-code-only" />
				Claude Code only
			</label>
			<div class="grid gap-3 sm:grid-cols-2">
				<label class="grid gap-1 text-sm">Claude fallback group ID<Input type="number" min="0" step="1" bind:value={form.fallback_group_id} placeholder="0 = none" data-testid="group-fallback-id" /></label>
				<label class="grid gap-1 text-sm">Invalid request fallback ID<Input type="number" min="0" step="1" bind:value={form.fallback_group_id_on_invalid_request} placeholder="0 = none" data-testid="group-invalid-fallback-id" /></label>
			</div>
		</div>
		<div class="grid gap-2 rounded-md border border-border p-3">
			<div class="flex items-center justify-between gap-3">
				<div>
					<p class="text-sm font-medium">Model routing</p>
					<p class="text-xs text-muted-foreground">Route model patterns to specific account IDs.</p>
				</div>
				<label class="flex items-center gap-2 text-sm">
					<Checkbox bind:checked={modelRoutingEnabled} data-testid="group-model-routing-enabled" />
					Enabled
				</label>
			</div>
			{#if modelRoutingEnabled}
				<div class="grid gap-2">
					{#each modelRoutingRules as rule, index}
						<div class="grid gap-2 rounded-md border border-border p-2 sm:grid-cols-[1fr_1fr_auto]">
							<label class="grid gap-1 text-sm">
								Model pattern
								<Input value={rule.pattern} oninput={(event) => updateModelRoutingRule(index, { pattern: event.currentTarget.value })} placeholder="claude-3-5-sonnet" data-testid={`group-routing-pattern-${index}`} />
							</label>
							<label class="grid gap-1 text-sm">
								Account IDs
								<Input value={rule.accountIdsText} oninput={(event) => updateModelRoutingRule(index, { accountIdsText: event.currentTarget.value })} placeholder="101, 102" data-testid={`group-routing-accounts-${index}`} />
							</label>
							<Button variant="ghost" class="self-end" onclick={() => removeModelRoutingRule(index)}>{$_('common.remove', { default: 'Remove' })}</Button>
						</div>
					{/each}
				</div>
				<Button variant="outline" size="sm" onclick={addModelRoutingRule}>Add routing rule</Button>
			{:else}
				<p class="text-sm text-muted-foreground">Routing is disabled for this group.</p>
			{/if}
		</div>
		{#if formPlatform === 'openai'}
			<div class="grid gap-2 rounded-md border border-border p-3">
				<div class="flex items-center justify-between gap-3">
					<div>
						<p class="text-sm font-medium">OpenAI messages dispatch</p>
						<p class="text-xs text-muted-foreground">Map Anthropic messages models to OpenAI-compatible targets.</p>
					</div>
					<label class="flex items-center gap-2 text-sm">
						<Checkbox bind:checked={messagesDispatchEnabled} data-testid="group-messages-dispatch-enabled" />
						Enabled
					</label>
				</div>
				{#if messagesDispatchEnabled}
					<div class="grid gap-3 sm:grid-cols-3">
						<label class="grid gap-1 text-sm">Opus model<Input bind:value={messagesOpusModel} data-testid="group-messages-opus" /></label>
						<label class="grid gap-1 text-sm">Sonnet model<Input bind:value={messagesSonnetModel} data-testid="group-messages-sonnet" /></label>
						<label class="grid gap-1 text-sm">Haiku model<Input bind:value={messagesHaikuModel} data-testid="group-messages-haiku" /></label>
					</div>
					<label class="grid gap-1 text-sm">
						Exact mappings
						<Textarea rows={4} bind:value={messagesExactMappingsText} placeholder="claude-opus-4=gpt-5.4" data-testid="group-messages-exact" />
					</label>
				{/if}
			</div>
		{/if}
		<div class="grid gap-2 rounded-md border border-border p-3">
			<p class="text-sm font-medium">Account policy</p>
			<div class="grid gap-2 sm:grid-cols-3">
				<label class="flex items-center gap-2 text-sm">
					<Checkbox bind:checked={form.require_oauth_only} data-testid="group-require-oauth" />
					OAuth accounts only
				</label>
				<label class="flex items-center gap-2 text-sm">
					<Checkbox bind:checked={form.require_privacy_set} data-testid="group-require-privacy" />
					Privacy configured
				</label>
				<label class="flex items-center gap-2 text-sm">
					<Checkbox bind:checked={form.mcp_xml_inject} data-testid="group-mcp-xml" />
					MCP XML inject
				</label>
			</div>
		</div>
		<div class="grid gap-2 rounded-md border border-border p-3">
			<p class="text-sm font-medium">Supported model scopes</p>
			<div class="grid gap-2 sm:grid-cols-3">
				{#each SUPPORTED_MODEL_SCOPE_OPTIONS as option}
					<label class="flex items-center gap-2 text-sm">
						<Checkbox
							checked={modelScopeEnabled(option.value)}
							onchange={(event) => handleModelScopeChange(option.value, event)}
							data-testid={`group-scope-${option.value}`}
						/>
						{option.label}
					</label>
				{/each}
			</div>
		</div>
		<div class="grid gap-2 rounded-md border border-border p-3">
			<div class="flex items-center justify-between gap-3">
				<div>
					<p class="text-sm font-medium">Models list</p>
					<p class="text-xs text-muted-foreground">{modelsListItems.filter((item) => item.selected).length} / {modelsListItems.length} selected</p>
				</div>
				<label class="flex items-center gap-2 text-sm">
					<Checkbox bind:checked={modelsListEnabled} data-testid="group-models-list-enabled" />
					Enabled
				</label>
			</div>
			{#if modelsListLoading}
				<p class="rounded-md border border-border p-3 text-sm text-muted-foreground">Loading model candidates...</p>
			{:else if modelsListItems.length > 0}
				<div class="flex flex-wrap justify-end gap-2">
					<Button variant="outline" size="sm" onclick={selectAllModelsListItems}>Select all</Button>
					<Button variant="outline" size="sm" onclick={invertModelsListItems}>Invert</Button>
				</div>
				<div class="max-h-48 overflow-auto rounded-md border border-border" data-testid="group-models-list-items">
					{#each modelsListItems as item, index (item.id)}
						<div class="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0">
							<label class="flex min-w-0 items-center gap-2">
								<Checkbox checked={item.selected} onchange={(event) => setModelsListItem(item.id, event.currentTarget.checked)} data-testid={`group-models-list-item-${item.id}`} />
								<span class="truncate font-mono text-xs">{item.id}</span>
							</label>
							<Button variant="ghost" size="sm" disabled={index === 0} onclick={() => moveModelsListItem(index, -1)}>Up</Button>
							<Button variant="ghost" size="sm" disabled={index === modelsListItems.length - 1} onclick={() => moveModelsListItem(index, 1)}>Down</Button>
						</div>
					{/each}
				</div>
			{:else}
				<p class="rounded-md border border-border p-3 text-sm text-muted-foreground">No model candidates loaded.</p>
			{/if}
			<label class="grid gap-1 text-sm">
				Model IDs
				<Textarea rows={4} bind:value={modelsListText} oninput={syncModelsListItemsFromText} placeholder="one model per line or comma-separated" data-testid="group-models-list-text" />
			</label>
		</div>
		<label class="flex items-center gap-2 text-sm"><Checkbox bind:checked={form.is_exclusive} /> Exclusive group</label>
	</div>
	<div class="mt-5 flex justify-end gap-2">
		<Button variant="outline" onclick={onClose}>{$_('common.cancel', { default: 'Cancel' })}</Button>
		<Button disabled={saving || !form.name.trim()} onclick={saveGroup}>{$_('common.save', { default: 'Save' })}</Button>
	</div>
</StandardDialog>
