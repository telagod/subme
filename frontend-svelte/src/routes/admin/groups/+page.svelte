<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { AlertTriangle, ChevronLeft, ChevronRight, Layers, Plus, RefreshCw, Search, SlidersHorizontal } from '@lucide/svelte';
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
		createGroup,
			batchSetGroupRateMultipliers,
			batchSetGroupRPMOverrides,
			clearGroupRateMultipliers,
			clearGroupRPMOverrides,
			deleteGroup,
			getGroupCapacitySummary,
			getGroupUsageSummary,
			getModelsListCandidates,
			listGroupRateMultipliers,
			listGroups,
			updateGroup,
			updateGroupSortOrder,
			updateGroupStatus,
			type AdminGroup,
			type GroupCapacitySummary,
			type GroupRateMultiplierEntry,
			type GroupUsageSummary,
			type OpenAIMessagesDispatchModelConfig,
			type SaveGroupPayload
		} from '$lib/api/admin/groups';
	import { listUsers, type AdminUser } from '$lib/api/admin/users';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import { ALL, PAGE_SIZE, groupAccountCount, statusTone, summarizeGroups } from '$lib/features/supply/supply';

	const PLATFORM_OPTIONS = ['anthropic', 'openai', 'gemini', 'antigravity'];
	const platformOptions = $derived([
		{ value: ALL, label: 'All platforms' },
		...PLATFORM_OPTIONS.map((value) => ({ value, label: value }))
	]);
	const formPlatformOptions = $derived(PLATFORM_OPTIONS.map((value) => ({ value, label: value })));
	const statusOptions = [
		{ value: ALL, label: 'All statuses' },
		{ value: 'active', label: 'active' },
		{ value: 'inactive', label: 'inactive' }
	];
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

	let rows = $state<AdminGroup[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let saving = $state(false);
	let loadError = $state<string | null>(null);
	let page = $state(1);
	let searchInput = $state('');
	let platformFilter = $state(ALL);
	let statusFilter = $state(ALL);
	let sortDrafts = $state<Record<number, string>>({});
	let dialogOpen = $state(false);
	let editing = $state<AdminGroup | null>(null);
	let controlsOpen = $state(false);
	let controlsGroup = $state<AdminGroup | null>(null);
	let controlsLoading = $state(false);
	let controlsSaving = $state(false);
	let controlsError = $state<string | null>(null);
	let rateEntries = $state<GroupRateMultiplierEntry[]>([]);
	let rpmEntries = $state<GroupRateMultiplierEntry[]>([]);
	let serverRateEntries = $state<GroupRateMultiplierEntry[]>([]);
	let serverRpmEntries = $state<GroupRateMultiplierEntry[]>([]);
	let usageSummary = $state<GroupUsageSummary[]>([]);
	let capacitySummary = $state<GroupCapacitySummary[]>([]);
	let modelCandidates = $state<string[]>([]);
	let groupUserSearch = $state('');
	let groupUserSearchResults = $state<AdminUser[]>([]);
	let groupUserSearchLoading = $state(false);
	let selectedGroupUser = $state<AdminUser | null>(null);
	let newRateUserId = $state('');
	let newRateMultiplier = $state('1');
	let rateBatchFactor = $state('');
	let newRpmUserId = $state('');
	let newRpmOverride = $state('60');
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
		let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmMessage = $state('');
	let confirmAction = $state<(() => Promise<void>) | null>(null);
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

	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));
	const summary = $derived(summarizeGroups(rows));
	const controlsGroupId = $derived(controlsGroup?.id);
	const selectedUsage = $derived(
				controlsGroupId ? usageSummary.find((item) => Number(item.group_id) === controlsGroupId) : undefined
			);
	const selectedCapacity = $derived(
					controlsGroupId ? capacitySummary.find((item) => Number(item.group_id) === controlsGroupId) : undefined
				);
	const rateEntriesDirty = $derived(
		rateEntries.length !== serverRateEntries.length ||
			rateEntries.some((entry) => {
				const server = serverRateEntries.find((item) => item.user_id === entry.user_id);
				return !server || Number(server.rate_multiplier ?? 0) !== Number(entry.rate_multiplier ?? 0);
			})
	);
	const rpmEntriesDirty = $derived(
		rpmEntries.length !== serverRpmEntries.length ||
			rpmEntries.some((entry) => {
				const server = serverRpmEntries.find((item) => item.user_id === entry.user_id);
				return !server || Number(server.rpm_override ?? 0) !== Number(entry.rpm_override ?? 0);
			})
	);
		const copyAccountsOptions = $derived(
			rows
				.filter((row) => row.platform === formPlatform && row.id !== editing?.id && Number(row.total_accounts ?? row.available_accounts ?? 0) > 0)
				.map((row) => ({
					value: String(row.id),
					label: `${row.name} (${Number(row.total_accounts ?? row.available_accounts ?? 0)} accounts)`
				}))
		);
		const copyAccountsSelectOptions = $derived([{ value: '__none__', label: 'Select source group' }, ...copyAccountsOptions]);
			let formPlatform = $state('anthropic');
			let formStatus = $state('active');

	async function loadRows() {
		loading = true;
		loadError = null;
		try {
			const filters = {
				platform: platformFilter === ALL ? undefined : platformFilter,
				status: statusFilter === ALL ? undefined : statusFilter,
				search: searchInput.trim() || undefined,
				sort_by: 'sort_order',
				sort_order: 'asc' as const
			};
			const [resp, usage, capacity] = await Promise.all([
				listGroups(page, PAGE_SIZE, filters),
				getGroupUsageSummary(),
				getGroupCapacitySummary()
			]);
					rows = resp.items;
					total = resp.total;
					usageSummary = usage;
					capacitySummary = capacity;
					sortDrafts = Object.fromEntries(rows.map((row, index) => [row.id, String(row.sort_order ?? index + 1)]));
				} catch (err) {
					loadError = err instanceof Error ? err.message : String(err);
					rows = [];
					total = 0;
					usageSummary = [];
					capacitySummary = [];
					sortDrafts = {};
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

	function openCreate() {
		editing = null;
			form = {
				name: '',
				description: '',
				platform: platformFilter === ALL ? 'anthropic' : platformFilter,
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
			dialogOpen = true;
	}

	function openEdit(group: AdminGroup) {
		editing = group;
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
			dialogOpen = true;
	}

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

	function splitModelsText(text: string) {
		return text
			.split(/[\n,]+/)
			.map((model) => model.trim())
			.filter(Boolean);
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
			dialogOpen = false;
			await loadRows();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			saving = false;
		}
	}

		function openConfirm(title: string, message: string, action: () => Promise<void>) {
			confirmTitle = title;
			confirmMessage = message;
			confirmAction = action;
			confirmOpen = true;
		}

		async function runConfirmedAction() {
			if (!confirmAction) return;
			await confirmAction();
		}

		function removeGroup(group: AdminGroup) {
			openConfirm('Delete group', `Delete group "${group.name}"? This action cannot be undone.`, async () => {
			saving = true;
		try {
			await deleteGroup(group.id);
			confirmOpen = false;
			confirmAction = null;
			showSuccess('Group deleted');
			await loadRows();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
				saving = false;
			}
			});
		}

			function formatCost(value: number | null | undefined) {
				return `$${Number(value ?? 0).toFixed(2)}`;
			}

			function capacityText(used: number | null | undefined, max: number | null | undefined) {
				return `${used ?? 0} / ${max && max > 0 ? max : '-'}`;
			}

			function usageForGroup(groupId: number): GroupUsageSummary | undefined {
				return usageSummary.find((item) => Number(item.group_id) === groupId);
			}

			function capacityForGroup(groupId: number): GroupCapacitySummary | undefined {
				return capacitySummary.find((item) => Number(item.group_id) === groupId);
			}

			function userLabel(entry: GroupRateMultiplierEntry) {
				return entry.user_name || entry.user_email || `User #${entry.user_id}`;
			}

		function cloneGroupControlEntries(entries: GroupRateMultiplierEntry[]) {
			return entries.map((entry) => ({ ...entry }));
		}

		function selectedGroupUserLabel(user: AdminUser) {
			return user.username ? `${user.email} (${user.username})` : user.email;
		}

		function setSelectedGroupUser(user: AdminUser) {
			selectedGroupUser = user;
			groupUserSearch = selectedGroupUserLabel(user);
			groupUserSearchResults = [];
			newRateUserId = String(user.id);
			newRpmUserId = String(user.id);
		}

		async function searchGroupUsers() {
			const query = groupUserSearch.trim();
			if (!query) {
				groupUserSearchResults = [];
				selectedGroupUser = null;
				return;
			}
			groupUserSearchLoading = true;
			try {
				const resp = await listUsers(1, 10, { search: query });
				groupUserSearchResults = resp.items;
			} catch (err) {
				showError(err instanceof Error ? err.message : String(err));
				groupUserSearchResults = [];
			} finally {
				groupUserSearchLoading = false;
			}
		}

		function applyRateBatchFactor() {
			const factor = Number(rateBatchFactor);
			if (!Number.isFinite(factor) || factor <= 0) {
				showError('Enter a valid multiplier factor');
				return;
			}
			rateEntries = rateEntries.map((entry) => ({
				...entry,
				rate_multiplier: Number(((Number(entry.rate_multiplier ?? 1) || 1) * factor).toFixed(6))
			}));
			rateBatchFactor = '';
		}

		function resetRateEntriesToServer() {
			rateEntries = cloneGroupControlEntries(serverRateEntries);
			rateBatchFactor = '';
		}

		function resetRpmEntriesToServer() {
			rpmEntries = cloneGroupControlEntries(serverRpmEntries);
		}

		function setRateEntry(index: number, value: string) {
			const parsed = value === '' ? null : Number(value);
			rateEntries[index] = { ...rateEntries[index], rate_multiplier: parsed };
		}

		function setRpmEntry(index: number, value: string) {
			const parsed = value === '' ? null : Number(value);
			rpmEntries[index] = { ...rpmEntries[index], rpm_override: parsed };
		}

		function setSortDraft(id: number, value: string) {
			sortDrafts = { ...sortDrafts, [id]: value };
		}

		async function saveSortOrder() {
			const updates = rows
				.map((row, index) => ({
					id: row.id,
					sort_order: Number(sortDrafts[row.id] ?? row.sort_order ?? index + 1)
				}))
				.filter((entry) => Number.isFinite(entry.sort_order));
			if (updates.length === 0) return;
			saving = true;
			try {
				await updateGroupSortOrder(updates);
				showSuccess('Group sort order saved');
				await loadRows();
			} catch (err) {
				showError(err instanceof Error ? err.message : String(err));
			} finally {
				saving = false;
			}
		}

		async function loadGroupControls() {
			if (!controlsGroup) return;
			controlsLoading = true;
			controlsError = null;
			try {
				const [entries, usage, capacity, candidates] = await Promise.all([
					listGroupRateMultipliers(controlsGroup.id),
					getGroupUsageSummary(),
					getGroupCapacitySummary(),
					getModelsListCandidates(controlsGroup.id, controlsGroup.platform)
				]);
				serverRateEntries = entries.filter((entry) => entry.rate_multiplier != null).map((entry) => ({ ...entry }));
				serverRpmEntries = entries.filter((entry) => entry.rpm_override != null).map((entry) => ({ ...entry }));
				rateEntries = cloneGroupControlEntries(serverRateEntries);
				rpmEntries = cloneGroupControlEntries(serverRpmEntries);
				usageSummary = usage;
				capacitySummary = capacity;
				modelCandidates = candidates;
			} catch (err) {
				controlsError = err instanceof Error ? err.message : String(err);
			} finally {
				controlsLoading = false;
			}
		}

		function openControls(group: AdminGroup) {
			controlsGroup = group;
			controlsOpen = true;
			newRateUserId = '';
			newRateMultiplier = '1';
			rateBatchFactor = '';
			newRpmUserId = '';
			newRpmOverride = '60';
			groupUserSearch = '';
			groupUserSearchResults = [];
			selectedGroupUser = null;
			serverRateEntries = [];
			serverRpmEntries = [];
			modelCandidates = [];
			void loadGroupControls();
		}

		function addRateEntry() {
			const userId = Number(selectedGroupUser?.id ?? newRateUserId);
			const rate = Number(newRateMultiplier);
			if (!Number.isFinite(userId) || userId <= 0 || !Number.isFinite(rate) || rate <= 0) {
				showError('Enter a valid user ID and rate multiplier');
				return;
			}
			const existing = rateEntries.findIndex((entry) => entry.user_id === userId);
			const next = {
				user_id: userId,
				user_name: selectedGroupUser?.username ?? undefined,
				user_email: selectedGroupUser?.email ?? undefined,
				user_notes: selectedGroupUser?.notes ?? undefined,
				user_status: selectedGroupUser?.status ?? undefined,
				rate_multiplier: rate
			};
			if (existing >= 0) rateEntries[existing] = { ...rateEntries[existing], ...next };
			else rateEntries = [...rateEntries, next];
			newRateUserId = '';
			newRateMultiplier = '1';
			groupUserSearch = '';
			selectedGroupUser = null;
		}

		function addRpmEntry() {
			const userId = Number(selectedGroupUser?.id ?? newRpmUserId);
			const rpm = Number(newRpmOverride);
			if (!Number.isFinite(userId) || userId <= 0 || !Number.isFinite(rpm) || rpm < 0) {
				showError('Enter a valid user ID and RPM override');
				return;
			}
			const existing = rpmEntries.findIndex((entry) => entry.user_id === userId);
			const next = {
				user_id: userId,
				user_name: selectedGroupUser?.username ?? undefined,
				user_email: selectedGroupUser?.email ?? undefined,
				user_notes: selectedGroupUser?.notes ?? undefined,
				user_status: selectedGroupUser?.status ?? undefined,
				rpm_override: rpm
			};
			if (existing >= 0) rpmEntries[existing] = { ...rpmEntries[existing], ...next };
			else rpmEntries = [...rpmEntries, next];
			newRpmUserId = '';
			newRpmOverride = '60';
			groupUserSearch = '';
			selectedGroupUser = null;
		}

		async function saveRateMultipliers() {
			if (!controlsGroup) return;
			controlsSaving = true;
			try {
				await batchSetGroupRateMultipliers(
					controlsGroup.id,
					rateEntries
						.filter((entry) => entry.rate_multiplier != null && Number(entry.rate_multiplier) > 0)
						.map((entry) => ({ user_id: entry.user_id, rate_multiplier: Number(entry.rate_multiplier) }))
				);
				serverRateEntries = cloneGroupControlEntries(rateEntries);
				showSuccess('Rate multipliers saved');
				await loadRows();
			} catch (err) {
				showError(err instanceof Error ? err.message : String(err));
			} finally {
				controlsSaving = false;
			}
		}

		async function saveRpmOverrides() {
			if (!controlsGroup) return;
			controlsSaving = true;
			try {
				await batchSetGroupRPMOverrides(
					controlsGroup.id,
					rpmEntries
						.filter((entry) => entry.rpm_override != null && Number(entry.rpm_override) >= 0)
						.map((entry) => ({ user_id: entry.user_id, rpm_override: Number(entry.rpm_override) }))
				);
				serverRpmEntries = cloneGroupControlEntries(rpmEntries);
				showSuccess('RPM overrides saved');
				await loadRows();
			} catch (err) {
				showError(err instanceof Error ? err.message : String(err));
			} finally {
				controlsSaving = false;
			}
		}

		function clearRates() {
			if (!controlsGroup) return;
			const group = controlsGroup;
			openConfirm('Clear rate multipliers', `Clear all rate multipliers for "${group.name}"?`, async () => {
			controlsSaving = true;
			try {
				await clearGroupRateMultipliers(group.id);
				rateEntries = [];
				serverRateEntries = [];
				confirmOpen = false;
				confirmAction = null;
				showSuccess('Rate multipliers cleared');
				await loadRows();
			} catch (err) {
				showError(err instanceof Error ? err.message : String(err));
			} finally {
				controlsSaving = false;
			}
			});
		}

		function clearRpm() {
			if (!controlsGroup) return;
			const group = controlsGroup;
			openConfirm('Clear RPM overrides', `Clear all RPM overrides for "${group.name}"?`, async () => {
			controlsSaving = true;
			try {
				await clearGroupRPMOverrides(group.id);
				rpmEntries = [];
				serverRpmEntries = [];
				confirmOpen = false;
				confirmAction = null;
				showSuccess('RPM overrides cleared');
				await loadRows();
			} catch (err) {
				showError(err instanceof Error ? err.message : String(err));
			} finally {
				controlsSaving = false;
			}
			});
		}
	</script>

<svelte:head>
	<title>{$_('admin.groups.title', { default: 'Groups & Routing' })}</title>
</svelte:head>

<section class="space-y-5">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
		<div>
			<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">M13 · Supply</p>
			<h1 class="text-2xl font-semibold tracking-normal text-foreground">{$_('admin.groups.title', { default: 'Groups & Routing' })}</h1>
			<p class="mt-1 max-w-3xl text-sm text-muted-foreground">
				{$_('admin.groups.description', { default: 'Manage group routing, platform isolation, account capacity, and subscription visibility.' })}
			</p>
		</div>
			<div class="flex gap-2">
				<Button variant="outline" onclick={loadRows} disabled={loading}>
					<RefreshCw size={16} class={loading ? 'animate-spin' : ''} /> Refresh
				</Button>
				<Button variant="outline" onclick={saveSortOrder} disabled={saving || loading || rows.length === 0}>
					Save sort
				</Button>
				<Button onclick={openCreate}>
					<Plus size={16} /> New group
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
				<Input class="pl-9" placeholder="Search groups" bind:value={searchInput} onkeydown={(e) => e.key === 'Enter' && applyFilters()} />
			</label>
			<NativeSelect bind:value={platformFilter} options={platformOptions} onchange={applyFilters} data-testid="groups-platform-filter" />
			<NativeSelect bind:value={statusFilter} options={statusOptions} onchange={applyFilters} data-testid="groups-status-filter" />
			<Button onclick={applyFilters}>Apply</Button>
		</div>
	</Card>

	{#if loadError}
		<Alert variant="destructive" class="flex items-center gap-2">
			<AlertTriangle size={16} /> {loadError}
		</Alert>
	{/if}

			<Card padded={false} class="overflow-hidden" data-testid="groups-page">
				<VirtualTable rows={rows} rowHeight={72} loading={loading} getRowKey={(row) => row.id} class="max-h-[680px]">
					{#snippet header()}
						<div class="grid grid-cols-[72px_1.4fr_0.9fr_0.9fr_1fr_1fr_1fr_260px] gap-3 border-b px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">
							<span>Sort</span><span>Group</span><span>Platform</span><span>Status</span><span>Usage</span><span>Capacity</span><span>Channel</span><span>Actions</span>
						</div>
					{/snippet}
					{#snippet row({ row })}
						<div class="grid grid-cols-[72px_1.4fr_0.9fr_0.9fr_1fr_1fr_1fr_260px] items-center gap-3 border-b px-4 py-3 text-sm" data-testid="group-row">
							<Input
								type="number"
								min="0"
							value={sortDrafts[row.id] ?? ''}
							oninput={(event) => setSortDraft(row.id, event.currentTarget.value)}
							aria-label={`Sort order for ${row.name}`}
							data-testid="group-sort-input"
						/>
						<div class="min-w-0">
							<div class="flex items-center gap-2">
								<Layers size={15} class="text-muted-foreground" />
							<p class="truncate font-medium">{row.name}</p>
						</div>
						<p class="truncate text-xs text-muted-foreground">{row.description ?? `ID ${row.id}`}</p>
					</div>
					<p class="text-xs">{row.platform}</p>
					<div>
							<Badge variant="outline" class={statusTone(row.status)}>{row.status}</Badge>
								{#if row.is_exclusive}<Badge variant="outline" class="ml-1 bg-indigo-500/10 text-indigo-700 ring-indigo-500/20">exclusive</Badge>{/if}
							</div>
							<div class="text-xs" data-testid="group-usage-summary">
								<p>today {formatCost(usageForGroup(row.id)?.today_cost)}</p>
								<p class="text-muted-foreground">total {formatCost(usageForGroup(row.id)?.total_cost)}</p>
							</div>
							<div class="text-xs" data-testid="group-capacity-summary">
								<p>{groupAccountCount(row)} accounts</p>
								<p class="text-muted-foreground">rpm {capacityText(capacityForGroup(row.id)?.rpm_used, capacityForGroup(row.id)?.rpm_max)}</p>
							</div>
							<p class="truncate text-xs text-muted-foreground">{row.channel_name ?? (row.channel_id ? `#${row.channel_id}` : 'None')}</p>
						<div class="flex flex-wrap gap-1.5">
							<Button variant="outline" size="sm" disabled={controlsLoading} onclick={() => openControls(row)}>
								<SlidersHorizontal size={14} /> Controls
							</Button>
							<Button variant="outline" size="sm" onclick={() => openEdit(row)}>Edit</Button>
							<Button variant="outline" size="sm" disabled={saving} onclick={() => updateGroupStatus(row.id, row.status === 'active' ? 'inactive' : 'active').then(loadRows)}>
								{row.status === 'active' ? 'Disable' : 'Enable'}
							</Button>
							<Button variant="outline" size="sm" class="text-destructive" disabled={saving} onclick={() => removeGroup(row)}>Delete</Button>
						</div>
					</div>
			{/snippet}
			{#snippet empty()}
				<div class="p-10 text-center text-sm text-muted-foreground">No groups match the current filters.</div>
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

<StandardDialog bind:open={dialogOpen} title={editing ? 'Edit group' : 'New group'} data-testid="group-dialog">
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
										<Button variant="ghost" size="sm" class="h-5 px-1" onclick={() => removeCopyAccountsGroup(groupId)} aria-label={`Remove source group ${groupId}`}>Remove</Button>
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
									<Button variant="ghost" class="self-end" onclick={() => removeModelRoutingRule(index)}>Remove</Button>
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
		<Button variant="outline" onclick={() => (dialogOpen = false)}>Cancel</Button>
		<Button disabled={saving || !form.name.trim()} onclick={saveGroup}>Save</Button>
		</div>
	</StandardDialog>

	<StandardDialog bind:open={controlsOpen} title={controlsGroup ? `${controlsGroup.name} controls` : 'Group controls'} width="lg" data-testid="group-controls-dialog">
		<div class="mt-4 space-y-4">
			{#if controlsError}
				<Alert variant="destructive">{controlsError}</Alert>
			{/if}

			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				<Card>
					<p class="text-xs font-medium uppercase text-muted-foreground">Today cost</p>
					<p class="mt-2 text-xl font-semibold">{formatCost(selectedUsage?.today_cost)}</p>
				</Card>
				<Card>
					<p class="text-xs font-medium uppercase text-muted-foreground">Total cost</p>
					<p class="mt-2 text-xl font-semibold">{formatCost(selectedUsage?.total_cost)}</p>
				</Card>
				<Card>
					<p class="text-xs font-medium uppercase text-muted-foreground">RPM capacity</p>
					<p class="mt-2 text-xl font-semibold">{capacityText(selectedCapacity?.rpm_used, selectedCapacity?.rpm_max)}</p>
				</Card>
			</div>

			<Card class="space-y-3">
				<div class="flex items-center justify-between gap-3">
					<div>
						<h2 class="text-sm font-semibold">Model candidates</h2>
						<p class="text-xs text-muted-foreground">Read-only upstream model candidates for this group platform.</p>
					</div>
					<Badge variant="outline">{modelCandidates.length}</Badge>
				</div>
				<div class="max-h-36 overflow-auto rounded-md border border-border" data-testid="group-model-candidates">
					{#if controlsLoading}
						<p class="p-4 text-sm text-muted-foreground">Loading controls...</p>
					{:else if modelCandidates.length === 0}
						<p class="p-4 text-sm text-muted-foreground">No model candidates reported.</p>
					{:else}
						<div class="flex flex-wrap gap-2 p-3">
							{#each modelCandidates as model}
								<Badge variant="outline">{model}</Badge>
							{/each}
						</div>
					{/if}
				</div>
			</Card>

			<Card class="space-y-3">
				<div class="grid gap-2 rounded-md border border-border p-3">
					<div class="grid gap-2 sm:grid-cols-[1fr_auto]">
						<label class="grid gap-1 text-sm">
							User search
							<Input
								placeholder="Search email or username"
								bind:value={groupUserSearch}
								oninput={() => {
									selectedGroupUser = null;
									newRateUserId = '';
									newRpmUserId = '';
								}}
								data-testid="group-user-search"
							/>
						</label>
						<div class="flex items-end">
							<Button variant="outline" disabled={groupUserSearchLoading || !groupUserSearch.trim()} onclick={searchGroupUsers} data-testid="group-user-search-run">
								{groupUserSearchLoading ? 'Searching...' : 'Search users'}
							</Button>
						</div>
					</div>
					{#if groupUserSearchResults.length > 0}
						<div class="grid max-h-36 gap-1 overflow-auto rounded-md border border-border p-1" data-testid="group-user-search-results">
							{#each groupUserSearchResults as user}
								<Button variant="ghost" size="sm" class="justify-start" onclick={() => setSelectedGroupUser(user)}>
									#{user.id} · {user.email}{user.username ? ` · ${user.username}` : ''}
								</Button>
							{/each}
						</div>
					{/if}
					{#if selectedGroupUser}
						<p class="text-xs text-muted-foreground" data-testid="group-selected-user">
							Selected #{selectedGroupUser.id} · {selectedGroupUser.email}
						</p>
					{/if}
				</div>

				<div class="flex items-center justify-between gap-3">
					<div>
						<h2 class="text-sm font-semibold">Rate multipliers</h2>
						<p class="text-xs text-muted-foreground">Per-user billing multiplier overrides for this group.</p>
					</div>
					<div class="flex flex-wrap justify-end gap-2">
						{#if rateEntriesDirty}
							<Button variant="outline" size="sm" disabled={controlsSaving || controlsLoading} onclick={resetRateEntriesToServer}>Revert</Button>
						{/if}
						<Button variant="outline" size="sm" disabled={controlsSaving || controlsLoading || rateEntries.length === 0} onclick={clearRates}>Clear</Button>
					</div>
				</div>
				<div class="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
					<Input placeholder="User ID" inputmode="numeric" bind:value={newRateUserId} data-testid="group-rate-user-id" />
					<Input placeholder="Rate multiplier" type="number" min="0.01" step="0.1" bind:value={newRateMultiplier} data-testid="group-rate-new-value" />
					<Button variant="outline" onclick={addRateEntry}>Add</Button>
				</div>
				{#if rateEntries.length > 0}
					<div class="grid gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-[1fr_auto]">
						<Input placeholder="Batch factor, e.g. 0.5" type="number" min="0.0001" step="0.1" bind:value={rateBatchFactor} data-testid="group-rate-batch-factor" />
						<Button variant="outline" disabled={!String(rateBatchFactor).trim()} onclick={applyRateBatchFactor}>Apply factor</Button>
					</div>
				{/if}
				<div class="max-h-48 overflow-auto rounded-md border border-border" data-testid="group-rate-list">
					{#if controlsLoading}
						<p class="p-4 text-sm text-muted-foreground">Loading controls...</p>
					{:else if rateEntries.length === 0}
						<p class="p-4 text-sm text-muted-foreground">No user rate multipliers.</p>
					{:else}
						{#each rateEntries as entry, index (entry.user_id)}
							<div class="grid grid-cols-[1fr_120px_auto] items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0">
								<div class="min-w-0">
									<p class="truncate font-medium">{userLabel(entry)}</p>
									<p class="text-xs text-muted-foreground">#{entry.user_id}</p>
								</div>
								<Input type="number" min="0.01" step="0.1" value={entry.rate_multiplier ?? ''} oninput={(event) => setRateEntry(index, event.currentTarget.value)} />
								<Button variant="ghost" size="sm" onclick={() => (rateEntries = rateEntries.filter((item) => item.user_id !== entry.user_id))}>Remove</Button>
							</div>
						{/each}
					{/if}
				</div>
				<div class="flex justify-end">
					<Button disabled={controlsSaving || controlsLoading} onclick={saveRateMultipliers}>Save rates</Button>
				</div>
			</Card>

			<Card class="space-y-3">
				<div class="flex items-center justify-between gap-3">
					<div>
						<h2 class="text-sm font-semibold">RPM overrides</h2>
						<p class="text-xs text-muted-foreground">Per-user RPM caps in this group; 0 means unlimited.</p>
					</div>
					<div class="flex flex-wrap justify-end gap-2">
						{#if rpmEntriesDirty}
							<Button variant="outline" size="sm" disabled={controlsSaving || controlsLoading} onclick={resetRpmEntriesToServer}>Revert</Button>
						{/if}
						<Button variant="outline" size="sm" disabled={controlsSaving || controlsLoading || rpmEntries.length === 0} onclick={clearRpm}>Clear</Button>
					</div>
				</div>
				<div class="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
					<Input placeholder="User ID" inputmode="numeric" bind:value={newRpmUserId} data-testid="group-rpm-user-id" />
					<Input placeholder="RPM override" type="number" min="0" step="1" bind:value={newRpmOverride} data-testid="group-rpm-new-value" />
					<Button variant="outline" onclick={addRpmEntry}>Add</Button>
				</div>
				<div class="max-h-48 overflow-auto rounded-md border border-border" data-testid="group-rpm-list">
					{#if controlsLoading}
						<p class="p-4 text-sm text-muted-foreground">Loading controls...</p>
					{:else if rpmEntries.length === 0}
						<p class="p-4 text-sm text-muted-foreground">No user RPM overrides.</p>
					{:else}
						{#each rpmEntries as entry, index (entry.user_id)}
							<div class="grid grid-cols-[1fr_120px_auto] items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0">
								<div class="min-w-0">
									<p class="truncate font-medium">{userLabel(entry)}</p>
									<p class="text-xs text-muted-foreground">#{entry.user_id}</p>
								</div>
								<Input type="number" min="0" step="1" value={entry.rpm_override ?? ''} oninput={(event) => setRpmEntry(index, event.currentTarget.value)} />
								<Button variant="ghost" size="sm" onclick={() => (rpmEntries = rpmEntries.filter((item) => item.user_id !== entry.user_id))}>Remove</Button>
							</div>
						{/each}
					{/if}
				</div>
				<div class="flex justify-end">
					<Button disabled={controlsSaving || controlsLoading} onclick={saveRpmOverrides}>Save RPM</Button>
				</div>
			</Card>
		</div>
		<div class="mt-5 flex justify-end">
			<Button variant="outline" onclick={() => (controlsOpen = false)}>Close</Button>
		</div>
	</StandardDialog>

	<StandardDialog bind:open={confirmOpen} title={confirmTitle} width="sm" data-testid="groups-confirm-dialog">
		<div class="mt-4 space-y-4">
			<p class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
				{confirmMessage}
			</p>
			<div class="flex justify-end gap-2 border-t border-border pt-4">
				<Button variant="outline" onclick={() => (confirmOpen = false)}>Cancel</Button>
				<Button
					variant="outline"
					class="border-destructive/30 text-destructive hover:bg-destructive/10"
					disabled={saving || controlsSaving || !confirmAction}
					onclick={runConfirmedAction}
					data-testid="groups-confirm-action"
				>
					{saving || controlsSaving ? 'Working...' : 'Confirm'}
				</Button>
			</div>
		</div>
	</StandardDialog>
