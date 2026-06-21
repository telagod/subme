<script lang="ts">
	/**
	 * /auth/forgot · M7 静态找回密码页
	 *
	 * 设计：
	 *   - superforms SPA + zod (forgotPasswordSchema)。仅 email + 可选 turnstileToken。
	 *   - 成功后切到 "Check your email" 面板（不回显 token，与 Vue tree 一致）。
	 *   - 失败仍弹 toast + 表单红条。
	 */
	import { _ } from 'svelte-i18n';
	import { superForm, defaults } from 'sveltekit-superforms/client';
	import { zod4, zod4Client } from 'sveltekit-superforms/adapters';
	import AuthLayout from '$lib/features/auth/AuthLayout.svelte';
	import {
		forgotPasswordSchema,
		mapAuthError,
		type ForgotPasswordForm
	} from '$lib/features/auth/forms';
	import { authApi } from '$lib/api/auth';
	import { showError } from '$lib/stores/toast.svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';

	const initial = defaults<ForgotPasswordForm>(zod4(forgotPasswordSchema));

	const { form, errors, enhance, submitting } = superForm<ForgotPasswordForm>(initial, {
		SPA: true,
		validators: zod4Client(forgotPasswordSchema),
		resetForm: false,
		clearOnSubmit: 'errors-and-message',
		onUpdate: async ({ form: validated, cancel }) => {
			cancel();
			if (!validated.valid) return;

			try {
				await authApi.requestPasswordReset(
					validated.data.email,
					validated.data.turnstileToken || undefined
				);
				sentEmail = validated.data.email;
				success = true;
			} catch (err) {
				const key = mapAuthError(err, 'forgot');
				formError = $_(key, { default: 'Failed to send reset link.' });
				showError(formError);
			}
		}
	});

	let formError = $state<string>('');
	let success = $state(false);
	let sentEmail = $state<string>('');

	function tr(key: string | undefined, fallback: string): string {
		if (!key) return '';
		return $_(key, { default: fallback });
	}
</script>

<svelte:head>
	<title>{$_('auth.forgotPasswordTitle', { default: 'Reset password' })} · sub2api</title>
</svelte:head>

<AuthLayout
	title={$_('auth.forgotPasswordTitle', { default: 'Reset password' })}
	subtitle={$_('auth.forgotPasswordHint', {
		default: 'Enter your email and we will send you a reset link.'
	})}
>
	{#if success}
		<div class="space-y-3 text-center" data-testid="forgot-success">
			<div class="mx-auto h-8 w-8 rounded-full bg-emerald-500/15 text-emerald-600">
				<span class="block pt-1 text-base">✓</span>
			</div>
			<h2 class="text-base font-medium text-foreground">
				{$_('auth.resetEmailSent', { default: 'Check your email' })}
			</h2>
			<p class="text-xs text-muted-foreground">
				{$_('auth.resetEmailSentHint', {
					default:
						'If an account exists with this email, you will receive a password reset link shortly.'
				})}
			</p>
			{#if sentEmail}
				<p class="text-xs text-foreground/80" data-testid="forgot-sent-email">{sentEmail}</p>
			{/if}
		</div>
	{:else}
		<form method="POST" use:enhance class="space-y-4" data-testid="forgot-form">
			<div class="space-y-1.5">
				<label for="forgot-email" class="text-sm font-medium text-foreground">
					{$_('auth.emailLabel', { default: 'Email' })}
				</label>
				<Input
					id="forgot-email"
					name="email"
					type="email"
					autocomplete="email"
					placeholder={$_('auth.emailPlaceholder', { default: 'you@example.com' })}
					bind:value={$form.email}
					aria-invalid={$errors.email ? 'true' : undefined}
					data-testid="forgot-email"
				/>
				{#if $errors.email && $errors.email[0]}
					<p class="text-xs text-destructive" data-testid="error-email">
						{tr($errors.email[0], 'Email error')}
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
				data-testid="forgot-submit"
				class="w-full"
			>
				{$submitting
					? $_('auth.sendingResetLink', { default: 'Sending...' })
					: $_('auth.sendResetLink', { default: 'Send reset link' })}
			</Button>
		</form>
	{/if}

	{#snippet footer()}
		{$_('auth.rememberedPassword', { default: 'Remembered your password?' })}
		<a class="ml-1 text-foreground underline-offset-4 hover:underline" href="/auth/login">
			{$_('auth.backToLogin', { default: 'Back to sign in' })}
		</a>
	{/snippet}
</AuthLayout>
