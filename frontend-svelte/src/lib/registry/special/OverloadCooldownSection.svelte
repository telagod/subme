<script lang="ts">
	/**
	 * OverloadCooldownSection · 529 overload cooldown special section（M11 gateway）
	 *
	 * 端口自 frontend/src/views/admin/settings-registry/special/OverloadCooldownSection.vue。
	 *
	 * 设计：
	 *   - 与 flat-form 解耦 —— onMount GET /api/admin/settings/overload-cooldown，
	 *     Save 触发 PUT 整体替换；不进 patchSettings 流水线。
	 *   - 单一 toggle + 数字输入（1-120 分钟），cooldown_minutes 仅在 enabled 时露面。
	 *   - 保留 SectionRenderer 统一签名（{values, dirtyKeys, onFieldUpdate}）但全部 unused。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import {
		settingsApi,
		type OverloadCooldownSettings
	} from '$lib/api/admin/settingsRegistry';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';

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
	let form = $state<OverloadCooldownSettings>({ enabled: true, cooldown_minutes: 10 });

	onMount(async () => {
		loading = true;
		try {
			const settings = await settingsApi.getOverloadCooldownSettings();
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

	function onCooldownInput(e: Event) {
		const raw = (e.target as HTMLInputElement).value;
		form = { ...form, cooldown_minutes: raw === '' ? 0 : Number(raw) };
	}

	async function save() {
		saving = true;
		try {
			const updated = await settingsApi.updateOverloadCooldownSettings({
				enabled: form.enabled,
				cooldown_minutes: form.cooldown_minutes
			});
			form = { ...form, ...updated };
			showSuccess($_('admin.settings.overloadCooldown.saved'));
		} catch (err) {
			showError(
				err instanceof Error
					? err.message
					: $_('admin.settings.overloadCooldown.saveFailed')
			);
		} finally {
			saving = false;
		}
	}
</script>

<div class="flex flex-col gap-4" data-special="overload-cooldown">
	{#if loading}
		<div
			data-testid="overload-cooldown-loading"
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
					for="overload-cooldown-enabled"
				>
					{$_('admin.settings.overloadCooldown.enabled')}
				</label>
				<p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
					{$_('admin.settings.overloadCooldown.enabledHint')}
				</p>
			</div>
			<Button
				id="overload-cooldown-enabled"
				variant="ghost"
				size="icon"
				role="switch"
				aria-checked={form.enabled}
				aria-label={$_('admin.settings.overloadCooldown.enabled')}
				data-testid="overload-cooldown-enabled"
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
			</Button>
		</div>

		{#if form.enabled}
			<div class="flex flex-col gap-3 border-t border-border pt-4">
				<div class="flex flex-col gap-1">
					<label
						class="text-xs font-medium text-muted-foreground"
						for="overload-cooldown-minutes"
					>
						{$_('admin.settings.overloadCooldown.cooldownMinutes')}
					</label>
					<Input
						id="overload-cooldown-minutes"
						type="number"
						min="1"
						max="120"
						data-testid="overload-cooldown-minutes"
						class="h-9 w-32 font-mono"
						value={form.cooldown_minutes}
						oninput={onCooldownInput}
					/>
					<p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
						{$_('admin.settings.overloadCooldown.cooldownMinutesHint')}
					</p>
				</div>
			</div>
		{/if}

		<div class="flex justify-end border-t border-border pt-4">
			<Button
				variant="outline"
				class="h-9"
				data-testid="overload-cooldown-save"
				disabled={saving}
				onclick={save}
			>
				{saving ? $_('common.saving') : $_('common.save')}
			</Button>
		</div>
	{/if}
</div>
