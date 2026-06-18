<script lang="ts">
	/**
	 * /auth/register · M7 静态注册页
	 *
	 * 设计：
	 *   - superforms SPA 模式 + zod (registerSchema)：email + password + confirmPassword + agreement
	 *     + turnstile + 自动捕获 affiliate code。
	 *   - 提交流程：
	 *       1. superValidate 通过 → POST /api/v1/auth/register
	 *       2. 后端返回 access_token + user → auth store setSession → goto /dashboard
	 *       3. 后端返回 verify_required=true → goto /auth/verify-email-sent?email=<email>
	 *       4. 其他错误 → mapAuthError → showError + 表单红色错误条
	 *   - Layout 复用 AuthLayout（与 LoginView 视觉一致）。
	 *   - OAuth provider row 暂留 placeholder（publicSettings 拉通在 M7+）。
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { _ } from 'svelte-i18n';
	import { superForm, defaults } from 'sveltekit-superforms/client';
	import { zod4, zod4Client } from 'sveltekit-superforms/adapters';
	import AuthLayout from '$lib/features/auth/AuthLayout.svelte';
	import {
		registerSchema,
		captureAffiliateFromUrl,
		readStoredAffiliateCode,
		clearStoredAffiliateCode,
		mapAuthError,
		type RegisterForm
	} from '$lib/features/auth/forms';
	import { authApi } from '$lib/api/auth';
	import { auth } from '$lib/stores/auth.svelte';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';

	// ── 表单初值 ───────────────────────────────────────────────
	const initial = defaults<RegisterForm>(zod4(registerSchema));

	const { form, errors, enhance, submitting } = superForm<RegisterForm>(initial, {
		SPA: true,
		validators: zod4Client(registerSchema),
		resetForm: false,
		clearOnSubmit: 'errors-and-message',
		onUpdate: async ({ form: validated, cancel }) => {
			cancel();
			if (!validated.valid) return;

			try {
				const resp = await authApi.register({
					email: validated.data.email,
					password: validated.data.password,
					aff_code: validated.data.affCode || undefined,
					turnstile_token: validated.data.turnstileToken || undefined,
					agreement_consent: validated.data.agreementConsent || undefined
				});

				// 分支 A：后端立即返回 token（无邮件验证）。
				if (resp && typeof resp === 'object' && 'access_token' in resp && resp.access_token) {
					auth.setSession(resp.access_token as string, (resp.user ?? { id: 0, email: validated.data.email }));
					clearStoredAffiliateCode();
					showSuccess($_('auth.accountCreatedSuccess', { default: 'Account created!', values: { siteName: 'sub2api' } }));
					await goto('/dashboard', { replaceState: true });
					return;
				}

				// 分支 B：需要邮件验证 —— 转去“已发送”页。
				clearStoredAffiliateCode();
				const email = encodeURIComponent(validated.data.email);
				await goto(`/auth/verify-email-sent?email=${email}`, { replaceState: true });
			} catch (err) {
				const key = mapAuthError(err, 'register');
				formError = $_(key, { default: 'Registration failed' });
				showError(formError);
			}
		}
	});

	let formError = $state<string>('');
	let showPassword = $state(false);
	let showConfirmPassword = $state(false);

	// ── onMount：抓 ?aff= 写 sessionStorage + 回填表单 ────────────────
	onMount(() => {
		const aff = captureAffiliateFromUrl(page.url) || readStoredAffiliateCode();
		if (aff) {
			$form.affCode = aff;
		}
	});

	function tr(key: string | undefined, fallback: string): string {
		if (!key) return '';
		return $_(key, { default: fallback });
	}
</script>

<svelte:head>
	<title>{$_('auth.register.title', { default: 'Create account' })} · sub2api</title>
</svelte:head>

<AuthLayout
	title={$_('auth.register.title', { default: 'Create account' })}
	subtitle={$_('auth.register.subtitle', { default: 'Get started with sub2api in seconds.' })}
>
	<form method="POST" use:enhance class="space-y-4" data-testid="register-form">
		<!-- email -->
		<div class="space-y-1.5">
			<label for="reg-email" class="text-sm font-medium text-foreground">
				{$_('auth.register.emailLabel', { default: 'Email' })}
			</label>
			<input
				id="reg-email"
				name="email"
				type="email"
				autocomplete="email"
				placeholder={$_('auth.register.emailPlaceholder', { default: 'you@example.com' })}
				bind:value={$form.email}
				aria-invalid={$errors.email ? 'true' : undefined}
				data-testid="register-email"
				class="block h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
			/>
			{#if $errors.email && $errors.email[0]}
				<p class="text-xs text-destructive" data-testid="error-email">
					{tr($errors.email[0], 'Email error')}
				</p>
			{/if}
		</div>

		<!-- password -->
		<div class="space-y-1.5">
			<label for="reg-password" class="text-sm font-medium text-foreground">
				{$_('auth.register.passwordLabel', { default: 'Password' })}
			</label>
			<div class="relative">
				<input
					id="reg-password"
					name="password"
					type={showPassword ? 'text' : 'password'}
					autocomplete="new-password"
					placeholder={$_('auth.register.passwordPlaceholder', { default: 'At least 8 characters' })}
					bind:value={$form.password}
					aria-invalid={$errors.password ? 'true' : undefined}
					data-testid="register-password"
					class="block h-10 w-full rounded-md border border-input bg-background px-3 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
				/>
				<button
					type="button"
					tabindex="-1"
					onclick={() => (showPassword = !showPassword)}
					data-testid="toggle-password"
					class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
				>
					{showPassword ? $_('auth.register.hide', { default: 'Hide' }) : $_('auth.register.show', { default: 'Show' })}
				</button>
			</div>
			{#if $errors.password && $errors.password[0]}
				<p class="text-xs text-destructive" data-testid="error-password">
					{tr($errors.password[0], 'Password error')}
				</p>
			{:else}
				<p class="text-[11px] text-muted-foreground">
					{$_('auth.register.passwordHint', { default: 'At least 8 chars, mix letters and numbers.' })}
				</p>
			{/if}
		</div>

		<!-- confirm password -->
		<div class="space-y-1.5">
			<label for="reg-confirm" class="text-sm font-medium text-foreground">
				{$_('auth.register.confirmPasswordLabel', { default: 'Confirm password' })}
			</label>
			<div class="relative">
				<input
					id="reg-confirm"
					name="confirmPassword"
					type={showConfirmPassword ? 'text' : 'password'}
					autocomplete="new-password"
					placeholder={$_('auth.register.confirmPasswordPlaceholder', { default: 'Repeat the password' })}
					bind:value={$form.confirmPassword}
					aria-invalid={$errors.confirmPassword ? 'true' : undefined}
					data-testid="register-confirm"
					class="block h-10 w-full rounded-md border border-input bg-background px-3 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
				/>
				<button
					type="button"
					tabindex="-1"
					onclick={() => (showConfirmPassword = !showConfirmPassword)}
					class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
				>
					{showConfirmPassword ? $_('auth.register.hide', { default: 'Hide' }) : $_('auth.register.show', { default: 'Show' })}
				</button>
			</div>
			{#if $errors.confirmPassword && $errors.confirmPassword[0]}
				<p class="text-xs text-destructive" data-testid="error-confirm">
					{tr($errors.confirmPassword[0], 'Confirm error')}
				</p>
			{/if}
		</div>

		<!-- agreement -->
		<label class="flex items-start gap-2 text-xs text-muted-foreground">
			<input
				type="checkbox"
				name="agreementConsent"
				bind:checked={$form.agreementConsent}
				data-testid="register-agreement"
				class="mt-0.5 h-3.5 w-3.5 rounded border-input"
			/>
			<span>
				{$_('auth.register.agreementPrefix', { default: 'I agree to the' })}
				<a href="/terms" class="text-foreground underline-offset-4 hover:underline">
					{$_('auth.register.termsLink', { default: 'Terms' })}
				</a>
				{$_('auth.register.and', { default: 'and' })}
				<a href="/privacy" class="text-foreground underline-offset-4 hover:underline">
					{$_('auth.register.privacyLink', { default: 'Privacy Policy' })}
				</a>.
			</span>
		</label>

		<!-- affiliate code (hidden, surface-only debug) -->
		<input type="hidden" name="affCode" bind:value={$form.affCode} data-testid="register-aff" />

		<!-- 表单级错误 -->
		{#if formError}
			<p class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive" data-testid="error-form">
				{formError}
			</p>
		{/if}

		<button
			type="submit"
			disabled={$submitting}
			data-testid="register-submit"
			class="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
		>
			{$submitting
				? $_('auth.register.submitting', { default: 'Creating account...' })
				: $_('auth.register.submit', { default: 'Create account' })}
		</button>

		<!-- OAuth row placeholder (publicSettings 拉通在 M7+) -->
		<div class="flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted-foreground" data-testid="register-oauth-row">
			<div class="h-px flex-1 bg-border"></div>
			<span>{$_('auth.oauthOrContinue', { default: 'or continue with others' })}</span>
			<div class="h-px flex-1 bg-border"></div>
		</div>
	</form>

	{#snippet footer()}
		{$_('auth.register.alreadyHaveAccount', { default: 'Already have an account?' })}
		<a class="ml-1 text-foreground underline-offset-4 hover:underline" href="/auth/login">
			{$_('auth.register.signInLink', { default: 'Sign in' })}
		</a>
	{/snippet}
</AuthLayout>
