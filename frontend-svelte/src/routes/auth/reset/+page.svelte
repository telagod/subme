<script lang="ts">
	/**
	 * /auth/reset · M7 静态重置密码页
	 *
	 * 设计：
	 *   - URL ?token=... 缺失 → 直接渲染 "invalid link" 卡片，引去 /auth/forgot。
	 *   - superforms SPA + zod (resetPasswordSchema)。仅新密码 + 确认密码。
	 *   - 成功 → goto /auth/login + toast；失败 INVALID_RESET_TOKEN → 切回 invalid 卡片。
	 *   - 无 captcha（Vue tree 同语义）。
	 */
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { _ } from 'svelte-i18n';
	import { superForm, defaults } from 'sveltekit-superforms/client';
	import { zod4, zod4Client } from 'sveltekit-superforms/adapters';
	import AuthLayout from '$lib/features/auth/AuthLayout.svelte';
	import {
		resetPasswordSchema,
		mapAuthError,
		type ResetPasswordForm
	} from '$lib/features/auth/forms';
	import { authApi } from '$lib/api/auth';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';

	// ── 从 query 读 token + email（email 可选，后端兼容） ──────────────
	const token = $derived(page.url.searchParams.get('token') ?? '');
	const email = $derived(page.url.searchParams.get('email') ?? '');
	const isInvalidLink = $derived(!token);

	const initial = defaults<ResetPasswordForm>(zod4(resetPasswordSchema));

	const { form, errors, enhance, submitting } = superForm<ResetPasswordForm>(initial, {
		SPA: true,
		validators: zod4Client(resetPasswordSchema),
		resetForm: false,
		clearOnSubmit: 'errors-and-message',
		onUpdate: async ({ form: validated, cancel }) => {
			cancel();
			if (!validated.valid) return;
			if (!token) {
				tokenInvalid = true;
				return;
			}

			try {
				await authApi.confirmPasswordReset(token, validated.data.newPassword, email || undefined);
				showSuccess($_('auth.passwordResetSuccess', { default: '密码重置成功' }));
				await goto('/auth/login', { replaceState: true });
			} catch (err) {
				const key = mapAuthError(err, 'reset');
				if (key === 'auth.invalidOrExpiredToken') {
					tokenInvalid = true;
					return;
				}
				formError = $_(key, { default: '重置密码失败。' });
				showError(formError);
			}
		}
	});

	let formError = $state<string>('');
	let tokenInvalid = $state(false);
	let showPassword = $state(false);

	function tr(key: string | undefined, fallback: string): string {
		if (!key) return '';
		return $_(key, { default: fallback });
	}
</script>

<svelte:head>
	<title>{$_('auth.resetPasswordTitle', { default: '设置新密码' })} · sub2api</title>
</svelte:head>

<AuthLayout
	title={$_('auth.resetPasswordTitle', { default: '设置新密码' })}
	subtitle={$_('auth.resetPasswordHint', { default: '请在下方输入新密码。' })}
>
	{#if isInvalidLink || tokenInvalid}
		<div class="space-y-3 text-center" data-testid="reset-invalid">
			<h2 class="text-base font-medium text-foreground">
				{$_('auth.invalidResetLink', { default: '重置链接无效' })}
			</h2>
			<p class="text-xs text-muted-foreground">
				{$_('auth.invalidResetLinkHint', {
					default: '此密码重置链接无效或已过期。'
				})}
			</p>
			<Button
				href="/auth/forgot"
				class="w-full"
			>
				{$_('auth.requestNewResetLink', { default: '请求新的重置链接' })}
			</Button>
		</div>
	{:else}
		<form method="POST" use:enhance class="space-y-4" data-testid="reset-form">
			{#if email}
				<div class="space-y-1.5">
					<label for="reset-email" class="text-sm font-medium text-foreground">
						{$_('auth.emailLabel', { default: '邮箱' })}
					</label>
					<Input
						id="reset-email"
						type="email"
						readonly
						disabled
						value={email}
						class="bg-muted/60 text-muted-foreground"
						data-testid="reset-email"
					/>
				</div>
			{/if}

			<!-- new password -->
			<div class="space-y-1.5">
				<label for="reset-newpassword" class="text-sm font-medium text-foreground">
					{$_('auth.newPassword', { default: '新密码' })}
				</label>
				<div class="relative">
					<Input
						id="reset-newpassword"
						name="newPassword"
						type={showPassword ? 'text' : 'password'}
						autocomplete="new-password"
						placeholder={$_('auth.newPasswordPlaceholder', { default: '输入新密码' })}
						bind:value={$form.newPassword}
						aria-invalid={$errors.newPassword ? 'true' : undefined}
						data-testid="reset-password"
						class="pr-12"
					/>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						tabindex={-1}
						onclick={() => (showPassword = !showPassword)}
						class="absolute right-1 top-1/2 h-8 -translate-y-1/2 px-2 text-xs text-muted-foreground hover:text-foreground"
					>
						{showPassword ? $_('auth.register.hide', { default: 'Hide' }) : $_('auth.register.show', { default: '显示' })}
					</Button>
				</div>
				{#if $errors.newPassword && $errors.newPassword[0]}
					<p class="text-xs text-destructive" data-testid="error-password">
						{tr($errors.newPassword[0], 'Password error')}
					</p>
				{/if}
			</div>

			<!-- confirm password -->
			<div class="space-y-1.5">
				<label for="reset-confirm" class="text-sm font-medium text-foreground">
					{$_('auth.confirmPassword', { default: '确认密码' })}
				</label>
				<Input
					id="reset-confirm"
					name="confirmPassword"
					type={showPassword ? 'text' : 'password'}
					autocomplete="new-password"
					placeholder={$_('auth.confirmPasswordPlaceholder', { default: '再次输入新密码' })}
					bind:value={$form.confirmPassword}
					aria-invalid={$errors.confirmPassword ? 'true' : undefined}
					data-testid="reset-confirm"
				/>
				{#if $errors.confirmPassword && $errors.confirmPassword[0]}
					<p class="text-xs text-destructive" data-testid="error-confirm">
						{tr($errors.confirmPassword[0], 'Confirm error')}
					</p>
				{/if}
			</div>

			{#if formError}
				<Alert variant="destructive" class="px-3 py-2 text-xs" data-testid="error-form">
					{formError}
				</Alert>
			{/if}

			<Button
				type="submit"
				disabled={$submitting}
				data-testid="reset-submit"
				class="w-full"
			>
				{$submitting
					? $_('auth.resettingPassword', { default: '重置中...' })
					: $_('auth.resetPassword', { default: '重置密码' })}
			</Button>
		</form>
	{/if}

	{#snippet footer()}
		<a class="text-foreground underline-offset-4 hover:underline" href="/auth/login">
			{$_('auth.backToLogin', { default: '返回登录' })}
		</a>
	{/snippet}
</AuthLayout>
