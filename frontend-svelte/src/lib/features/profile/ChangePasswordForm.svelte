<script lang="ts">
	/**
	 * ChangePasswordForm · superforms SPA + zod 校验（M7 profile/security）
	 *
	 * 字段：currentPassword / newPassword / confirmPassword
	 *   - newPassword 至少 8 位
	 *   - confirmPassword 通过 refine 与 newPassword 比对
	 *
	 * 红线：
	 *   - 表单内不引入 zxcvbn（profile 备注：不增加强度库膨胀）。
	 *   - 任何 Select 都禁止空字符串 value —— 本表单无 Select。
	 *   - 提交成功 / 失败均 toast。
	 */
	import { _ } from 'svelte-i18n';
	import { z } from 'zod';
	import { superForm, defaults } from 'sveltekit-superforms/client';
	import { zod4, zod4Client } from 'sveltekit-superforms/adapters';
	import { KeyRound } from '@lucide/svelte';
	import { changePassword } from '$lib/api/user/profile';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';

	type Props = {
		/** 提交成功回调（父组件可清理状态 / 刷新）。 */
		onChanged?: () => void;
	};

	let { onChanged }: Props = $props();

	const schema = z
		.object({
			currentPassword: z.string().min(1, 'user.security.errors.CURRENT_REQUIRED'),
			newPassword: z.string().min(8, 'user.security.errors.NEW_TOO_SHORT'),
			confirmPassword: z.string().min(8, 'user.security.errors.CONFIRM_TOO_SHORT')
		})
		.refine((d) => d.newPassword === d.confirmPassword, {
			path: ['confirmPassword'],
			message: 'user.security.errors.CONFIRM_MISMATCH'
		});

	type ChangePwdForm = z.infer<typeof schema>;

	const initial = defaults<ChangePwdForm>(zod4(schema));

	const { form, errors, enhance, submitting, reset } = superForm<ChangePwdForm>(initial, {
		SPA: true,
		validators: zod4Client(schema),
		resetForm: false,
		clearOnSubmit: 'errors-and-message',
		onUpdate: async ({ form: validated, cancel }) => {
			cancel();
			if (!validated.valid) return;
			try {
				await changePassword({
					currentPassword: validated.data.currentPassword,
					newPassword: validated.data.newPassword
				});
				showSuccess(
					$_('user.security.passwordChangeSuccess', { default: 'Password changed successfully' })
				);
				reset();
				onChanged?.();
			} catch (err) {
				const e = err as Error;
				const msg =
					e?.message ??
					$_('user.security.errors.UNKNOWN', { default: 'Unknown error' });
				formError = msg;
				showError(msg);
			}
		}
	});

	let formError = $state('');

	function tr(key: string | undefined, fallback: string): string {
		if (!key) return '';
		return $_(key, { default: fallback });
	}
</script>

<section
	class="rounded-lg border border-border bg-card p-6 shadow-sm"
	data-testid="change-password-card"
>
	<header class="mb-5 flex items-start gap-3">
		<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
			<KeyRound class="h-5 w-5" />
		</div>
		<div class="space-y-1">
			<h2 class="text-base font-semibold text-foreground">
				{$_('user.security.changePasswordTitle', { default: 'Change password' })}
			</h2>
			<p class="text-sm text-muted-foreground">
				{$_('user.security.changePasswordDescription', {
					default: 'Use at least 8 characters. Mix letters, numbers, and symbols.'
				})}
			</p>
		</div>
	</header>

	<form
		method="POST"
		use:enhance
		data-testid="change-password-form"
		class="space-y-4"
	>
		<div class="space-y-1.5">
			<label for="cp-current" class="text-sm font-medium text-foreground">
				{$_('user.security.currentPassword', { default: 'Current password' })}
			</label>
			<input
				id="cp-current"
				name="currentPassword"
				type="password"
				autocomplete="current-password"
				data-testid="cp-current"
				bind:value={$form.currentPassword}
				aria-invalid={$errors.currentPassword ? 'true' : undefined}
				class="block h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
			/>
			{#if $errors.currentPassword && $errors.currentPassword[0]}
				<p class="text-xs text-destructive" data-testid="cp-error-current">
					{tr($errors.currentPassword[0], 'Current password is required')}
				</p>
			{/if}
		</div>

		<div class="space-y-1.5">
			<label for="cp-new" class="text-sm font-medium text-foreground">
				{$_('user.security.newPassword', { default: 'New password' })}
			</label>
			<input
				id="cp-new"
				name="newPassword"
				type="password"
				autocomplete="new-password"
				data-testid="cp-new"
				bind:value={$form.newPassword}
				aria-invalid={$errors.newPassword ? 'true' : undefined}
				class="block h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
			/>
			{#if $errors.newPassword && $errors.newPassword[0]}
				<p class="text-xs text-destructive" data-testid="cp-error-new">
					{tr($errors.newPassword[0], 'Password too short')}
				</p>
			{/if}
		</div>

		<div class="space-y-1.5">
			<label for="cp-confirm" class="text-sm font-medium text-foreground">
				{$_('user.security.confirmNewPassword', { default: 'Confirm new password' })}
			</label>
			<input
				id="cp-confirm"
				name="confirmPassword"
				type="password"
				autocomplete="new-password"
				data-testid="cp-confirm"
				bind:value={$form.confirmPassword}
				aria-invalid={$errors.confirmPassword ? 'true' : undefined}
				class="block h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
			/>
			{#if $errors.confirmPassword && $errors.confirmPassword[0]}
				<p class="text-xs text-destructive" data-testid="cp-error-confirm">
					{tr($errors.confirmPassword[0], 'Passwords do not match')}
				</p>
			{/if}
		</div>

		{#if formError}
			<p
				class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
				data-testid="cp-form-error"
			>
				{formError}
			</p>
		{/if}

		<div class="flex items-center justify-end gap-2 pt-1">
			<button
				type="submit"
				data-testid="cp-submit"
				disabled={$submitting}
				class="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
			>
				{$submitting
					? $_('user.security.changingPassword', { default: 'Changing…' })
					: $_('user.security.changePasswordButton', { default: 'Change password' })}
			</button>
		</div>
	</form>
</section>
