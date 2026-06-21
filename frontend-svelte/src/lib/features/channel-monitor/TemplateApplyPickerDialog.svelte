<script lang="ts">
	/**
	 * TemplateApplyPickerDialog — pick which associated monitors receive
	 * the template's settings snapshot.
	 *
	 * Ported from Vue MonitorTemplateApplyPickerDialog.vue.
	 */
	import { _ } from 'svelte-i18n';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import {
		apply as applyTemplate,
		listAssociatedMonitors,
		type AssociatedMonitorBrief
	} from '$lib/api/admin/channelMonitorTemplate';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';

	type Props = {
		open: boolean;
		templateId: number | null;
		templateName: string;
		onApplied?: (affected: number) => void;
	};

	let { open = $bindable(false), templateId, templateName, onApplied }: Props = $props();

	let loading = $state(false);
	let submitting = $state(false);
	let monitors = $state<AssociatedMonitorBrief[]>([]);
	let selectedIds = $state<number[]>([]);

	const selectedSet = $derived(new Set(selectedIds));

	$effect(() => {
		if (open && templateId != null) {
			void fetchMonitors(templateId);
		}
	});

	async function fetchMonitors(id: number) {
		loading = true;
		monitors = [];
		selectedIds = [];
		try {
			const items = await listAssociatedMonitors(id);
			monitors = items;
			selectedIds = items.map((m) => m.id);
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			loading = false;
		}
	}

	function toggle(id: number) {
		const idx = selectedIds.indexOf(id);
		if (idx >= 0) {
			selectedIds = selectedIds.filter((v) => v !== id);
		} else {
			selectedIds = [...selectedIds, id];
		}
	}

	function selectAll() {
		selectedIds = monitors.map((m) => m.id);
	}

	function selectNone() {
		selectedIds = [];
	}

	async function handleApply() {
		if (templateId == null || selectedIds.length === 0 || submitting) return;
		submitting = true;
		try {
			const result = await applyTemplate(templateId, [...selectedIds]);
			showSuccess(
				$_('admin.channelMonitor.template.applySuccess', {
					default: `Applied to ${result.affected} monitors`,
					values: { n: result.affected }
				})
			);
			onApplied?.(result.affected);
			open = false;
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			submitting = false;
		}
	}
</script>

<StandardDialog
	bind:open
	title={$_('admin.channelMonitor.template.applyPickerTitle', {
		default: `Apply template: ${templateName}`,
		values: { name: templateName }
	})}
	width="md"
	data-testid="template-apply-picker-dialog"
>
	<div class="mt-4 space-y-3">
		<p class="text-sm text-muted-foreground">
			{$_('admin.channelMonitor.template.applyPickerHint', {
				default: 'Select which monitors should receive this template\'s settings.'
			})}
		</p>

		{#if loading}
			<div class="py-6 text-center text-sm text-muted-foreground">
				{$_('common.loading', { default: 'Loading...' })}
			</div>
		{:else if monitors.length === 0}
			<div class="py-6 text-center text-sm text-muted-foreground">
				{$_('admin.channelMonitor.template.applyPickerEmpty', {
					default: 'No monitors are associated with this template.'
				})}
			</div>
		{:else}
			<div class="mb-2 flex items-center gap-3 text-xs">
				<Button variant="ghost" size="sm" class="h-auto p-0 text-xs" onclick={selectAll}>
					{$_('common.selectAll', { default: 'Select all' })}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					class="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
					onclick={selectNone}
				>
					{$_('admin.channelMonitor.template.selectNone', { default: 'Select none' })}
				</Button>
				<span class="ml-auto text-muted-foreground">
					{$_('admin.channelMonitor.template.selectedCount', {
						default: `${selectedIds.length} / ${monitors.length} selected`,
						values: { n: selectedIds.length, total: monitors.length }
					})}
				</span>
			</div>

			<ul
				class="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border"
				data-testid="apply-picker-monitor-list"
			>
				{#each monitors as m (m.id)}
					<li class="flex items-center gap-3 px-3 py-2 hover:bg-accent">
						<button
							type="button"
							class="flex w-full cursor-pointer items-center gap-3 bg-transparent text-left"
							onclick={() => toggle(m.id)}
						>
							<Checkbox checked={selectedSet.has(m.id)} />
							<span class="font-medium text-foreground">{m.name}</span>
							<span class="text-xs text-muted-foreground">{m.provider}</span>
							{#if m.provider === 'openai'}
								<span class="text-xs text-muted-foreground">{m.api_mode}</span>
							{/if}
							{#if !m.enabled}
								<Badge variant="secondary" class="ml-auto text-xs">
									{$_('admin.channelMonitor.disabled', { default: 'Disabled' })}
								</Badge>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		{/if}

		<div class="flex justify-end gap-2 pt-2">
			<Button variant="outline" size="sm" onclick={() => (open = false)}>
				{$_('common.cancel', { default: 'Cancel' })}
			</Button>
			<Button
				size="sm"
				disabled={submitting || selectedIds.length === 0}
				onclick={handleApply}
			>
				{submitting
					? $_('common.submitting', { default: 'Applying...' })
					: $_('admin.channelMonitor.template.applyPickerConfirm', {
							default: `Apply to ${selectedIds.length} monitors`,
							values: { n: selectedIds.length }
						})}
			</Button>
		</div>
	</div>
</StandardDialog>
