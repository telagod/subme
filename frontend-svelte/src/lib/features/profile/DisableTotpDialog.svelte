<script lang="ts">
	/**
	 * DisableTotpDialog · bits-ui Dialog 关闭 2FA（M7 profile/security）
	 *
	 * 行为：
	 *   - 要求当前 TOTP code + 账户密码双因子，与 Vue tree disableTotp 对齐。
	 *   - 成功 → toast + close + onDisabled() 父刷新。
	 *   - 失败 → toast 错误，dialog 不关，给重试空间。
	 */
	import { Dialog } from 'bits-ui';
	import { _ } from 'svelte-i18n';
	import { AlertTriangle } from '@lucide/svelte';
	import { disableTotp } from '$lib/api/user/profile';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';

	type Props = {
		open: boolean;
		onDisabled?: () => void;
	};

	let { open = $bindable(false), onDisabled }: Props = $props();

	let totpCode = $state('');
	let password = $state('');
	let submitting = $state(false);

	async function handleConfirm() {
		if (submitting) return;
		if (!/^\d{6}$/.test(totpCode.trim()) || password.length < 1) {
			showError(
				$_('user.security.totp.disableMissing', {
					default: 'Enter both your authenticator code and current password.'
				})
			);
			return;
		}
		submitting = true;
		try {
			await disableTotp({ totpCode: totpCode.trim(), password });
			showSuccess(
				$_('user.security.totp.disableSuccess', {
					default: 'Two-factor authentication disabled'
				})
			);
			onDisabled?.();
			open = false;
			setTimeout(reset, 200);
		} catch (err) {
			const e = err as Error;
			showError(
				e?.message ??
					$_('user.security.totp.disableFailed', { default: 'Failed to disable' })
			);
		} finally {
			submitting = false;
		}
	}

	function handleCancel() {
		if (submitting) return;
		open = false;
		setTimeout(reset, 200);
	}

	function reset() {
		totpCode = '';
		password = '';
		submitting = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
		/>
		<Dialog.Content
			data-testid="totp-disable-dialog"
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
						{$_('user.security.totp.disableTitle', {
							default: 'Disable two-factor authentication?'
						})}
					</Dialog.Title>
					<Dialog.Description class="text-sm text-muted-foreground">
						{$_('user.security.totp.disableWarning', {
							default:
								'After disabling, your account will rely on password only. We recommend keeping 2FA on.'
						})}
					</Dialog.Description>
				</div>
			</div>

			<div class="mt-5 space-y-4">
				<div class="space-y-1.5">
					<label for="td-totp" class="text-sm font-medium text-foreground">
						{$_('user.security.totp.enterCode', { default: 'Authenticator code' })}
					</label>
					<input
						id="td-totp"
						type="text"
						inputmode="numeric"
						autocomplete="one-time-code"
						maxlength="6"
						data-testid="td-totp"
						placeholder="123456"
						bind:value={totpCode}
						class="block h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
					/>
				</div>
				<div class="space-y-1.5">
					<label for="td-pwd" class="text-sm font-medium text-foreground">
						{$_('user.security.totp.enterPassword', { default: 'Current password' })}
					</label>
					<input
						id="td-pwd"
						type="password"
						autocomplete="current-password"
						data-testid="td-pwd"
						bind:value={password}
						class="block h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
					/>
				</div>
			</div>

			<div class="mt-6 flex items-center justify-end gap-2">
				<button
					type="button"
					data-testid="td-cancel"
					disabled={submitting}
					onclick={handleCancel}
					class="inline-flex h-9 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
				>
					{$_('user.security.totp.cancel', { default: 'Cancel' })}
				</button>
				<button
					type="button"
					data-testid="td-confirm"
					disabled={submitting}
					onclick={handleConfirm}
					class="inline-flex h-9 items-center justify-center rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{submitting
						? $_('user.security.totp.disabling', { default: 'Disabling…' })
						: $_('user.security.totp.confirmDisable', { default: 'Confirm disable' })}
				</button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
