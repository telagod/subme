<script lang="ts">
	/**
	 * FieldRenderer · 单字段渲染器（POC 4）
	 *
	 * 端口自 frontend/src/views/admin/settings-registry/FieldRenderer.vue。
	 * 表单控件走标准 UI primitives；select 仍保持 sentinel 契约以便测试断言。
	 * file input 保留原生隐藏控件用于浏览器文件选择。
	 *
	 * Sentinel 契约（reshadcn-migration 教训）：
	 *   - select option 的 value 永远是非空字符串
	 *   - '__unset__' 选中 → emit undefined（payload 剔出）
	 *   - 其他业务值原样 emit
	 *
	 * password sensitive 处理：
	 *   - 如果 sensitive=true 且当前 form[<key>_configured] 为 true，
	 *     placeholder 切换到 '*** configured ***'，引导管理员"留空即保留原值"。
	 *
	 * Events / callbacks（Svelte 5 idiomatic）：
	 *   - 用 onUpdate prop 代替 createEventDispatcher —— runes 模式更直观，
	 *     测试时直接传 vi.fn() 即可断言（无需 DOM 事件冒泡）。
	 *   - 父级（SectionRenderer）转发为 field-update 带 key。
 */
	import { _ } from 'svelte-i18n';
	import type { Field } from './types';
	import Button from '$lib/ui/Button.svelte';
	import FileInput from '$lib/ui/FileInput.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';
	import Textarea from '$lib/ui/Textarea.svelte';

	type Props = {
		field: Field;
		value: unknown;
		dirty?: boolean;
		/** 整个 form 视图 —— 用于读 *_configured 镜像字段。 */
		formValues?: Record<string, unknown>;
		/** 字段值更新回调；子组件 emit 业务值（已做 sentinel/数字转换）。 */
		onUpdate?: (value: unknown) => void;
	};

	const { field, value, dirty = false, formValues = {}, onUpdate }: Props = $props();

	const label = $derived.by(() => {
		const t = $_(field.labelKey);
		return t === field.labelKey ? field.key : t;
	});

	const description = $derived.by(() => {
		if (!field.descriptionKey) return '';
		const t = $_(field.descriptionKey);
		return t === field.descriptionKey ? '' : t;
	});

	const passwordPlaceholder = $derived.by(() => {
		if (field.type !== 'password' || !field.sensitive) return field.placeholder ?? '';
		const configured = formValues[`${field.key}_configured`];
		if (configured) return '*** configured ***';
		return field.placeholder ?? '';
	});

	// showWhen 谓词 —— 端口自 Vue tree FieldRenderer.vue:visible computed。
	const visible = $derived.by(() => {
		if (typeof field.showWhen !== 'function') return true;
		try {
			return !!field.showWhen(formValues);
		} catch {
			return true;
		}
	});

	// json/textarea 展示串 —— 与 Vue jsonDisplay computed 同步：
	// 非字符串 → JSON.stringify(..., 2)。
	const jsonDisplay = $derived.by(() => {
		if (field.type !== 'json') return '';
		const v = value;
		if (v === undefined || v === null) return '';
		if (typeof v === 'string') return v;
		try {
			return JSON.stringify(v, null, 2);
		} catch {
			return '';
		}
	});

	let jsonError = $state('');

	function emit(v: unknown) {
		onUpdate?.(v);
	}

	function onText(e: Event) {
		emit((e.target as HTMLInputElement).value);
	}

	function onNumber(e: Event) {
		const raw = (e.target as HTMLInputElement).value;
		// 与 Vue tree 行为对齐：空串 → NaN（已知 quirk，patch 阶段过滤）。
		emit(raw === '' ? undefined : Number(raw));
	}

	function onSwitchClick() {
		emit(!value);
	}

	function onSelect(e: Event) {
		const v = (e.target as HTMLSelectElement).value;
		if (v === '__unset__') {
			emit(undefined);
			return;
		}
		emit(v);
	}

	function onTextarea(e: Event) {
		emit((e.target as HTMLTextAreaElement).value);
	}

	function onJson(e: Event) {
		const raw = (e.target as HTMLTextAreaElement).value;
		jsonError = '';
		if (!raw.trim()) {
			emit(raw);
			return;
		}
		try {
			emit(JSON.parse(raw));
		} catch {
			jsonError = 'Invalid JSON';
			emit(raw);
		}
	}

	// image 类型：最小可用 —— 接受 data URL / http(s) URL；展示当前值 + clear 按钮。
	// Vue tree 用 ImageUpload 组件管 base64 编码，此处保留同接口契约（值是 string）。
	function onImageInput(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result;
			if (typeof result === 'string') emit(result);
		};
		reader.readAsDataURL(file);
	}

	function onImageClear() {
		emit('');
	}
