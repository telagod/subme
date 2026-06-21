<script lang="ts">
	/**
	 * DisableTotpDialog · StandardDialog 关闭 2FA（M7 profile/security）
	 *
	 * 行为：
	 *   - 要求当前 TOTP code + 账户密码双因子，与 Vue tree disableTotp 对齐。
	 *   - 成功 → toast + close + onDisabled() 父刷新。
	 *   - 失败 → toast 错误，dialog 不关，给重试空间。
	 */
	import { _ } from 'svelte-i18n';
	import { AlertTriangle } from '@lucide/svelte';
	import { disableTotp } from '$lib/api/user/profile';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';

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

<StandardDialog
	bind:open
	width="sm"
	title={$_('user.security.totp.disableTitle', {
		default: 'Disable two-factor authentication?'
	})}
	data-testid="totp-disable-dialog"
>
	<div class="mt-4 space-y-5">
		<div
			class="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive"
		>
			<div
				class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10"
			>
				<AlertTriangle class="h-4 w-4" />
			</div>
			<p class="m-0 text-sm leading-5">
				{$_('user.security.totp.disableWarning', {
					default:
						'After disabling, your account will rely on password only. We recommend keeping 2FA on.'
				})}
			</p>
		</div>

		<div class="space-y-4">
			<div class="space-y-1.5">
				<label for="td-totp" class="text-sm font-medium text-foreground">
					{$_('user.security.totp.enterCode', { default: 'Authenticator code' })}
				</label>
				<Input
					id="td-totp"
					type="text"
					inputmode="numeric"
					autocomplete="one-time-code"
					maxlength={6}
					data-testid="td-totp"
					placeholder="123456"
					bind:value={totpCode}
					class="font-mono"
				/>
			</div>
			<div class="space-y-1.5">
				<label for="td-pwd" class="text-sm font-medium text-foreground">
					{$_('user.security.totp.enterPassword', { default: 'Current password' })}
				</label>
				<Input
					id="td-pwd"
					type="password"
					autocomplete="current-password"
					data-testid="td-pwd"
					bind:value={password}
				/>
			</div>
		</div>

		<div class="flex items-center justify-end gap-2 border-t border-border pt-4">
			<Button
				type="button"
				variant="outline"
				data-testid="td-cancel"
				disabled={submitting}
				onclick={handleCancel}
			>
				{$_('user.security.totp.cancel', { default: 'Cancel' })}
			</Button>
			<Button
				type="button"
				variant="destructive"
				data-testid="td-confirm"
				disabled={submitting}
				onclick={handleConfirm}
			>
				{submitting
					? $_('user.security.totp.disabling', { default: 'Disabling…' })
					: $_('user.security.totp.confirmDisable', { default: 'Confirm disable' })}
			</Button>
		</div>
	</div>
</StandardDialog>
