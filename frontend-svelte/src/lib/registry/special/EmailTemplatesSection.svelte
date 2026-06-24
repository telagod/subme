<script lang="ts">
	/**
	 * EmailTemplatesSection · 邮件模板编辑器（settings email tab）
	 *
	 * 端口自 Vue EmailTemplateEditor.vue。该 section 独立走
	 * /admin/settings/email-templates lifecycle，不进入 flat patchSettings。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { RefreshCw, RotateCcw, Save } from '@lucide/svelte';
	import {
		settingsApi,
		type EmailTemplateDetail,
		type EmailTemplateEventOption,
		type EmailTemplateOption
	} from '$lib/api/admin/settingsRegistry';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';

	type FieldUpdate = { key: string; value: unknown };

	type Props = {
		values: Record<string, unknown>;
		dirtyKeys?: Set<string>;
		onFieldUpdate?: (e: FieldUpdate) => void;
	};

	// Uniform special-section signature; this component owns its own lifecycle.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { values: _values, dirtyKeys: _dirtyKeys, onFieldUpdate: _onFieldUpdate }: Props = $props();

	const fallbackPlaceholders = [
		'{{site_name}}',
		'{{recipient_name}}',
		'{{recipient_email}}',
		'{{verification_code}}',
		'{{expires_in_minutes}}',
		'{{reset_url}}',
		'{{subscription_group}}',
		'{{subscription_days}}',
		'{{expiry_time}}',
		'{{days_remaining}}',
		'{{current_balance}}',
		'{{threshold}}',
		'{{recharge_url}}',
		'{{order_id}}',
		'{{unsubscribe_url}}',
		'{{account_id}}',
		'{{account_name}}',
		'{{platform}}',
		'{{quota_dimension}}',
		'{{quota_used}}',
		'{{quota_limit}}',
		'{{quota_remaining}}',
		'{{quota_threshold}}',
		'{{triggered_at}}'
	];

	let loadingList = $state(true);
	let loadingTemplate = $state(false);
	let saving = $state(false);
	let previewing = $state(false);
	let restoring = $state(false);
	let eventOptions = $state<EmailTemplateOption[]>([]);
	let localeOptions = $state<string[]>([]);
	let selectedEvent = $state('__none__');
	let selectedLocale = $state('__none__');
	let subject = $state('');
	let html = $state('');
	let isCustomTemplate = $state(false);
	let placeholders = $state<string[]>([]);
	let previewSubject = $state('');
	let previewHtml = $state('');
	let initializedSelection = false;

	const eventSelectOptions = $derived(
		eventOptions.length > 0
			? eventOptions.map((option) => ({
					value: option.value,
					label: formatEventOptionLabel(option)
				}))
			: [{ value: '__none__', label: '—', disabled: true }]
	);

	const localeSelectOptions = $derived(
		localeOptions.length > 0
			? localeOptions.map((item) => ({ value: item, label: formatLocale(item) }))
			: [{ value: '__none__', label: '—', disabled: true }]
	);

	const selectedEventOption = $derived(
		eventOptions.find((option) => option.value === selectedEvent) ?? null
	);

	const selectedEventMeta = $derived(eventMetaFor(selectedEventOption));

	const placeholderList = $derived.by(() => {
		const combined = [...placeholders, ...fallbackPlaceholders];
		return Array.from(new Set(combined.map(formatPlaceholder).filter(Boolean)));
	});

	const canSave = $derived(
		selectedEvent !== '__none__' &&
			selectedLocale !== '__none__' &&
			subject.trim().length > 0 &&
			html.trim().length > 0
	);

	const canPreview = $derived(
		selectedEvent !== '__none__' && selectedLocale !== '__none__' && html.trim().length > 0
	);

	onMount(() => {
		void loadTemplateList();
	});

	$effect(() => {
		const eventValue = selectedEvent;
		const localeValue = selectedLocale;
		if (!initializedSelection) return;
		if (eventValue === '__none__' || localeValue === '__none__') return;
		void loadTemplate();
	});

	function normalizeEventOption(option: EmailTemplateEventOption): EmailTemplateOption {
		if (typeof option === 'string') return { value: option };
		return option;
	}

	function eventMetaFor(option?: EmailTemplateOption | null) {
		if (!option) return null;
		return {
			label: option.label || option.value,
			timing: option.description || '',
			categoryLabel: formatCategory(option.category || ''),
			optional: option.optional === true
		};
	}

	function formatCategory(category: string): string {
		const normalized = category.trim().toLowerCase();
		if (!normalized) return 'Notification';
		const labels: Record<string, string> = {
			auth: 'Auth',
			subscription: 'Subscription',
			billing: 'Billing',
			admin: 'Admin',
			risk_control: 'Risk Control',
			ops: 'Ops'
		};
		return labels[normalized] ?? category;
	}

	function formatEventOptionLabel(option: EmailTemplateOption): string {
		return eventMetaFor(option)?.label ?? option.value;
	}

	function formatLocale(value: string): string {
		const lower = value.toLowerCase();
		if (lower === 'zh' || lower.startsWith('zh-')) {
			return $_('admin.settings.emailTemplates.localeZh');
		}
		if (lower === 'en' || lower.startsWith('en-')) {
			return $_('admin.settings.emailTemplates.localeEn');
		}
		return value;
	}

	function formatPlaceholder(placeholder: string): string {
		const trimmed = placeholder.trim();
		if (!trimmed) return '';
		if (trimmed.startsWith('{{') && trimmed.endsWith('}}')) return trimmed;
		return `{{${trimmed}}}`;
	}

	function applyTemplate(template: EmailTemplateDetail) {
		subject = template.subject;
		html = template.html;
		isCustomTemplate = template.is_custom === true;
		placeholders = template.placeholders ?? placeholders;
	}

	async function loadTemplateList() {
		loadingList = true;
		try {
			const response = await settingsApi.getEmailTemplates();
			eventOptions = response.events.map(normalizeEventOption);
			localeOptions = response.locales;
			placeholders = response.placeholders ?? [];
			selectedEvent = eventOptions[0]?.value ?? '__none__';
			selectedLocale = localeOptions[0] ?? '__none__';
			if (selectedEvent !== '__none__' && selectedLocale !== '__none__') {
				await loadTemplate();
			}
			initializedSelection = true;
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('common.error', { default: 'Error' }));
		} finally {
			loadingList = false;
		}
	}

	async function loadTemplate() {
		if (selectedEvent === '__none__' || selectedLocale === '__none__') return;
		loadingTemplate = true;
		try {
			const template = await settingsApi.getEmailTemplate(selectedEvent, selectedLocale);
			applyTemplate(template);
			await refreshPreview();
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('common.error', { default: 'Error' }));
		} finally {
			loadingTemplate = false;
		}
	}

	async function saveTemplate() {
		if (!canSave) {
			showError($_('admin.settings.emailTemplates.validationRequired'));
			return;
		}
		saving = true;
		try {
			const template = await settingsApi.updateEmailTemplate(selectedEvent, selectedLocale, {
				subject,
				html
			});
			applyTemplate(template);
			await refreshPreview();
			showSuccess($_('admin.settings.emailTemplates.saveSuccess'));
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('common.error', { default: 'Error' }));
		} finally {
			saving = false;
		}
	}

	async function refreshPreview() {
		if (!canPreview) {
			previewSubject = '';
			previewHtml = '';
			return;
		}
		previewing = true;
		try {
			const preview = await settingsApi.previewEmailTemplate({
				event: selectedEvent,
				locale: selectedLocale,
				subject,
				html
			});
			previewSubject = preview.subject;
			previewHtml = preview.html;
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('common.error', { default: 'Error' }));
		} finally {
			previewing = false;
		}
	}

	async function restoreOfficial() {
		if (selectedEvent === '__none__' || selectedLocale === '__none__') return;
		if (typeof window !== 'undefined' && !window.confirm($_('admin.settings.emailTemplates.restoreConfirm'))) {
			return;
		}
		restoring = true;
		try {
			const template = await settingsApi.restoreOfficialEmailTemplate(selectedEvent, selectedLocale);
			applyTemplate(template);
			await refreshPreview();
			showSuccess($_('admin.settings.emailTemplates.restoreSuccess'));
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('common.error', { default: 'Error' }));
		} finally {
			restoring = false;
		}
	}

	async function copyPlaceholder(placeholder: string) {
		try {
			if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(placeholder);
				showSuccess($_('admin.settings.emailTemplates.placeholderCopied'));
			}
		} catch {
			showError($_('common.error', { default: 'Error' }));
		}
	}
</script>

<div class="space-y-5" data-special="email-templates">
	<div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
		<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
			<label class="grid gap-1 text-sm font-medium text-foreground">
				{$_('admin.settings.emailTemplates.event')}
				<NativeSelect
					value={selectedEvent}
					options={eventSelectOptions}
					disabled={loadingTemplate || eventOptions.length === 0}
					data-testid="email-template-event"
					onchange={(event) => (selectedEvent = (event.target as HTMLSelectElement).value)}
				/>
			</label>
			<label class="grid gap-1 text-sm font-medium text-foreground">
				{$_('admin.settings.emailTemplates.locale')}
				<NativeSelect
					value={selectedLocale}
					options={localeSelectOptions}
					disabled={loadingTemplate || localeOptions.length === 0}
					data-testid="email-template-locale"
					onchange={(event) => (selectedLocale = (event.target as HTMLSelectElement).value)}
				/>
			</label>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={loadingTemplate || previewing || !canPreview}
				onclick={refreshPreview}
				data-testid="email-template-preview"
			>
				<RefreshCw class="h-3.5 w-3.5" />
				{previewing
					? $_('admin.settings.emailTemplates.previewing')
					: $_('admin.settings.emailTemplates.preview')}
			</Button>
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={loadingTemplate || restoring || selectedEvent === '__none__' || selectedLocale === '__none__'}
				onclick={restoreOfficial}
				data-testid="email-template-restore"
			>
				<RotateCcw class="h-3.5 w-3.5" />
				{restoring
					? $_('admin.settings.emailTemplates.restoring')
					: $_('admin.settings.emailTemplates.restoreOfficial')}
			</Button>
			<Button
				type="button"
				size="sm"
				disabled={loadingTemplate || saving || !canSave}
				onclick={saveTemplate}
				data-testid="email-template-save"
			>
				<Save class="h-3.5 w-3.5" />
				{saving
					? $_('admin.settings.emailTemplates.saving')
					: $_('admin.settings.emailTemplates.save')}
			</Button>
		</div>
	</div>

	{#if loadingList}
		<div class="flex items-center gap-2 text-sm text-muted-foreground" data-testid="email-template-loading">
			<span class="h-4 w-4 animate-spin rounded-full border-b-2 border-primary"></span>
			{$_('common.loading', { default: 'Loading...' })}
		</div>
	{:else if eventOptions.length === 0 || localeOptions.length === 0}
		<div
			class="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-600"
			data-testid="email-template-empty"
		>
			{$_('admin.settings.emailTemplates.empty')}
		</div>
	{:else}
		{#if selectedEventMeta}
			<div class="rounded-md border border-border bg-muted/30 p-3" data-testid="email-template-meta">
				<div class="flex flex-wrap items-center gap-2">
					<div class="text-sm font-semibold text-foreground">{selectedEventMeta.label}</div>
					<Badge variant="secondary">{selectedEventMeta.categoryLabel}</Badge>
					<Badge variant="outline">
						{selectedEventMeta.optional ? 'Optional' : 'Transactional'}
					</Badge>
					{#if isCustomTemplate}
						<Badge variant="outline" class="border-primary/20 bg-primary/10 text-primary">
							{$_('admin.settings.emailTemplates.customized')}
						</Badge>
					{/if}
				</div>
				{#if selectedEventMeta.timing}
					<p class="mt-2 text-xs text-muted-foreground">{selectedEventMeta.timing}</p>
				{/if}
			</div>
		{/if}

		<div class="grid grid-cols-1 gap-5 xl:grid-cols-2">
			<div class="space-y-4">
				<label class="grid gap-1 text-sm font-medium text-foreground">
					{$_('admin.settings.emailTemplates.subject')}
					<Input
						type="text"
						disabled={loadingTemplate}
						placeholder={$_('admin.settings.emailTemplates.subjectPlaceholder')}
						bind:value={subject}
						data-testid="email-template-subject"
					/>
				</label>

				<label class="grid gap-1 text-sm font-medium text-foreground">
					{$_('admin.settings.emailTemplates.html')}
					<Textarea
						rows={18}
						class="min-h-[28rem] resize-y font-mono text-sm leading-6"
						disabled={loadingTemplate}
						placeholder={$_('admin.settings.emailTemplates.htmlPlaceholder')}
						bind:value={html}
						data-testid="email-template-html"
					/>
				</label>

				<div class="rounded-md border border-border bg-muted/30 p-3">
					<div class="text-sm font-medium text-foreground">
						{$_('admin.settings.emailTemplates.placeholders')}
					</div>
					<p class="mt-1 text-xs text-muted-foreground">
						{$_('admin.settings.emailTemplates.placeholdersHelp')}
					</p>
					<div class="mt-3 flex flex-wrap gap-2">
						{#each placeholderList as placeholder (placeholder)}
							<Button
								type="button"
								variant="outline"
								size="sm"
								class="h-auto rounded-full bg-secondary px-3 py-1 font-mono text-xs"
								onclick={() => copyPlaceholder(placeholder)}
								data-testid="email-template-placeholder"
							>
								{placeholder}
							</Button>
						{/each}
					</div>
				</div>
			</div>

			<div class="space-y-3">
				<div class="rounded-md border border-border bg-card">
					<div class="flex items-center justify-between border-b border-border px-4 py-3">
						<div>
							<div class="text-sm font-medium text-foreground">
								{$_('admin.settings.emailTemplates.livePreview')}
							</div>
							<div class="mt-0.5 text-xs text-muted-foreground" data-testid="email-template-preview-subject">
								{previewSubject || $_('admin.settings.emailTemplates.noPreview')}
							</div>
						</div>
					</div>
					<div class="bg-muted p-3">
						<iframe
							class="h-[36rem] w-full rounded-md border border-border bg-white"
							sandbox=""
							srcdoc={previewHtml}
							title={$_('admin.settings.emailTemplates.livePreview')}
							data-testid="email-template-preview-frame"
						></iframe>
					</div>
				</div>
				<p class="text-xs text-muted-foreground">
					{$_('admin.settings.emailTemplates.previewSecurityHint')}
				</p>
			</div>
		</div>
	{/if}
</div>