</script>

{#if visible}
<div class="settings-field" data-field-key={field.key} data-field-type={field.type} data-dirty={dirty}>
	{#if field.type === 'switch' || field.type === 'checkbox'}
		<div class="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
			<div class="min-w-0">
				<label class="block text-sm font-medium text-foreground" for={`f-${field.key}`}>{label}</label>
				{#if description}
					<p class="mt-0.5 text-xs text-muted-foreground">{description}</p>
				{/if}
			</div>
			<Button
				id={`f-${field.key}`}
				variant="ghost"
				size="icon"
				role="switch"
				aria-checked={!!value}
				aria-label={label}
				data-checked={!!value}
				onclick={onSwitchClick}
				class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors {!!value
					? 'bg-primary'
					: 'bg-muted'}"
			>
				<span
					class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {!!value
						? 'translate-x-4'
						: 'translate-x-0.5'}"
				></span>
			</Button>
		</div>
	{:else}
		<label class="block text-sm font-medium text-foreground" for={`f-${field.key}`}>{label}</label>

		{#if field.type === 'text'}
			<Input
				id={`f-${field.key}`}
				type="text"
				class="mt-1 h-9"
				value={(value as string) ?? ''}
				placeholder={field.placeholder ?? ''}
				oninput={onText}
			/>
		{:else if field.type === 'password'}
			<Input
				id={`f-${field.key}`}
				type="password"
				autocomplete="new-password"
				class="mt-1 h-9"
				value={(value as string) ?? ''}
				placeholder={passwordPlaceholder}
				oninput={onText}
			/>
		{:else if field.type === 'number'}
			<Input
				id={`f-${field.key}`}
				type="number"
				class="mt-1 h-9 w-32"
				value={value === undefined || value === null ? '' : String(value)}
				placeholder={field.placeholder ?? ''}
				min={field.min}
				max={field.max}
				oninput={onNumber}
			/>
		{:else if field.type === 'textarea'}
			<Textarea
				id={`f-${field.key}`}
				rows={4}
				class="mt-1 font-mono text-xs"
				placeholder={field.placeholder ?? ''}
				value={(value as string) ?? ''}
				oninput={onTextarea}
			/>
		{:else if field.type === 'json'}
			<Textarea
				id={`f-${field.key}`}
				rows={4}
				class="mt-1 font-mono text-xs"
				placeholder={field.placeholder ?? ''}
				value={jsonDisplay}
				oninput={onJson}
			/>
			{#if jsonError}
				<p class="mt-0.5 text-xs text-destructive">{jsonError}</p>
			{/if}
		{:else if field.type === 'image'}
			<div class="mt-1 flex items-center gap-3">
				{#if value && typeof value === 'string'}
					<img src={value} alt={label} class="h-12 w-12 rounded-md border border-border object-cover" />
				{:else}
					<div class="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
						—
					</div>
				{/if}
				<FileInput
					id={`f-${field.key}`}
					accept="image/*"
					onchange={onImageInput}
				>
					{$_('admin.settings.site.uploadImage')}
				</FileInput>
				{#if value}
					<Button
						variant="outline"
						class="h-9"
						onclick={onImageClear}
					>
						{$_('admin.settings.site.remove')}
					</Button>
				{/if}
			</div>
		{:else if field.type === 'select'}
			<NativeSelect
				id={`f-${field.key}`}
				class="mt-1 h-9 w-full"
				value={(value as string) ?? '__unset__'}
				onchange={onSelect}
			>
				{#each field.options ?? [] as opt (opt.value)}
					<!--
						Sentinel 铁律：option 的 value 必须非空字符串。SectionDef.fields[].options[].value
						由 schema 把关；任何 '' 会在 vitest 三向校验里被 grep 抓出来。
					-->
					{@const optLabel = $_(opt.labelKey)}
					<option value={opt.value}>{optLabel === opt.labelKey ? opt.value : optLabel}</option>
				{/each}
			</NativeSelect>
		{/if}

		{#if description}
			<p class="mt-0.5 text-xs text-muted-foreground">{description}</p>
		{/if}
	{/if}
</div>
{/if}
