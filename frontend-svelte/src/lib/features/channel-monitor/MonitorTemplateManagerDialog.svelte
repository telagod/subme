<script lang="ts">
	/**
	 * MonitorTemplateManagerDialog — provider-tabbed CRUD for monitor request templates.
	 *
	 * Features:
	 *   - Provider tabs (Anthropic / OpenAI / Gemini) with template count badges
	 *   - List view: templates for active provider, with edit / delete / apply actions
	 *   - Create / edit form with AdvancedRequestConfig (headers + body override)
	 *   - Apply picker: propagate template settings to associated monitors
	 *
	 * Ported from Vue MonitorTemplateManagerDialog.vue.
	 */
	import { _ } from 'svelte-i18n';
	import { Plus, RefreshCw, ArrowLeft } from '@lucide/svelte';
	import type { APIMode, BodyOverrideMode, Provider } from '$lib/api/admin/channelMonitor';
	import {
		list as listTemplates,
		create as createTemplate,
		update as updateTemplate,
		del as deleteTemplate,
		type ChannelMonitorTemplate
	} from '$lib/api/admin/channelMonitorTemplate';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import { providerLabel } from './channel-monitor';
	import AdvancedRequestConfig from './AdvancedRequestConfig.svelte';
	import TemplateApplyPickerDialog from './TemplateApplyPickerDialog.svelte';

	type Props = {
		open: boolean;
		onUpdated?: () => void;
	};

	let { open = $bindable(false), onUpdated }: Props = $props();

	const PROVIDERS: Provider[] = ['anthropic', 'openai', 'gemini'];

	let activeProvider = $state<Provider>('anthropic');
	let templates = $state<ChannelMonitorTemplate[]>([]);
	let loading = $state(false);
	let editing = $state<null | 'new' | number>(null); // null = list; 'new' = create; number = edit
	let submitting = $state(false);

	// ── Form state ───────────────────────────────────────────────────
	let formName = $state('');
	let formProvider = $state<Provider>('anthropic');
	let formApiMode = $state<APIMode>('chat_completions');
	let formDescription = $state('');
	let formExtraHeaders = $state<Record<string, string>>({});
	let formBodyOverrideMode = $state<BodyOverrideMode>('off');
	let formBodyOverride = $state<Record<string, unknown> | null>(null);

	// ── Derived ──────────────────────────────────────────────────────
	const templatesForActiveProvider = $derived(
		templates.filter((t) => t.provider === activeProvider)
	);

	const countByProvider = $derived(() => {
		const out: Record<Provider, number> = { anthropic: 0, openai: 0, gemini: 0 };
		for (const t of templates) {
			if (t.provider in out) out[t.provider as Provider]++;
		}
		return out;
	});

	// ── Apply picker state ───────────────────────────────────────────
	let applyPickerOpen = $state(false);
	let applyPickerTemplateId = $state<number | null>(null);
	let applyPickerTemplateName = $state('');

	// ── Delete confirm state ─────────────────────────────────────────
	let confirmDeleteOpen = $state(false);
	let confirmDeleteTemplate = $state<ChannelMonitorTemplate | null>(null);

	// ── Lifecycle ────────────────────────────────────────────────────
	$effect(() => {
		if (open) {
			editing = null;
			void fetchTemplates();
		}
	});

	// ── Data fetch ───────────────────────────────────────────────────
	async function fetchTemplates() {
		loading = true;
		try {
			templates = await listTemplates();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			loading = false;
		}
	}

	// ── Form helpers ─────────────────────────────────────────────────
	function resetForm(provider: Provider) {
		formName = '';
		formProvider = provider;
		formApiMode = 'chat_completions';
		formDescription = '';
		formExtraHeaders = {};
		formBodyOverrideMode = 'off';
		formBodyOverride = null;
	}

	function loadForm(tpl: ChannelMonitorTemplate) {
		formName = tpl.name;
		formProvider = tpl.provider;
		formApiMode = tpl.api_mode === 'responses' ? 'responses' : 'chat_completions';
		formDescription = tpl.description || '';
		formExtraHeaders = { ...(tpl.extra_headers || {}) };
		formBodyOverrideMode = (tpl.body_override_mode as BodyOverrideMode) || 'off';
		formBodyOverride = tpl.body_override ? { ...tpl.body_override } : null;
	}

	function openCreateForm() {
		resetForm(activeProvider);
		editing = 'new';
	}

	function openEditForm(tpl: ChannelMonitorTemplate) {
		loadForm(tpl);
		editing = tpl.id;
	}

	function backToList() {
		editing = null;
	}

	// ── Submit ───────────────────────────────────────────────────────
	async function handleSubmit() {
		if (submitting) return;
		if (!formName.trim()) {
			showError(
				$_('admin.channelMonitor.template.missingName', { default: 'Template name is required' })
			);
			return;
		}
		submitting = true;
		try {
			if (editing === 'new') {
				await createTemplate({
					name: formName.trim(),
					provider: formProvider,
					api_mode: formProvider === 'openai' ? formApiMode : 'chat_completions',
					description: formDescription.trim(),
					extra_headers: formExtraHeaders,
					body_override_mode: formBodyOverrideMode,
					body_override: formBodyOverride
				});
				showSuccess(
					$_('admin.channelMonitor.template.createSuccess', {
						default: 'Template created'
					})
				);
			} else if (typeof editing === 'number') {
				await updateTemplate(editing, {
					name: formName.trim(),
					api_mode: formProvider === 'openai' ? formApiMode : 'chat_completions',
					description: formDescription.trim(),
					extra_headers: formExtraHeaders,
					body_override_mode: formBodyOverrideMode,
					body_override: formBodyOverride
				});
				showSuccess(
					$_('admin.channelMonitor.template.updateSuccess', {
						default: 'Template updated'
					})
				);
			}
			await fetchTemplates();
			onUpdated?.();
			editing = null;
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			submitting = false;
		}
	}

	// ── Apply ────────────────────────────────────────────────────────
	function confirmApply(tpl: ChannelMonitorTemplate) {
		applyPickerTemplateId = tpl.id;
		applyPickerTemplateName = tpl.name;
		applyPickerOpen = true;
	}

	async function onApplied(_affected: number) {
		await fetchTemplates();
		onUpdated?.();
	}

	// ── Delete ───────────────────────────────────────────────────────
	function handleDelete(tpl: ChannelMonitorTemplate) {
		confirmDeleteTemplate = tpl;
		confirmDeleteOpen = true;
	}

	async function doDelete() {
		const tpl = confirmDeleteTemplate;
		confirmDeleteOpen = false;
		if (!tpl) return;
		try {
			await deleteTemplate(tpl.id);
			showSuccess(
				$_('admin.channelMonitor.template.deleteSuccess', { default: 'Template deleted' })
			);
			await fetchTemplates();
			onUpdated?.();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		}
	}

	// ── Style helpers ────────────────────────────────────────────────
	function tabClass(value: Provider): string {
		return activeProvider === value
			? 'border-b-2 border-primary text-primary'
			: 'border-b-2 border-transparent text-muted-foreground hover:text-foreground';
	}

	function modeBadgeClass(mode: string): string {
		switch (mode) {
			case 'merge':
				return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
			case 'replace':
				return 'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300';
			default:
				return 'border-border bg-muted text-muted-foreground';
		}
	}

	function modeLabel(mode: string): string {
		switch (mode) {
			case 'merge':
				return $_('admin.channelMonitor.advanced.bodyModeMerge', { default: 'Merge' });
			case 'replace':
				return $_('admin.channelMonitor.advanced.bodyModeReplace', { default: 'Replace' });
			default:
				return $_('admin.channelMonitor.advanced.bodyModeOff', { default: 'Off' });
		}
	}

	function apiModeBadgeClass(mode: APIMode): string {
		return mode === 'responses'
			? 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300'
			: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
	}

	function apiModeLabel(mode: APIMode): string {
		return mode === 'responses'
			? $_('admin.channelMonitor.form.apiModeResponses', { default: 'Responses' })
			: $_('admin.channelMonitor.form.apiModeChatCompletions', { default: 'Chat completions' });
	}

	const apiModeOptions: { value: APIMode; label: string; hint: string }[] = [
		{
			value: 'chat_completions',
			label: 'Chat completions',
			hint: 'Standard /v1/chat/completions endpoint'
		},
		{
			value: 'responses',
			label: 'Responses',
			hint: 'New /v1/responses endpoint'
		}
	];

	function providerPickerClass(value: Provider, isActive: boolean): string {
		if (!isActive) return 'border-border bg-card text-muted-foreground hover:border-primary/50';
		switch (value) {
			case 'openai':
				return 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
			case 'anthropic':
				return 'border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-300';
			case 'gemini':
				return 'border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300';
			default:
				return 'border-primary bg-primary/10 text-primary';
		}
	}
