<script lang="ts">
	/**
	 * AdminApiKeySection · 全局管理员 API key 自管理 special section（M10）
	 *
	 * 端口自 frontend/src/views/admin/settings-registry/special/AdminApiKeySection.vue。
	 *
	 * 设计：
	 *   - 与 flat-form 解耦 —— onMount GET + 操作通过独立 API。
	 *   - 新生成的 key 一次性显示，用户复制后 newKey 持续保留直到组件卸载/再生。
	 *   - 再生成 / 删除前用 StandardDialog 确认；测试模式下 vitest 可 stub clipboard。
	 */
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { settingsApi } from '$lib/api/admin/settingsRegistry';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import ConfirmDialog from '$lib/ui/ConfirmDialog.svelte';

	type FieldUpdate = { key: string; value: unknown };

	type Props = {
		values?: Record<string, unknown>;
		dirtyKeys?: Set<string>;
		/** 不参与 flat-form patch 流水线，但保留签名以匹配 SectionRenderer 契约。 */
		onFieldUpdate?: (e: FieldUpdate) => void;
	};

	// 不消费 props 字段 —— 仅承接 SectionRenderer 统一签名。下划线前缀提示 unused。
	// 用 rest 写法避免 svelte 警告 state_referenced_locally。
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { values: _v, dirtyKeys: _d, onFieldUpdate: _f }: Props = $props();

	let loading = $state(true);
	let keyExists = $state(false);
	let maskedKey = $state('');
	let operating = $state(false);
	let newKey = $state('');
	let confirmOpen = $state(false);
	let confirmMode = $state<'regenerate' | 'delete'>('regenerate');

	onMount(async () => {
		loading = true;
		try {
			const status = await settingsApi.getAdminApiKey();
			keyExists = !!status.exists;
			maskedKey = status.masked_key ?? '';
		} catch {
			// 状态非关键路径，静默；UI 已经默认 not configured。
		} finally {
			loading = false;
		}
	});

	async function create() {
		operating = true;
		try {
			const result = await settingsApi.regenerateAdminApiKey();
			newKey = result.key;
			keyExists = true;
			maskedKey = result.key.substring(0, 10) + '...' + result.key.slice(-4);
			showSuccess($_('admin.settings.adminApiKey.keyGenerated'));
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('common.error'));
		} finally {
			operating = false;
		}
	}

	function openRegenerateConfirm() {
		confirmMode = 'regenerate';
		confirmOpen = true;
	}

	function openDeleteConfirm() {
		confirmMode = 'delete';
		confirmOpen = true;
	}

	async function confirmAdminApiKeyAction() {
		if (confirmMode === 'regenerate') {
			confirmOpen = false;
			await regenerate();
			return;
		}
		await remove();
	}

	async function regenerate() {
		await create();
	}

	async function remove() {
		operating = true;
		try {
			await settingsApi.deleteAdminApiKey();
			keyExists = false;
			maskedKey = '';
			newKey = '';
			confirmOpen = false;
			showSuccess($_('admin.settings.adminApiKey.keyDeleted'));
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('common.error'));
		} finally {
			operating = false;
		}
	}

	function copyNewKey() {
		if (typeof navigator === 'undefined' || !navigator.clipboard) return;
		navigator.clipboard
			.writeText(newKey)
			.then(() => showSuccess($_('admin.settings.adminApiKey.keyCopied')))
			.catch(() => showError($_('common.copyFailed')));
	}
</script>

<div class="flex flex-col gap-4" data-special="admin-api-key">
	<div class="flex items-start gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2.5">
		<svg
			class="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
			/>
		</svg>
		<p class="m-0 text-xs leading-relaxed text-amber-500">
			{$_('admin.settings.adminApiKey.securityWarning')}
		</p>
	</div>

	{#if loading}
		<div data-testid="admin-api-key-loading" class="text-xs text-muted-foreground">
			{$_('common.loading')}
		</div>
	{:else if !keyExists}
		<div class="flex items-center justify-between gap-3">
			<span class="text-xs text-muted-foreground">{$_('admin.settings.adminApiKey.notConfigured')}</span>
			<Button
				data-testid="admin-api-key-create"
				class="h-9"
				disabled={operating}
				onclick={create}
			>
				{operating ? $_('admin.settings.adminApiKey.creating') : $_('admin.settings.adminApiKey.create')}
			</Button>
		</div>
	{:else}
		<div class="flex flex-col gap-3">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<span class="mb-1 block text-xs font-medium text-muted-foreground">
						{$_('admin.settings.adminApiKey.currentKey')}
					</span>
					<code
						data-testid="admin-api-key-masked"
						class="inline-block rounded-md bg-muted px-2 py-1 font-mono text-xs text-foreground">{maskedKey}</code
					>
				</div>
				<div class="flex shrink-0 gap-2">
					<Button
						variant="outline"
						class="h-9"
						data-testid="admin-api-key-regenerate"
						disabled={operating}
						onclick={openRegenerateConfirm}
					>
						{operating
							? $_('admin.settings.adminApiKey.regenerating')
							: $_('admin.settings.adminApiKey.regenerate')}
					</Button>
					<Button
						variant="destructive"
						class="h-9"
						data-testid="admin-api-key-delete"
						disabled={operating}
						onclick={openDeleteConfirm}
					>
						{$_('admin.settings.adminApiKey.delete')}
					</Button>
				</div>
			</div>

			{#if newKey}
				<div class="flex flex-col gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/[0.07] p-3">
					<p class="m-0 text-xs font-medium text-emerald-500">{$_('admin.settings.adminApiKey.keyWarning')}</p>
					<div class="flex items-center gap-2">
						<code
							data-testid="admin-api-key-new"
							class="flex-1 break-all rounded border border-emerald-500/25 bg-background px-2 py-1.5 font-mono text-xs text-foreground"
							>{newKey}</code
						>
						<Button
							class="h-9 shrink-0"
							onclick={copyNewKey}
						>
							{$_('admin.settings.adminApiKey.copyKey')}
						</Button>
					</div>
					<p class="m-0 text-[11px] leading-snug text-emerald-500">
						{$_('admin.settings.adminApiKey.usage')}
					</p>
				</div>
			{/if}
		</div>
	{/if}

	<ConfirmDialog
		bind:open={confirmOpen}
		title={confirmMode === 'regenerate'
			? $_('admin.settings.adminApiKey.regenerate')
			: $_('admin.settings.adminApiKey.delete')}
		description={confirmMode === 'regenerate'
			? $_('admin.settings.adminApiKey.regenerateConfirm')
			: $_('admin.settings.adminApiKey.deleteConfirm')}
		confirmLabel={operating ? $_('common.loading') : $_('common.confirm')}
		variant={confirmMode === 'delete' ? 'danger' : 'warning'}
		loading={operating}
		onConfirm={confirmAdminApiKeyAction}
		data-testid="admin-api-key-confirm-dialog"
		confirmTestId="admin-api-key-confirm-action"
	/>
</div>
