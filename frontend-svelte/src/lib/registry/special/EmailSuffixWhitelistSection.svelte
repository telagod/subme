<script lang="ts">
	/**
	 * EmailSuffixWhitelistSection · 注册邮箱后缀白名单 special section（M10）
	 *
	 * 端口自 frontend/src/views/admin/settings-registry/special/EmailSuffixWhitelistSection.vue。
	 *
	 * 行为契约（与 Vue tree 严格同步）：
	 *   - 内部状态用「显示态」 —— 已剥离 `@` 前缀的纯域名 + 通配 `*.edu.cn`。
	 *   - emit 时再把"完整域"重新加 `@` 前缀（通配域 `*.…` 原样保留）—— 这是后端格式。
	 *   - 分隔触发键：空格 / 逗号 / 中文逗号 / Enter / Tab。
	 *   - Backspace 在 draft 为空且 chips 非空时弹出末尾 chip。
	 *   - 粘贴：拆分多 token 批量入队。
	 *
	 * 验证：用最小可用域名正则 —— 业务校验最终以后端为准；纯前端拦掉显然非法形式即可。
	 */
	import { _ } from 'svelte-i18n';

	type FieldUpdate = { key: string; value: unknown };

	type Props = {
		values: Record<string, unknown>;
		dirtyKeys: Set<string>;
		onFieldUpdate?: (e: FieldUpdate) => void;
	};

	const { values, onFieldUpdate }: Props = $props();

	// 简版域名验证：a-z0-9-/. 允许，含 `*.` 通配前缀。最终以后端为准。
	const RE_DOMAIN = /^(?:\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

	function normalize(raw: string): string {
		let s = raw.trim().toLowerCase();
		if (s.startsWith('@')) s = s.slice(1);
		return s;
	}

	function fromBackend(arr: unknown): string[] {
		if (!Array.isArray(arr)) return [];
		const out: string[] = [];
		for (const item of arr) {
			if (typeof item !== 'string') continue;
			const norm = normalize(item);
			if (norm && !out.includes(norm)) out.push(norm);
		}
		return out;
	}

	function toBackend(tags: string[]): string[] {
		return tags.map((t) => (t.startsWith('*.') ? t : `@${t}`));
	}

	const sep = new Set([' ', ',', '，', 'Enter', 'Tab']);

	// 初始值从 props 抓 —— 用 untrack 模式：仅看入参 props.values 而不是依赖。
	let tags = $state<string[]>([]);
	let draft = $state('');
	let _initialised = false;

	// 父级 reset / 初始载入：当 props.values 的快照值变更时回灌。
	$effect(() => {
		const incoming = fromBackend(values['registration_email_suffix_whitelist']);
		if (!_initialised) {
			tags = incoming;
			_initialised = true;
			return;
		}
		if (JSON.stringify(incoming) !== JSON.stringify(tags)) {
			tags = incoming;
		}
	});

	function emitTags() {
		onFieldUpdate?.({ key: 'registration_email_suffix_whitelist', value: toBackend(tags) });
	}

	function addTag(raw: string) {
		const t = normalize(raw);
		if (!t || !RE_DOMAIN.test(t) || tags.includes(t)) return;
		tags = [...tags, t];
		emitTags();
	}

	function removeTag(t: string) {
		tags = tags.filter((x) => x !== t);
		emitTags();
	}

	function commitDraft() {
		if (!draft) return;
		addTag(draft);
		draft = '';
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.isComposing) return;
		if (sep.has(e.key)) {
			e.preventDefault();
			commitDraft();
			return;
		}
		if (e.key === 'Backspace' && !draft && tags.length > 0) {
			tags = tags.slice(0, -1);
			emitTags();
		}
	}

	function onPaste(e: ClipboardEvent) {
		const text = e.clipboardData?.getData('text') ?? '';
		if (!text.trim()) return;
		e.preventDefault();
		const tokens = text.split(/[\s,，;]+/).filter(Boolean);
		for (const t of tokens) addTag(t);
	}
</script>

<div class="flex flex-col gap-2.5" data-special="email-suffix-whitelist">
	<div
		class="rounded-md border border-input bg-background px-2.5 py-2 transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring"
	>
		<div class="flex flex-wrap items-center gap-1.5">
			{#each tags as t (t)}
				<span
					class="inline-flex items-center gap-1 rounded-md border border-border bg-muted py-[3px] pl-2.5 pr-1.5"
					data-testid="email-suffix-tag"
					data-tag={t}
				>
					<span class="whitespace-nowrap font-mono text-xs text-foreground">{t}</span>
					<button
						type="button"
						aria-label="remove {t}"
						class="inline-flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
						onclick={() => removeTag(t)}
					>
						<svg class="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</span>
			{/each}
			<input
				type="text"
				data-testid="email-suffix-input"
				class="h-7 min-w-[180px] flex-1 border-none bg-transparent px-1 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground"
				placeholder={tags.length === 0 ? $_('admin.settings.registration.emailSuffixWhitelistPlaceholder') : ''}
				bind:value={draft}
				onkeydown={onKeydown}
				onpaste={onPaste}
				onblur={commitDraft}
			/>
		</div>
	</div>
	<p class="text-[11px] leading-snug text-muted-foreground">
		{$_('admin.settings.registration.emailSuffixWhitelistInputHint')}
	</p>
</div>