</script>

<StandardDialog
	bind:open
	title={$_('admin.channelMonitor.template.managerTitle', { default: 'Template manager' })}
	width="lg"
	data-testid="template-manager-dialog"
>
	<div class="mt-4 space-y-4">
		<!-- Provider tabs -->
		<div class="border-b border-border">
			<div role="tablist" class="flex gap-1">
				{#each PROVIDERS as p (p)}
					<button
						type="button"
						role="tab"
						aria-selected={activeProvider === p}
						class="rounded-none px-4 py-2 text-sm font-medium transition-colors {tabClass(p)}"
						onclick={() => {
							activeProvider = p;
							if (editing !== null) backToList();
						}}
					>
						{providerLabel(p)}
						{#if countByProvider()[p] > 0}
							<Badge variant="secondary" class="ml-1.5">{countByProvider()[p]}</Badge>
						{/if}
					</button>
				{/each}
			</div>
		</div>

		<!-- List view -->
		{#if editing === null}
			<div class="flex justify-end">
				<Button size="sm" onclick={openCreateForm}>
					<Plus class="mr-1 h-4 w-4" />
					{$_('admin.channelMonitor.template.createButton', { default: 'Create template' })}
				</Button>
			</div>

			{#if loading}
				<div class="py-8 text-center text-sm text-muted-foreground">
					{$_('common.loading', { default: 'Loading...' })}
				</div>
			{:else if templatesForActiveProvider.length === 0}
				<div class="py-8 text-center text-sm text-muted-foreground">
					{$_('admin.channelMonitor.template.emptyState', {
						default: 'No templates for this provider yet.'
					})}
				</div>
			{:else}
				{#each templatesForActiveProvider as tpl (tpl.id)}
					<div
						class="rounded-lg border border-border bg-card p-4"
						data-testid="template-card"
						data-template-id={tpl.id}
					>
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<span class="font-medium text-foreground">{tpl.name}</span>
									<Badge variant="outline" class={modeBadgeClass(tpl.body_override_mode)}>
										{modeLabel(tpl.body_override_mode)}
									</Badge>
									{#if tpl.provider === 'openai'}
										<Badge variant="outline" class={apiModeBadgeClass(tpl.api_mode)}>
											{apiModeLabel(tpl.api_mode)}
										</Badge>
									{/if}
									{#if tpl.associated_monitors > 0}
										<span class="text-xs text-muted-foreground">
											{$_('admin.channelMonitor.template.associatedCount', {
												default: `${tpl.associated_monitors} monitors`,
												values: { n: tpl.associated_monitors }
											})}
										</span>
									{/if}
								</div>
								{#if tpl.description}
									<p class="mt-0.5 text-xs text-muted-foreground">{tpl.description}</p>
								{/if}
								<p class="mt-1 text-xs text-muted-foreground">
									{$_('admin.channelMonitor.template.headersSummary', {
										default: `${Object.keys(tpl.extra_headers || {}).length} custom headers`,
										values: { n: Object.keys(tpl.extra_headers || {}).length }
									})}
								</p>
							</div>
							<div class="flex flex-shrink-0 gap-2">
								<Button
									variant="outline"
									size="sm"
									disabled={tpl.associated_monitors === 0}
									title={$_('admin.channelMonitor.template.applyTooltip', {
										default: 'Apply template settings to associated monitors'
									})}
									onclick={() => confirmApply(tpl)}
								>
									<RefreshCw class="mr-1 inline h-3.5 w-3.5" />
									{$_('admin.channelMonitor.template.applyButton', { default: 'Apply' })}
								</Button>
								<Button variant="outline" size="sm" onclick={() => openEditForm(tpl)}>
									{$_('common.edit', { default: 'Edit' })}
								</Button>
								<Button
									variant="outline"
									size="sm"
									class="text-destructive hover:text-destructive"
									onclick={() => handleDelete(tpl)}
								>
									{$_('common.delete', { default: 'Delete' })}
								</Button>
							</div>
						</div>
					</div>
				{/each}
			{/if}
		{:else}
			<!-- Create / Edit form -->
			<div class="space-y-4">
				<div>
					<p class="mb-1.5 text-sm font-medium text-foreground">
						{$_('admin.channelMonitor.template.form.name', { default: 'Name' })}
						<span class="text-destructive">*</span>
					</p>
					<Input
						bind:value={formName}
						placeholder={$_('admin.channelMonitor.template.form.namePlaceholder', {
							default: 'e.g. Official client headers'
						})}
					/>
				</div>

				{#if editing === 'new'}
					<div>
						<p class="mb-1.5 text-sm font-medium text-foreground">
							{$_('admin.channelMonitor.form.provider', { default: 'Provider' })}
							<span class="text-destructive">*</span>
						</p>
						<div class="grid grid-cols-3 gap-3">
							{#each PROVIDERS as p (p)}
								<Button
									variant="outline"
									class="rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors {providerPickerClass(p, formProvider === p)}"
									onclick={() => {
										formProvider = p;
										if (p !== 'openai') formApiMode = 'chat_completions';
									}}
								>
									{providerLabel(p)}
								</Button>
							{/each}
						</div>
					</div>
				{/if}

				{#if formProvider === 'openai'}
					<div class="rounded-lg border border-border bg-accent p-3">
						<p class="mb-1.5 text-sm font-medium text-foreground">
							{$_('admin.channelMonitor.form.apiMode', { default: 'API mode' })}
						</p>
						<div class="grid gap-3 sm:grid-cols-2">
							{#each apiModeOptions as opt (opt.value)}
								<Button
									variant="outline"
									class="h-auto flex-col items-start rounded-lg border-2 px-3 py-2 text-left transition-colors {formApiMode === opt.value
										? 'border-primary bg-primary/15 text-primary shadow-sm'
										: 'border-border bg-card text-muted-foreground hover:border-primary/50'}"
									onclick={() => (formApiMode = opt.value)}
								>
									<span class="block text-sm font-semibold">{opt.label}</span>
									<span class="mt-0.5 block text-xs opacity-80">{opt.hint}</span>
								</Button>
							{/each}
						</div>
					</div>
				{/if}

				<div>
					<p class="mb-1.5 text-sm font-medium text-foreground">
						{$_('admin.channelMonitor.template.form.description', { default: 'Description' })}
					</p>
					<Input
						bind:value={formDescription}
						placeholder={$_('admin.channelMonitor.template.form.descriptionPlaceholder', {
							default: 'Optional description'
						})}
					/>
				</div>

				<AdvancedRequestConfig
					provider={formProvider}
					apiMode={formApiMode}
					extraHeaders={formExtraHeaders}
					bodyOverrideMode={formBodyOverrideMode}
					bodyOverride={formBodyOverride}
					onHeadersChange={(h) => (formExtraHeaders = h)}
					onBodyModeChange={(m) => (formBodyOverrideMode = m)}
					onBodyChange={(b) => (formBodyOverride = b)}
				/>
			</div>
		{/if}

		<!-- Footer actions -->
		<div class="flex items-center justify-between border-t border-border pt-3">
			<div>
				{#if editing !== null}
					<Button variant="outline" onclick={backToList}>
						<ArrowLeft class="mr-1 h-4 w-4" />
						{$_('common.back', { default: 'Back' })}
					</Button>
				{/if}
			</div>
			<div class="flex gap-2">
				<Button variant="outline" onclick={() => (open = false)}>
					{$_('common.close', { default: 'Close' })}
				</Button>
				{#if editing !== null}
					<Button disabled={submitting} onclick={handleSubmit}>
						{#if submitting}
							{$_('common.submitting', { default: 'Saving...' })}
						{:else if editing === 'new'}
							{$_('common.create', { default: 'Create' })}
						{:else}
							{$_('common.update', { default: 'Update' })}
						{/if}
					</Button>
				{/if}
			</div>
		</div>
	</div>
</StandardDialog>

<!-- Apply picker sub-dialog -->
<TemplateApplyPickerDialog
	bind:open={applyPickerOpen}
	templateId={applyPickerTemplateId}
	templateName={applyPickerTemplateName}
	onApplied={onApplied}
/>

<!-- Delete confirmation dialog -->
<StandardDialog
	bind:open={confirmDeleteOpen}
	title={$_('common.delete', { default: 'Delete' })}
	width="sm"
	data-testid="template-delete-confirm-dialog"
>
	<div class="mt-3 space-y-4">
		<p class="text-sm text-muted-foreground">
			{#if confirmDeleteTemplate}
				{$_('admin.channelMonitor.template.deleteConfirm', {
					default: `Delete template "${confirmDeleteTemplate.name}"? ${confirmDeleteTemplate.associated_monitors} monitors will lose their template association.`,
					values: {
						name: confirmDeleteTemplate.name,
						n: confirmDeleteTemplate.associated_monitors
					}
				})}
			{/if}
		</p>
		<div class="flex justify-end gap-2">
			<Button variant="outline" size="sm" onclick={() => (confirmDeleteOpen = false)}>
				{$_('common.cancel', { default: 'Cancel' })}
			</Button>
			<Button variant="destructive" size="sm" onclick={doDelete}>
				{$_('common.delete', { default: 'Delete' })}
			</Button>
		</div>
	</div>
</StandardDialog>
