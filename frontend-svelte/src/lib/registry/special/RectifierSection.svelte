<script lang="ts">
	/**
	 * RectifierSection · 请求矫正器（M10e · gateway tab）
	 *
	 * 端口自 frontend/src/views/admin/settings-registry/special/RectifierSection.vue。
	 *
	 * 设计：
	 *   - 与 flat-form 解耦 —— onMount GET /api/admin/settings/rectifier，
	 *     Save 触发 PUT 整体替换；不进 patchSettings 流水线。
	 *   - 1 主开关 + 3 子开关；apikey_signature_enabled 展开 patterns string[] CRUD。
	 *   - patterns 空字符串在 save 时过滤掉，与 Vue tree 同语义。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { X } from '@lucide/svelte';
	import {
		settingsApi,
		type RectifierSettings
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
	let form = $state<RectifierSettings>({
		enabled: true,
		thinking_signature_enabled: true,
		thinking_budget_enabled: true,
		apikey_signature_enabled: false,
		apikey_signature_patterns: []
	});

	onMount(async () => {
		loading = true;
		try {
			const settings = await settingsApi.getRectifierSettings();
			form = {
				...form,
				...settings,
				apikey_signature_patterns: Array.isArray(settings.apikey_signature_patterns)
					? [...settings.apikey_signature_patterns]
					: []
			};
		} catch {
			// 静默
		} finally {
			loading = false;
		}
	});

	function toggleField(key: keyof RectifierSettings) {
		const v = form[key];
		if (typeof v === 'boolean') {
			form = { ...form, [key]: !v } as RectifierSettings;
		}
	}

	function onPatternInput(index: number, e: Event) {
		const raw = (e.target as HTMLInputElement).value;
		form = {
			...form,
			apikey_signature_patterns: form.apikey_signature_patterns.map((p, i) =>
				i === index ? raw : p
			)
		};
	}

	function addPattern() {
		form = {
			...form,
			apikey_signature_patterns: [...form.apikey_signature_patterns, '']
		};
	}

	function removePattern(index: number) {
		form = {
			...form,
			apikey_signature_patterns: form.apikey_signature_patterns.filter((_, i) => i !== index)
		};
	}

	async function save() {
		saving = true;
		try {
			const updated = await settingsApi.updateRectifierSettings({
				enabled: form.enabled,
				thinking_signature_enabled: form.thinking_signature_enabled,
				thinking_budget_enabled: form.thinking_budget_enabled,
				apikey_signature_enabled: form.apikey_signature_enabled,
				apikey_signature_patterns: form.apikey_signature_patterns.filter(
					(p) => p.trim() !== ''
				)
			});
			form = {
				...form,
				...updated,
				apikey_signature_patterns: Array.isArray(updated.apikey_signature_patterns)
					? [...updated.apikey_signature_patterns]
					: []
			};
			showSuccess($_('admin.settings.rectifier.saved'));
		} catch (err) {
			showError(
				err instanceof Error ? err.message : $_('admin.settings.rectifier.saveFailed')
			);
		} finally {
			saving = false;
		}
	}
</script>

{#snippet toggleRow(
	id: string,
	testId: string,
	checked: boolean,
	label: string,
	hint: string,
	onclick: () => void
)}
	<div class="flex items-center justify-between gap-4">
		<div class="min-w-0">
			<label class="block text-sm font-medium text-foreground" for={id}>{label}</label>
			<p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>
		</div>
		<Button
			{id}
			variant="ghost"
			size="icon"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			data-testid={testId}
			data-checked={checked}
			{onclick}
			class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors {checked
				? 'bg-primary'
				: 'bg-muted'}"
		>
			<span
				class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {checked
					? 'translate-x-4'
					: 'translate-x-0.5'}"
			></span>
		</Button>
	</div>
{/snippet}

<div class="flex flex-col gap-4" data-special="rectifier">
	{#if loading}
		<div
			data-testid="rectifier-loading"
			class="flex items-center gap-2 text-sm text-muted-foreground"
		>
			{$_('common.loading')}
		</div>
	{:else}
		{@render toggleRow(
			'rectifier-enabled',
			'rectifier-enabled',
			form.enabled,
			$_('admin.settings.rectifier.enabled'),
			$_('admin.settings.rectifier.enabledHint'),
			() => toggleField('enabled')
		)}

		{#if form.enabled}
			<div class="flex flex-col gap-4 border-t border-border pt-4">
				{@render toggleRow(
					'rectifier-thinking-signature',
					'rectifier-thinking-signature',
					form.thinking_signature_enabled,
					$_('admin.settings.rectifier.thinkingSignature'),
					$_('admin.settings.rectifier.thinkingSignatureHint'),
					() => toggleField('thinking_signature_enabled')
				)}
				{@render toggleRow(
					'rectifier-thinking-budget',
					'rectifier-thinking-budget',
					form.thinking_budget_enabled,
					$_('admin.settings.rectifier.thinkingBudget'),
					$_('admin.settings.rectifier.thinkingBudgetHint'),
					() => toggleField('thinking_budget_enabled')
				)}
				{@render toggleRow(
					'rectifier-apikey-signature',
					'rectifier-apikey-signature',
					form.apikey_signature_enabled,
					$_('admin.settings.rectifier.apikeySignature'),
					$_('admin.settings.rectifier.apikeySignatureHint'),
					() => toggleField('apikey_signature_enabled')
				)}

				{#if form.apikey_signature_enabled}
					<div
						data-testid="rectifier-patterns-block"
						class="ml-4 flex flex-col gap-2 border-l-2 border-border pl-4"
					>
						<div>
							<label class="block text-sm font-medium text-foreground" for="rectifier-pattern-0">
								{$_('admin.settings.rectifier.apikeyPatterns')}
							</label>
							<p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
								{$_('admin.settings.rectifier.apikeyPatternsHint')}
							</p>
						</div>
						{#each form.apikey_signature_patterns as pattern, index (index)}
							<div
								data-testid="rectifier-pattern-row"
								data-row-index={index}
								class="flex items-center gap-2"
							>
								<Input
									id="rectifier-pattern-{index}"
									type="text"
									data-testid="rectifier-pattern-input"
									placeholder={$_('admin.settings.rectifier.apikeyPatternPlaceholder')}
									value={pattern}
									oninput={(e) => onPatternInput(index, e)}
									class="h-9 flex-1 font-mono text-xs"
								/>
								<Button
									variant="ghost"
									size="icon"
									data-testid="rectifier-pattern-remove"
									aria-label={$_('common.delete')}
									onclick={() => removePattern(index)}
									class="h-7 w-7 text-muted-foreground hover:border-destructive/25 hover:bg-destructive/10 hover:text-destructive"
								>
									<X class="h-3 w-3" />
								</Button>
							</div>
						{/each}
						<Button
							variant="outline"
							size="sm"
							data-testid="rectifier-pattern-add"
							onclick={addPattern}
							class="w-fit"
						>
							+ {$_('admin.settings.rectifier.addPattern')}
						</Button>
					</div>
				{/if}
			</div>
		{/if}

		<div class="flex justify-end border-t border-border pt-4">
			<Button
				variant="outline"
				class="h-9"
				data-testid="rectifier-save"
				disabled={saving}
				onclick={save}
			>
				{saving ? $_('common.saving') : $_('common.save')}
			</Button>
		</div>
	{/if}
</div>
