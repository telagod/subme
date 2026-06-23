<script lang="ts">
	/**
	 * MonitorEditorCard — create/edit form for a channel monitor.
	 *
	 * Extracted from +page.svelte to keep the page under 400 lines.
	 * Includes template selector and advanced request config (headers/body override).
	 */
	import { _ } from 'svelte-i18n';
	import { Activity } from '@lucide/svelte';
	import type {
		APIMode,
		BodyOverrideMode,
		ChannelMonitor,
		Provider
	} from '$lib/api/admin/channelMonitor';
	import type { ChannelMonitorTemplate } from '$lib/api/admin/channelMonitorTemplate';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';
	import { parseExtraModels, providerLabel } from './channel-monitor';
	import AdvancedRequestConfig from './AdvancedRequestConfig.svelte';
	import MonitorTemplateSelector from './MonitorTemplateSelector.svelte';

	type Props = {
		editing: ChannelMonitor | null;
		saving: boolean;
		onSave: (payload: Record<string, unknown>) => void;
		onCancel: () => void;
	};

	let { editing, saving, onSave, onCancel }: Props = $props();

	const PROVIDERS: Provider[] = ['openai', 'anthropic', 'gemini'];

	const formProviderOptions = $derived(
		PROVIDERS.map((value) => ({ value, label: providerLabel(value) }))
	);
	const apiModeOptions = [
		{ value: 'chat_completions', label: 'Chat completions' },
		{ value: 'responses', label: 'Responses' }
	];

	let form = $state(defaultForm());

	function defaultForm() {
		return {
			name: '',
			provider: 'openai' as Provider,
			api_mode: 'chat_completions' as APIMode,
			endpoint: '',
			api_key: '',
			primary_model: '',
			extra_models: '',
			group_name: '',
			enabled: true,
			interval_seconds: 300,
			jitter_seconds: 0,
			template_id: null as number | null,
			extra_headers: {} as Record<string, string>,
			body_override_mode: 'off' as BodyOverrideMode,
			body_override: null as Record<string, unknown> | null
		};
	}

	// Sync form when editing prop changes
	$effect(() => {
		if (editing) {
			form = {
				name: editing.name,
				provider: editing.provider,
				api_mode: editing.api_mode,
				endpoint: editing.endpoint,
				api_key: '',
				primary_model: editing.primary_model,
				extra_models: editing.extra_models.join('\n'),
				group_name: editing.group_name,
				enabled: editing.enabled,
				interval_seconds: editing.interval_seconds,
				jitter_seconds: editing.jitter_seconds,
				template_id: editing.template_id,
				extra_headers: { ...(editing.extra_headers || {}) },
				body_override_mode: editing.body_override_mode || 'off',
				body_override: editing.body_override ? { ...editing.body_override } : null
			};
		} else {
			form = defaultForm();
		}
	});

	function handleTemplateSelect(tpl: ChannelMonitorTemplate | null) {
		if (tpl) {
			form.template_id = tpl.id;
			form.extra_headers = { ...(tpl.extra_headers || {}) };
			form.body_override_mode = (tpl.body_override_mode as BodyOverrideMode) || 'off';
			form.body_override = tpl.body_override ? { ...tpl.body_override } : null;
		} else {
			form.template_id = null;
			form.extra_headers = {};
			form.body_override_mode = 'off';
			form.body_override = null;
		}
	}

	function handleSave() {
		if (!form.name.trim() || !form.endpoint.trim() || !form.primary_model.trim()) return;
		const payload: Record<string, unknown> = {
			name: form.name.trim(),
			provider: form.provider,
			api_mode: form.api_mode,
			endpoint: form.endpoint.trim(),
			api_key: form.api_key,
			primary_model: form.primary_model.trim(),
			extra_models: parseExtraModels(form.extra_models),
			group_name: form.group_name.trim(),
			enabled: form.enabled,
			interval_seconds: Number(form.interval_seconds) || 300,
			jitter_seconds: Number(form.jitter_seconds) || 0,
			template_id: form.template_id,
			extra_headers: form.extra_headers,
			body_override_mode: form.body_override_mode,
			body_override: form.body_override
		};
		if (editing && form.template_id === null && editing.template_id !== null) {
			payload.clear_template = true;
		}
		onSave(payload);
	}

	const canSave = $derived(
		!saving &&
			form.name.trim() !== '' &&
			form.endpoint.trim() !== '' &&
			form.primary_model.trim() !== ''
	);
