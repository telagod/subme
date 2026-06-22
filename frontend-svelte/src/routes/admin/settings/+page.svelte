<script lang="ts">
	/**
	 * /admin/settings · Settings Registry 主页（POC 4）
	 *
	 * 端口自 frontend/src/views/admin/settings-registry/SettingsRegistryView.vue。
	 *
	 * 状态机：
	 *   - loading=true 期间渲染 skeleton；初始 GET 完成后切换到 form 视图。
	 *   - savedSettings = 最近一次服务器快照（diff 基准）；form = 当前编辑视图。
	 *   - dirtyKeys = 仅由 onFieldUpdate 维护的 Set；保存时构造 patch。
	 *
	 * 保存流程：
	 *   1. 取 dirty keys
	 *   2. 用 buildZodSchema(emailSection).safeParse 校验 form 整体（patch 语义下
	 *      不在 schema 中的键被 passthrough 放行）
	 *   3. JSON.stringify 深比较过滤"toggle 又改回去"的 no-op
	 *   4. 调 settingsApi.patchSettings(payload)
	 *   5. 成功：savedSettings = { ...form }，清空 dirtyKeys，toast 成功
	 *
	 * 重置：把 savedSettings 复制回 form，清 dirtyKeys。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import Button from '$lib/ui/Button.svelte';
	import SectionRenderer from '$lib/registry/SectionRenderer.svelte';
	import { settingsTabs } from '$lib/registry/settings.schema';
	import { buildZodSchema } from '$lib/registry/zod';
	import { settingsApi } from '$lib/api/admin/settingsRegistry';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';

	let loading = $state(true);
	let saving = $state(false);
	let savedSettings = $state<Record<string, unknown>>({});
	let form = $state<Record<string, unknown>>({});
	let dirtyKeys = $state<Set<string>>(new Set());
	let activeTabId = $state('email');

	const activeTab = $derived(settingsTabs.find((t) => t.id === activeTabId) ?? settingsTabs[0]);
	const dirtyCount = $derived(dirtyKeys.size);

	// 当前 tab 的 zod schema —— 仅校验 fields 字段，passthrough 兜其余。
	const zodSchema = $derived(buildZodSchema(activeTab?.sections ?? []));

	onMount(() => {
		void loadSettings();
	});

	async function loadSettings() {
		loading = true;
		try {
			const snapshot = await settingsApi.getSettings();
			savedSettings = { ...snapshot };
			form = { ...snapshot };
			dirtyKeys = new Set();
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('admin.settings.failedToLoad'));
		} finally {
			loading = false;
		}
	}

	function onFieldUpdate(key: string, value: unknown) {
		// 不变性写入：保证 $derived 触发。
		form = { ...form, [key]: value };
		if (!dirtyKeys.has(key)) {
			dirtyKeys = new Set([...dirtyKeys, key]);
		}
	}

	async function handleSave() {
		const touched = Array.from(dirtyKeys);
		if (touched.length === 0) return;

		// 1. 构造 patch —— 跳过 no-op 与未定义。
		const patch: Record<string, unknown> = {};
		for (const k of touched) {
			const current = form[k];
			const saved = savedSettings[k];
			if (JSON.stringify(current) === JSON.stringify(saved)) continue;
			if (current === undefined) continue;
			patch[k] = current;
		}

		if (Object.keys(patch).length === 0) {
			dirtyKeys = new Set();
			showSuccess($_('admin.settings.settingsSaved'));
			return;
		}

		// 2. 前端 zod 兜底（passthrough）。
		const parsed = zodSchema.safeParse({ ...savedSettings, ...form });
		if (!parsed.success) {
			showError(parsed.error.issues[0]?.message ?? 'validation failed');
			return;
		}

		// 3. 提交。
		saving = true;
		try {
			await settingsApi.patchSettings(patch);
			savedSettings = { ...form };
			dirtyKeys = new Set();
			showSuccess($_('admin.settings.settingsSaved'));
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('admin.settings.failedToSave'));
		} finally {
			saving = false;
		}
	}

	function handleReset() {
		form = { ...savedSettings };
		dirtyKeys = new Set();
	}

	function switchTab(id: string) {
		activeTabId = id;
	}
</script>

<svelte:head>
	<title>{$_('nav.quench.settings', { default: '设置' })} · sub2api admin</title>
</svelte:head>

<section class="space-y-5" data-page="admin-settings">
	<header class="flex items-center justify-between">
		<h1 class="text-2xl font-semibold tracking-tight">
			{$_('nav.quench.settings', { default: '设置' })}
		</h1>
		<div class="flex items-center gap-2">
			<Button
				variant="outline"
				size="sm"
				data-testid="settings-reset"
				onclick={handleReset}
				disabled={dirtyCount === 0 || saving}
			>
				{$_('common.discard', { default: '放弃' })}
			</Button>
			<Button
				size="sm"
				data-testid="settings-save"
				onclick={handleSave}
				disabled={dirtyCount === 0 || saving}
			>
				{saving
					? $_('admin.settings.saving')
					: dirtyCount > 0
						? `${$_('admin.settings.saveSettings')} (${dirtyCount})`
						: $_('admin.settings.saveSettings')}
			</Button>
		</div>
	</header>

	<!-- Tabs -->
	<nav class="flex gap-1 border-b border-border" aria-label="settings tabs">
		{#each settingsTabs as tab (tab.id)}
			<Button
				variant="ghost"
				size="sm"
				role="tab"
				aria-selected={activeTabId === tab.id}
				data-tab-id={tab.id}
				class="-mb-px rounded-none border-b-2 px-3 {activeTabId ===
				tab.id
					? 'border-primary text-foreground'
					: 'border-transparent text-muted-foreground hover:text-foreground'}"
				onclick={() => switchTab(tab.id)}
			>
				{$_(tab.labelKey, { default: tab.id })}
			</Button>
		{/each}
	</nav>

	{#if loading}
		<div class="space-y-3" data-testid="settings-skeleton">
			<div class="h-24 animate-pulse rounded-lg border border-border bg-muted/30"></div>
			<div class="h-48 animate-pulse rounded-lg border border-border bg-muted/30"></div>
			<div class="h-32 animate-pulse rounded-lg border border-border bg-muted/30"></div>
		</div>
	{:else}
		<div class="space-y-4">
			{#each activeTab?.sections ?? [] as section (section.id)}
				<SectionRenderer
					{section}
					values={form}
					{dirtyKeys}
					onFieldUpdate={(e) => onFieldUpdate(e.key, e.value)}
				/>
			{/each}
		</div>
	{/if}
</section>
