<script lang="ts">
	/**
	 * RevokeKeyDialog · bits-ui Dialog 确认面板（M6）
	 *
	 * 行为：
	 *   - bind:open 双向同步开关，父组件持有状态。
	 *   - 确认 → DELETE /api/v1/keys/:id，成功后 toast + 派发 'revoked' 事件 + 关闭。
	 *   - 失败 → toast 错误，dialog 不关，保留 Cancel 路径。
	 *   - 文案明确「不可逆」+ prefix-suffix 提示，对照 Vue tree deleteConfirmMessage。
	 *
	 * a11y：
	 *   - bits-ui Dialog 自带 focus trap + ESC 关闭。
	 *   - destructive 按钮 aria-label 走 i18n。
	 */
	import { Dialog } from 'bits-ui';
	import { _ } from 'svelte-i18n';
	import { AlertTriangle } from '@lucide/svelte';
	import { revokeKey, type ApiKey } from '$lib/api/user/apiKeys';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';

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
				$_('user.keys.revokeSuccess', { default: 'API key revoked successfully' })
			);
			onRevoked?.(apiKey.id);
			open = false;
		} catch (err) {
			const e = err as Error;
			showError(
				$_('user.keys.revokeError', {
					default: 'Failed to revoke API key',
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

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
		/>
		<Dialog.Content
			data-testid="revoke-key-dialog"
			class="fixed left-1/2 top-1/2 z-50 w-full max-w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-lg outline-none"
		>
			<div class="flex items-start gap-3">
				<div
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
				>
					<AlertTriangle class="h-5 w-5" />
				</div>
				<div class="space-y-1.5">
					<Dialog.Title class="text-base font-semibold text-foreground">
						{$_('user.keys.revokeTitle', { default: 'Revoke API key?' })}
					</Dialog.Title>
					<Dialog.Description class="text-sm text-muted-foreground">
						{$_('user.keys.revokeDescription', {
							default:
								'This will permanently revoke the key starting with {prefix}... ending in {suffix}. This action cannot be undone.',
							values: {
								prefix: apiKey?.prefix ?? '',
								suffix: apiKey?.suffix ?? ''
							}
						})}
					</Dialog.Description>
				</div>
			</div>

			<div class="mt-6 flex items-center justify-end gap-2">
				<button
					type="button"
					data-testid="revoke-cancel-btn"
					disabled={submitting}
					onclick={handleCancel}
					class="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
				>
					{$_('user.keys.cancel', { default: 'Cancel' })}
				</button>
				<button
					type="button"
					data-testid="revoke-confirm-btn"
					disabled={submitting || !apiKey}
					onclick={handleConfirm}
					class="inline-flex h-9 items-center justify-center rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{submitting
						? $_('user.keys.revoking', { default: 'Revoking...' })
						: $_('user.keys.revoke', { default: 'Revoke' })}
				</button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
