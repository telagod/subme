<script lang="ts">
	/**
	 * RateLimit429Section · 429 default cooldown special section（M11 gateway）
	 *
	 * 端口自 frontend/src/views/admin/settings-registry/special/RateLimit429Section.vue。
	 *
	 * 设计：
	 *   - 与 flat-form 解耦 —— onMount GET /api/admin/settings/rate-limit-429-cooldown，
	 *     Save 触发 PUT 整体替换；不进 patchSettings 流水线。
	 *   - 单一 toggle + 数字输入（1-7200 秒），cooldown_seconds 仅在 enabled 时露面。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import {
		settingsApi,
		type RateLimit429CooldownSettings
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

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { values: _v, dirtyKeys: _d, onFieldUpdate: _f }: Props = $props();

	let loading = $state(true);
	let saving = $state(false);
	let form = $state<RateLimit429CooldownSettings>({ enabled: true, cooldown_seconds: 5 });

	onMount(async () => {
		loading = true;
		try {
			const settings = await settingsApi.getRateLimit429CooldownSettings();
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
		form = { ...form, cooldown_seconds: raw === '' ? 0 : Number(raw) };
	}

	async function save() {
		saving = true;
		try {
			const updated = await settingsApi.updateRateLimit429CooldownSettings({
				enabled: form.enabled,
				cooldown_seconds: form.cooldown_seconds
			});
			form = { ...form, ...updated };
			showSuccess($_('admin.settings.rateLimit429Cooldown.saved'));
		} catch (err) {
			showError(
				err instanceof Error
					? err.message
					: $_('admin.settings.rateLimit429Cooldown.saveFailed')
			);
		} finally {
			saving = false;
		}
	}
</script>

<div class="flex flex-col gap-4" data-special="rate-limit-429">
	{#if loading}
		<div
			data-testid="rate-limit-429-loading"
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
					for="rate-limit-429-enabled"
				>
					{$_('admin.settings.rateLimit429Cooldown.enabled')}
				</label>
				<p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
					{$_('admin.settings.rateLimit429Cooldown.enabledHint')}
				</p>
			</div>
			<Button
				id="rate-limit-429-enabled"
				variant="ghost"
				size="icon"
				role="switch"
				aria-checked={form.enabled}
				aria-label={$_('admin.settings.rateLimit429Cooldown.enabled')}
				data-testid="rate-limit-429-enabled"
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
						for="rate-limit-429-seconds"
					>
						{$_('admin.settings.rateLimit429Cooldown.cooldownSeconds')}
					</label>
					<Input
						id="rate-limit-429-seconds"
						type="number"
						min="1"
						max="7200"
						data-testid="rate-limit-429-seconds"
						class="h-9 w-32 font-mono"
						value={form.cooldown_seconds}
						oninput={onCooldownInput}
					/>
					<p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
						{$_('admin.settings.rateLimit429Cooldown.cooldownSecondsHint')}
					</p>
				</div>
			</div>
		{/if}

		<div class="flex justify-end border-t border-border pt-4">
			<Button
				variant="outline"
				class="h-9"
				data-testid="rate-limit-429-save"
				disabled={saving}
				onclick={save}
			>
				{saving ? $_('common.saving') : $_('common.save')}
			</Button>
		</div>
	{/if}
</div>
