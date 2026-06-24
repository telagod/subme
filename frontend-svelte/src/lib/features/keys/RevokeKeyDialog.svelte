<script lang="ts">
	/**
	 * RevokeKeyDialog · StandardDialog 确认面板（M6）
	 *
	 * 行为：
	 *   - bind:open 双向同步开关，父组件持有状态。
	 *   - 确认 → DELETE /api/v1/keys/:id，成功后 toast + 派发 'revoked' 事件 + 关闭。
	 *   - 失败 → toast 错误，dialog 不关，保留 Cancel 路径。
	 *   - 文案明确「不可逆」+ prefix-suffix 提示，对照 Vue tree deleteConfirmMessage。
	 *
	 * a11y：StandardDialog 统一承接 focus trap / ESC 关闭。
	 */
	import { _ } from 'svelte-i18n';
	import { AlertTriangle } from '@lucide/svelte';
	import { revokeKey, type ApiKey } from '$lib/api/user/apiKeys';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';

	type Props = {
		open: boolean;
		apiKey: ApiKey | null;
		onRevoked?: (id: number) => void;
	};

	let { open = $bindable(false), apiKey, onRevoked }: Props = $props();

	let submitting = $state(false);

	async function handleConfirm() {
		if (!apiKey || submitting) return;
		submitting = true;
		try {
			await revokeKey(apiKey.id);
			showSuccess(
				$_('user.keys.revokeSuccess', { default: 'API 密钥已撤销' })
			);
			onRevoked?.(apiKey.id);
			open = false;
		} catch (err) {
			const e = err as Error;
			showError(
				$_('user.keys.revokeError', {
					default: '撤销 API 密钥失败',
					values: { error: e?.message ?? 'unknown' }
				})
			);
		} finally {
			submitting = false;
		}
	}

	function handleCancel() {
		if (submitting) return;
		open = false;
	}
</script>

<StandardDialog
	bind:open
	width="sm"
	title={$_('user.keys.revokeTitle', { default: '撤销此 API 密钥？' })}
	description={$_('user.keys.revokeDescription', {
		default:
			'This will permanently revoke the key starting with {prefix}... ending in {suffix}. This action cannot be undone.',
		values: {
			prefix: apiKey?.prefix ?? '',
			suffix: apiKey?.suffix ?? ''
		}
	})}
	data-testid="revoke-key-dialog"
>
	<div class="mt-4">
		<div class="flex items-start gap-3">
			<div
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
			>
				<AlertTriangle class="h-5 w-5" />
			</div>
			<p class="m-0 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
				{apiKey?.name ?? apiKey?.prefix ?? ''}
			</p>
		</div>

		<div class="mt-6 flex items-center justify-end gap-2 border-t border-border pt-4">
			<Button
				variant="outline"
				data-testid="revoke-cancel-btn"
				disabled={submitting}
				onclick={handleCancel}
				class="h-9"
			>
				{$_('user.keys.cancel', { default: '取消' })}
			</Button>
			<Button
				variant="destructive"
				data-testid="revoke-confirm-btn"
				disabled={submitting || !apiKey}
				onclick={handleConfirm}
				class="h-9"
			>
				{submitting
					? $_('user.keys.revoking', { default: '撤销中...' })
					: $_('user.keys.revoke', { default: '撤销' })}
			</Button>
		</div>
	</div>
</StandardDialog>
