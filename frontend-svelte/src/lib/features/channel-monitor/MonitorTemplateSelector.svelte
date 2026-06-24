<script lang="ts">
	/**
	 * MonitorTemplateSelector — per-monitor dropdown to pick (or clear) a request template.
	 *
	 * When a template is selected, the parent can apply its advanced settings
	 * (headers, body override) to the monitor form. When cleared, parent resets those fields.
	 */
	import { _ } from 'svelte-i18n';
	import { FileText, X } from '@lucide/svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import {
		list as listTemplates,
		type ChannelMonitorTemplate
	} from '$lib/api/admin/channelMonitorTemplate';
	import type { Provider } from '$lib/api/admin/channelMonitor';

	type Props = {
		provider: Provider;
		templateId: number | null;
		onSelect?: (template: ChannelMonitorTemplate | null) => void;
	};

	let { provider, templateId, onSelect }: Props = $props();

	let templates = $state<ChannelMonitorTemplate[]>([]);
	let loading = $state(false);
	let loaded = $state(false);

	const filteredTemplates = $derived(
		templates.filter((t) => t.provider === provider)
	);

	const options = $derived([
		{
			value: '__none__',
			label: $_('admin.channelMonitor.template.noTemplate', { default: '-- No template --' })
		},
		...filteredTemplates.map((t) => ({
			value: String(t.id),
			label: `${t.name} (${t.body_override_mode})`
		}))
	]);

	const selectedValue = $derived(templateId != null ? String(templateId) : '__none__');

	const selectedTemplate = $derived(
		templateId != null ? templates.find((t) => t.id === templateId) ?? null : null
	);

	$effect(() => {
		// Reload when provider changes
		void loadTemplates();
	});

	async function loadTemplates() {
		if (loaded && templates.length > 0) return;
		loading = true;
		try {
			templates = await listTemplates({ provider });
			loaded = true;
		} catch {
			// Silent fail — selector is optional UX
		} finally {
			loading = false;
		}
	}

	function handleChange(event: Event) {
		const value = (event.target as HTMLSelectElement).value;
		if (value === '__none__') {
			onSelect?.(null);
		} else {
			const id = Number(value);
			const tpl = templates.find((t) => t.id === id) ?? null;
			onSelect?.(tpl);
		}
	}

	function clearTemplate() {
		onSelect?.(null);
	}
</script>

<div class="space-y-1.5" data-testid="monitor-template-selector">
	<div class="flex items-center gap-2">
		<FileText class="h-4 w-4 text-muted-foreground" />
		<span class="text-xs font-medium text-muted-foreground">
			{$_('admin.channelMonitor.template.selectorLabel', { default: '请求模板' })}
		</span>
	</div>
	<div class="flex items-center gap-2">
		<NativeSelect
			value={selectedValue}
			{options}
			disabled={loading}
			onchange={handleChange}
			data-testid="template-selector-dropdown"
		/>
		{#if selectedTemplate}
			<Button
				variant="ghost"
				size="icon"
				class="h-7 w-7 text-muted-foreground hover:text-destructive"
				title={$_('admin.channelMonitor.template.clearTemplate', { default: '清除模板' })}
				onclick={clearTemplate}
			>
				<X class="h-4 w-4" />
			</Button>
		{/if}
	</div>
	{#if selectedTemplate}
		<div class="flex items-center gap-2 text-xs text-muted-foreground">
			<Badge variant="outline" class="text-xs">
				{selectedTemplate.body_override_mode}
			</Badge>
			<span>
				{$_('admin.channelMonitor.template.headersSummary', {
					default: `${Object.keys(selectedTemplate.extra_headers || {}).length} custom headers`,
					values: { n: Object.keys(selectedTemplate.extra_headers || {}).length }
				})}
			</span>
		</div>
	{/if}
</div>
