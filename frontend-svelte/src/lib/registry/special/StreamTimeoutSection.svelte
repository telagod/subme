<script lang="ts">
	/**
	 * StreamTimeoutSection · 流式响应超时处理（M10e · gateway tab）
	 *
	 * 端口自 frontend/src/views/admin/settings-registry/special/StreamTimeoutSection.vue。
	 *
	 * 设计：
	 *   - 与 flat-form 解耦 —— onMount GET /api/admin/settings/stream-timeout，
	 *     Save 触发 PUT 整体替换；不进 patchSettings 流水线（同 OverloadCooldown 模式）。
	 *   - enable + action select + 3 number inputs，subfields 仅在 enabled 时露面。
	 *   - temp_unsched_minutes 仅在 action='temp_unsched' 时露面。
	 *   - select 严格 sentinel-safe —— 三个具体值 temp_unsched|error|none，绝无空 value。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import {
		settingsApi,
		type StreamTimeoutSettings
	} from '$lib/api/admin/settingsRegistry';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';

	type FieldUpdate = { key: string; value: unknown };

	type Props = {
		values?: Record<string, unknown>;
		dirtyKeys?: Set<string>;
		onFieldUpdate?: (e: FieldUpdate) => void;
	};

	// 不消费 props 字段 —— 仅匹配 SectionRenderer 契约。
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { values: _v, dirtyKeys: _d, onFieldUpdate: _f }: Props = $props();

	let loading = $state(true);
	let saving = $state(false);
	let form = $state<StreamTimeoutSettings>({
		enabled: true,
		action: 'temp_unsched',
		temp_unsched_minutes: 5,
		threshold_count: 3,
		threshold_window_minutes: 10
	});

	onMount(async () => {
		loading = true;
		try {
			const settings = await settingsApi.getStreamTimeoutSettings();
			form = { ...form, ...settings };
		} catch {
			// 静默：form 留默认值。
		} finally {
			loading = false;
		}
	});

	function toggleEnabled() {
		form = { ...form, enabled: !form.enabled };
	}

	function onActionChange(e: Event) {
		const raw = (e.target as HTMLSelectElement).value as 'temp_unsched' | 'error' | 'none';
		form = { ...form, action: raw };
	}

	function onNumberInput(key: keyof StreamTimeoutSettings, e: Event) {
		const raw = (e.target as HTMLInputElement).value;
		const num = raw === '' ? 0 : Number(raw);
		form = { ...form, [key]: num } as StreamTimeoutSettings;
	}

	async function save() {
		saving = true;
		try {
			const updated = await settingsApi.updateStreamTimeoutSettings({
				enabled: form.enabled,
				action: form.action,
				temp_unsched_minutes: form.temp_unsched_minutes,
				threshold_count: form.threshold_count,
				threshold_window_minutes: form.threshold_window_minutes
			});
			form = { ...form, ...updated };
			showSuccess($_('admin.settings.streamTimeout.saved'));
		} catch (err) {
			showError(
				err instanceof Error ? err.message : $_('admin.settings.streamTimeout.saveFailed')
			);
		} finally {
			saving = false;
		}
	}
</script>

<div class="flex flex-col gap-4" data-special="stream-timeout">
	{#if loading}
		<div
			data-testid="stream-timeout-loading"
			class="flex items-center gap-2 text-sm text-muted-foreground"
		>
			{$_('common.loading')}
		</div>
	{:else}
		<!-- enabled toggle -->
		<div class="flex items-center justify-between gap-4">
			<div class="min-w-0">
				<label
					class="block text-sm font-medium text-foreground"
					for="stream-timeout-enabled"
				>
					{$_('admin.settings.streamTimeout.enabled')}
				</label>
				<p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
					{$_('admin.settings.streamTimeout.enabledHint')}
				</p>
			</div>
			<button
				id="stream-timeout-enabled"
				type="button"
				role="switch"
				aria-checked={form.enabled}
				aria-label={$_('admin.settings.streamTimeout.enabled')}
				data-testid="stream-timeout-enabled"
				data-checked={form.enabled}
				onclick={toggleEnabled}
				class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors {form.enabled
					? 'bg-primary'
					: 'bg-muted'}"
			>
				<span
					class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {form.enabled
						? 'translate-x-4'
						: 'translate-x-0.5'}"
				></span>
			</button>
		</div>

		{#if form.enabled}
			<div class="flex flex-col gap-3 border-t border-border pt-4">
				<!-- action select -->
				<div class="flex flex-col gap-1">
					<label
						class="text-xs font-medium text-muted-foreground"
						for="stream-timeout-action"
					>
						{$_('admin.settings.streamTimeout.action')}
					</label>
					<select
						id="stream-timeout-action"
						data-testid="stream-timeout-action"
						value={form.action}
						onchange={onActionChange}
						class="h-9 w-64 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
					>
						<option value="temp_unsched"
							>{$_('admin.settings.streamTimeout.actionTempUnsched')}</option
						>
						<option value="error">{$_('admin.settings.streamTimeout.actionError')}</option>
						<option value="none">{$_('admin.settings.streamTimeout.actionNone')}</option>
					</select>
					<p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
						{$_('admin.settings.streamTimeout.actionHint')}
					</p>
				</div>

				{#if form.action === 'temp_unsched'}
					<div class="flex flex-col gap-1">
						<label
							class="text-xs font-medium text-muted-foreground"
							for="stream-timeout-temp-unsched-minutes"
						>
							{$_('admin.settings.streamTimeout.tempUnschedMinutes')}
						</label>
						<input
							id="stream-timeout-temp-unsched-minutes"
							type="number"
							min="1"
							max="60"
							data-testid="stream-timeout-temp-unsched-minutes"
							value={form.temp_unsched_minutes}
							oninput={(e) => onNumberInput('temp_unsched_minutes', e)}
							class="h-9 w-32 rounded-md border border-input bg-background px-3 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring"
						/>
						<p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
							{$_('admin.settings.streamTimeout.tempUnschedMinutesHint')}
						</p>
					</div>
				{/if}

				<div class="flex flex-col gap-1">
					<label
						class="text-xs font-medium text-muted-foreground"
						for="stream-timeout-threshold-count"
					>
						{$_('admin.settings.streamTimeout.thresholdCount')}
					</label>
					<input
						id="stream-timeout-threshold-count"
						type="number"
						min="1"
						max="10"
						data-testid="stream-timeout-threshold-count"
						value={form.threshold_count}
						oninput={(e) => onNumberInput('threshold_count', e)}
						class="h-9 w-32 rounded-md border border-input bg-background px-3 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring"
					/>
					<p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
						{$_('admin.settings.streamTimeout.thresholdCountHint')}
					</p>
				</div>

				<div class="flex flex-col gap-1">
					<label
						class="text-xs font-medium text-muted-foreground"
						for="stream-timeout-threshold-window-minutes"
					>
						{$_('admin.settings.streamTimeout.thresholdWindowMinutes')}
					</label>
					<input
						id="stream-timeout-threshold-window-minutes"
						type="number"
						min="1"
						max="60"
						data-testid="stream-timeout-threshold-window-minutes"
						value={form.threshold_window_minutes}
						oninput={(e) => onNumberInput('threshold_window_minutes', e)}
						class="h-9 w-32 rounded-md border border-input bg-background px-3 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring"
					/>
					<p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
						{$_('admin.settings.streamTimeout.thresholdWindowMinutesHint')}
					</p>
				</div>
			</div>
		{/if}

		<div class="flex justify-end border-t border-border pt-4">
			<button
				type="button"
				data-testid="stream-timeout-save"
				disabled={saving}
				onclick={save}
				class="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm hover:bg-accent disabled:opacity-50"
			>
				{saving ? $_('common.saving') : $_('common.save')}
			</button>
		</div>
	{/if}
</div>
