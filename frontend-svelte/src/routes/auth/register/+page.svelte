<script lang="ts">
	/**
	 * /auth/register · M7 register page + Turnstile CAPTCHA
	 *
	 * Features:
	 *   - superforms SPA + zod (registerSchema)
	 *   - Turnstile CAPTCHA widget (conditional on backend setting)
	 *   - Agreement consent checkbox (static)
	 *   - Affiliate code capture
	 *   - OAuth providers (GitHub/Google email + full providers)
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { _ } from 'svelte-i18n';
	import { superForm, defaults } from 'sveltekit-superforms/client';
	import { zod4, zod4Client } from 'sveltekit-superforms/adapters';
	import AuthLayout from '$lib/features/auth/AuthLayout.svelte';
	import EmailOAuthButtons from '$lib/features/auth/EmailOAuthButtons.svelte';
	import OAuthProvidersSection from '$lib/features/auth/OAuthProvidersSection.svelte';
	import TurnstileWidget from '$lib/features/auth/TurnstileWidget.svelte';
	import {
		registerSchema,
		captureAffiliateFromUrl,
		readStoredAffiliateCode,
		clearStoredAffiliateCode,
		mapAuthError,
		type RegisterForm
	} from '$lib/features/auth/forms';
	import { authApi, type PublicSettings } from '$lib/api/auth';
	import { auth } from '$lib/stores/auth.svelte';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';

	// ── Form ──────────────────────────────────────────────────────────
	const initial = defaults<RegisterForm>(zod4(registerSchema));

	const { form, errors, enhance, submitting } = superForm<RegisterForm>(initial, {
		SPA: true,
		validators: zod4Client(registerSchema),
		resetForm: false,
		clearOnSubmit: 'errors-and-message',
		onUpdate: async ({ form: validated, cancel }) => {
			cancel();
			if (!validated.valid) return;

			// Turnstile gate check.
			if (turnstileEnabled && turnstileSiteKey && !turnstileToken) {
				showError($_('auth.turnstile.required', { default: 'Please complete the verification.' }));
				return;
			}

			try {
				const resp = await authApi.register({
					email: validated.data.email,
					password: validated.data.password,
					aff_code: validated.data.affCode || undefined,
					turnstile_token: turnstileEnabled ? turnstileToken || undefined : validated.data.turnstileToken || undefined,
					agreement_consent: validated.data.agreementConsent || undefined
				});

				// Branch A: immediate token (no email verification).
				if (resp && typeof resp === 'object' && 'access_token' in resp && resp.access_token) {
					auth.setSession(resp.access_token as string, (resp.user ?? { id: 0, email: validated.data.email }));
					clearStoredAffiliateCode();
					showSuccess($_('auth.accountCreatedSuccess', { default: 'Account created!', values: { siteName: 'sub2api' } }));
					await goto('/dashboard', { replaceState: true });
					return;
				}

				// Branch B: email verification required.
				clearStoredAffiliateCode();
				const email = encodeURIComponent(validated.data.email);
				await goto(`/auth/verify-email-sent?email=${email}`, { replaceState: true });
			} catch (err) {
				const msg = ((err as Error)?.message ?? '').toLowerCase();
				if (msg.includes('turnstile')) {
					formError = $_('auth.turnstile.failed', { default: 'CAPTCHA verification failed. Please try again.' });
					turnstileToken = '';
				} else {
					const key = mapAuthError(err, 'register');
					formError = $_(key, { default: 'Registration failed' });
				}
				showError(formError);
			}
		}
	});

	// ── State ──────────────────────────────────────────────────────────
	let formError = $state<string>('');
	let showPassword = $state(false);
	let showConfirmPassword = $state(false);
	let settingsLoaded = $state(false);

	// Turnstile state.
	let turnstileEnabled = $state(false);
	let turnstileSiteKey = $state('');
	let turnstileToken = $state('');

	// ── Derived ───────────────────────────────────────────────────────
	const submitDisabled = $derived(
		$submitting || (turnstileEnabled && !!turnstileSiteKey && !turnstileToken)
	);

	// ── Lifecycle ─────────────────────────────────────────────────────
	onMount(async () => {
		// Capture affiliate code from URL.
		const aff = captureAffiliateFromUrl(page.url) || readStoredAffiliateCode();
		if (aff) {
			$form.affCode = aff;
		}

		// Fetch public settings for Turnstile.
		try {
			const s = await authApi.getPublicSettings();
			turnstileEnabled = s.turnstile_enabled === true;
			turnstileSiteKey = s.turnstile_site_key || '';
		} catch {
			// Settings fetch failed — allow registration without Turnstile.
		} finally {
			settingsLoaded = true;
		}
	});

	// ── Turnstile handlers ────────────────────────────────────────────
	function onTurnstileVerify(token: string) {
		turnstileToken = token;
	}

	function onTurnstileExpire() {
		turnstileToken = '';
	}

	function onTurnstileError() {
		turnstileToken = '';
	}

	// ── Helpers ────────────────────────────────────────────────────────
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
			<Input
				id="reg-email"
				name="email"
				type="email"
				autocomplete="email"
				placeholder={$_('auth.register.emailPlaceholder', { default: 'you@example.com' })}
				bind:value={$form.email}
				aria-invalid={$errors.email ? 'true' : undefined}
				data-testid="register-email"
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
				<Input
					id="reg-password"
					name="password"
					type={showPassword ? 'text' : 'password'}
					autocomplete="new-password"
					placeholder={$_('auth.register.passwordPlaceholder', { default: 'At least 8 characters' })}
					bind:value={$form.password}
					aria-invalid={$errors.password ? 'true' : undefined}
					data-testid="register-password"
					class="pr-12"
				/>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					tabindex={-1}
					onclick={() => (showPassword = !showPassword)}
					data-testid="toggle-password"
					class="absolute right-1 top-1/2 h-8 -translate-y-1/2 px-2 text-xs text-muted-foreground hover:text-foreground"
				>
					{showPassword ? $_('auth.register.hide', { default: 'Hide' }) : $_('auth.register.show', { default: 'Show' })}
				</Button>
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
				<Input
					id="reg-confirm"
					name="confirmPassword"
					type={showConfirmPassword ? 'text' : 'password'}
					autocomplete="new-password"
					placeholder={$_('auth.register.confirmPasswordPlaceholder', { default: 'Repeat the password' })}
					bind:value={$form.confirmPassword}
					aria-invalid={$errors.confirmPassword ? 'true' : undefined}
					data-testid="register-confirm"
					class="pr-12"
				/>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					tabindex={-1}
					onclick={() => (showConfirmPassword = !showConfirmPassword)}
					class="absolute right-1 top-1/2 h-8 -translate-y-1/2 px-2 text-xs text-muted-foreground hover:text-foreground"
				>
					{showConfirmPassword ? $_('auth.register.hide', { default: 'Hide' }) : $_('auth.register.show', { default: 'Show' })}
				</Button>
			</div>
			{#if $errors.confirmPassword && $errors.confirmPassword[0]}
				<p class="text-xs text-destructive" data-testid="error-confirm">
					{tr($errors.confirmPassword[0], 'Confirm error')}
				</p>
			{/if}
		</div>

		<!-- Turnstile CAPTCHA -->
		{#if turnstileEnabled && turnstileSiteKey}
			<TurnstileWidget
				siteKey={turnstileSiteKey}
				onVerify={onTurnstileVerify}
				onExpire={onTurnstileExpire}
				onError={onTurnstileError}
			/>
		{/if}

		<!-- agreement -->
		<label class="flex items-start gap-2 text-xs text-muted-foreground">
			<Checkbox
				name="agreementConsent"
				bind:checked={$form.agreementConsent}
				data-testid="register-agreement"
				class="mt-0.5 h-3.5 w-3.5 rounded border-input"
			/>
			<span>
				{$_('auth.register.agreementPrefix', { default: 'I agree to the' })}
				<a href="/legal/terms" class="text-foreground underline-offset-4 hover:underline">
					{$_('auth.register.termsLink', { default: 'Terms' })}
				</a>
				{$_('auth.register.and', { default: 'and' })}
				<a href="/legal/privacy" class="text-foreground underline-offset-4 hover:underline">
					{$_('auth.register.privacyLink', { default: 'Privacy Policy' })}
				</a>.
			</span>
		</label>

		<!-- affiliate code (hidden) -->
		<Input type="hidden" name="affCode" bind:value={$form.affCode} data-testid="register-aff" />

		<!-- form error -->
		{#if formError}
			<Alert variant="destructive" class="px-3 py-2 text-xs" data-testid="error-form">
				{formError}
			</Alert>
		{/if}

		<Button
			type="submit"
			disabled={submitDisabled}
			data-testid="register-submit"
			class="w-full"
		>
			{$submitting
				? $_('auth.register.submitting', { default: 'Creating account...' })
				: $_('auth.register.submit', { default: 'Create account' })}
		</Button>

		<EmailOAuthButtons
			affCode={$form.affCode}
			disabled={$submitting}
			redirect="/dashboard"
		/>

		<OAuthProvidersSection disabled={$submitting} affCode={$form.affCode} />
	</form>

	{#snippet footer()}
		{$_('auth.register.alreadyHaveAccount', { default: 'Already have an account?' })}
		<a class="ml-1 text-foreground underline-offset-4 hover:underline" href="/auth/login">
			{$_('auth.register.signInLink', { default: 'Sign in' })}
		</a>
	{/snippet}
</AuthLayout>