</script>

<Card class="p-4" data-testid="monitor-editor-card">
	<div class="mb-3 flex items-center gap-2 text-sm font-semibold">
		<Activity class="h-4 w-4 text-muted-foreground" />
		{editing ? $_('admin.monitor.editMonitor', { default: 'Edit monitor' }) : $_('admin.monitor.createMonitor', { default: 'Create monitor' })}
	</div>
	<div class="grid gap-3 lg:grid-cols-3">
		<label class="space-y-1 text-xs font-medium text-muted-foreground">
			<span>{$_('admin.monitor.name', { default: 'Name' })}</span>
			<Input bind:value={form.name} />
		</label>
		<label class="space-y-1 text-xs font-medium text-muted-foreground">
			<span>{$_('admin.monitor.provider', { default: 'Provider' })}</span>
			<NativeSelect bind:value={form.provider} options={formProviderOptions} />
		</label>
		<label class="space-y-1 text-xs font-medium text-muted-foreground">
			<span>{$_('admin.monitor.apiMode', { default: 'API mode' })}</span>
			<NativeSelect bind:value={form.api_mode} options={apiModeOptions} />
		</label>
		<label class="space-y-1 text-xs font-medium text-muted-foreground lg:col-span-2">
			<span>{$_('admin.monitor.endpoint', { default: 'Endpoint' })}</span>
			<Input bind:value={form.endpoint} />
		</label>
		<label class="space-y-1 text-xs font-medium text-muted-foreground">
			<span>{$_('admin.monitor.apiKey', { default: 'API key' })} {editing ? $_('admin.monitor.apiKeyBlankHint', { default: '(blank keeps current)' }) : ''}</span>
			<Input type="password" bind:value={form.api_key} />
		</label>
		<label class="space-y-1 text-xs font-medium text-muted-foreground">
			<span>{$_('admin.monitor.primaryModel', { default: 'Primary model' })}</span>
			<Input bind:value={form.primary_model} />
		</label>
		<label class="space-y-1 text-xs font-medium text-muted-foreground">
			<span>{$_('admin.monitor.groupName', { default: 'Group name' })}</span>
			<Input bind:value={form.group_name} />
		</label>
		<label class="flex items-center gap-2 pt-6 text-sm text-foreground">
			<Checkbox bind:checked={form.enabled} />
			<span>{$_('admin.monitor.enabled', { default: 'Enabled' })}</span>
		</label>
		<label class="space-y-1 text-xs font-medium text-muted-foreground">
			<span>{$_('admin.monitor.intervalSeconds', { default: 'Interval seconds' })}</span>
			<Input type="number" min="30" bind:value={form.interval_seconds} />
		</label>
		<label class="space-y-1 text-xs font-medium text-muted-foreground">
			<span>{$_('admin.monitor.jitterSeconds', { default: 'Jitter seconds' })}</span>
			<Input type="number" min="0" bind:value={form.jitter_seconds} />
		</label>
		<label class="space-y-1 text-xs font-medium text-muted-foreground lg:col-span-3">
			<span>{$_('admin.monitor.extraModels', { default: 'Extra models' })}</span>
			<Textarea
				class="font-mono text-xs"
				placeholder="one model per line or comma separated"
				bind:value={form.extra_models}
			/>
		</label>
		<div class="lg:col-span-3">
			<MonitorTemplateSelector
				provider={form.provider}
				templateId={form.template_id}
				onSelect={handleTemplateSelect}
			/>
		</div>
		<div class="lg:col-span-3">
			<AdvancedRequestConfig
				provider={form.provider}
				apiMode={form.api_mode}
				extraHeaders={form.extra_headers}
				bodyOverrideMode={form.body_override_mode}
				bodyOverride={form.body_override}
				onHeadersChange={(h) => (form.extra_headers = h)}
				onBodyModeChange={(m) => (form.body_override_mode = m)}
				onBodyChange={(b) => (form.body_override = b)}
			/>
		</div>
	</div>
	<div class="mt-3 flex justify-end gap-2">
		<Button variant="outline" disabled={saving} onclick={onCancel}>{$_('common.cancel', { default: '取消' })}</Button>
		<Button disabled={!canSave} onclick={handleSave}>{$_('common.save', { default: '保存' })}</Button>
	</div>
</Card>
