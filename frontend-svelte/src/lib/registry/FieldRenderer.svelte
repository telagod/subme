<script lang="ts">
	/**
	 * FieldRenderer · 单字段渲染器（POC 4）
	 *
	 * 端口自 frontend/src/views/admin/settings-registry/FieldRenderer.vue。
	 * 删繁就简：bits-ui Select 在 jsdom 下渲染体感复杂（portal/popup），POC 4 暂用原生
	 * <select> + sentinel —— 后续 M10 视需要再换 bits-ui Select。Switch / Input 同走原生，
	 * 保持类型一致性与测试可断言性；样式通过 tailwind 自家 utilities 兜住，与 Vue tree
	 * 的视觉密度对齐（h-9 / px-3 / rounded-md / border）。
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
</script>

<div class="settings-field" data-field-key={field.key} data-field-type={field.type} data-dirty={dirty}>
	{#if field.type === 'switch' || field.type === 'checkbox'}
		<div class="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
			<div class="min-w-0">
				<label class="block text-sm font-medium text-foreground" for={`f-${field.key}`}>{label}</label>
				{#if description}
					<p class="mt-0.5 text-xs text-muted-foreground">{description}</p>
				{/if}
			</div>
			<button
				id={`f-${field.key}`}
				type="button"
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
			</button>
		</div>
	{:else}
		<label class="block text-sm font-medium text-foreground" for={`f-${field.key}`}>{label}</label>

		{#if field.type === 'text'}
			<input
				id={`f-${field.key}`}
				type="text"
				class="mt-1 block h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
				value={(value as string) ?? ''}
				placeholder={field.placeholder ?? ''}
				oninput={onText}
			/>
		{:else if field.type === 'password'}
			<input
				id={`f-${field.key}`}
				type="password"
				autocomplete="new-password"
				class="mt-1 block h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
				value={(value as string) ?? ''}
				placeholder={passwordPlaceholder}
				oninput={onText}
			/>
		{:else if field.type === 'number'}
			<input
				id={`f-${field.key}`}
				type="number"
				class="mt-1 block h-9 w-32 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
				value={value === undefined || value === null ? '' : String(value)}
				placeholder={field.placeholder ?? ''}
				min={field.min}
				max={field.max}
				oninput={onNumber}
			/>
		{:else if field.type === 'textarea'}
			<textarea
				id={`f-${field.key}`}
				rows="4"
				class="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-ring"
				placeholder={field.placeholder ?? ''}
				value={(value as string) ?? ''}
				oninput={onTextarea}
			></textarea>
		{:else if field.type === 'select'}
			<select
				id={`f-${field.key}`}
				class="mt-1 block h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
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
			</select>
		{/if}

		{#if description}
			<p class="mt-0.5 text-xs text-muted-foreground">{description}</p>
		{/if}
	{/if}
</div>
