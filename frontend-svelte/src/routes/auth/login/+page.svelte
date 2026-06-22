<script lang="ts">
	/**
	 * /auth/login · M6 login form + Turnstile CAPTCHA + Login Agreement
	 *
	 * Features:
	 *   - superforms SPA + zod schema for client validation
	 *   - Turnstile CAPTCHA widget (conditional on backend setting)
	 *   - Login agreement consent gate (modal or checkbox mode)
	 *   - TOTP 2FA challenge support
	 *   - OAuth providers section
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { z } from 'zod';
	import { superForm, defaults } from 'sveltekit-superforms/client';
	import { zod4, zod4Client } from 'sveltekit-superforms/adapters';
	import { _ } from 'svelte-i18n';
	import { auth } from '$lib/stores/auth.svelte';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import { authApi, type PublicSettings, type LoginAgreementDocument } from '$lib/api/auth';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import OAuthProvidersSection from '$lib/features/auth/OAuthProvidersSection.svelte';
	import TurnstileWidget from '$lib/features/auth/TurnstileWidget.svelte';
	import LoginAgreementPrompt from '$lib/features/auth/LoginAgreementPrompt.svelte';

	// ── Constants ──────────────────────────────────────────────────────
	const LOGIN_AGREEMENT_STORAGE_KEY = 'sub2api_login_agreement_consent';

	// ── schema ─────────────────────────────────────────────────────────
	const schema = z.object({
		email: z.string().min(1, 'auth.errors.EMAIL_REQUIRED').email('auth.errors.EMAIL_INVALID'),
		password: z.string().min(6, 'auth.errors.PASSWORD_TOO_SHORT'),
		totp: z.string().optional()
	});

	type LoginForm = z.infer<typeof schema>;

	const initial = defaults<LoginForm>(zod4(schema));

	const { form, errors, enhance, submitting } = superForm<LoginForm>(initial, {
		SPA: true,
		validators: zod4Client(schema),
		resetForm: false,
		clearOnSubmit: 'errors-and-message',
		onUpdate: async ({ form: validated, cancel }) => {
			cancel();
			if (!validated.valid) return;

			// Agreement gate check.
			if (agreementGateActive) {
				showError($_('auth.agreement.mustAccept', { default: '请先同意条款再登录。' }));
				if (loginAgreementMode !== 'checkbox') {
					showAgreementModal = true;
				}
				return;
			}

			// Turnstile gate check.
			if (turnstileEnabled && turnstileSiteKey && !turnstileToken) {
				showError($_('auth.turnstile.required', { default: '请完成验证。' }));
				return;
			}

			try {
				await auth.login({
					email: validated.data.email,
					password: validated.data.password,
					totp: validated.data.totp || undefined,
					turnstile_token: turnstileEnabled ? turnstileToken || undefined : undefined
				});
				const next = page.url.searchParams.get('next') || '/dashboard';
				showSuccess($_('auth.login.success', { default: '登录成功。' }));
				await goto(next, { replaceState: true });
			} catch (err) {
				const e = err as Error & { code?: string };
				if (e.code === 'TOTP_REQUIRED') {
					needsTotp = true;
					showError($_('auth.errors.TOTP_REQUIRED', { default: '需要双因素验证' }));
					return;
				}
				const msg = (e?.message ?? '').toLowerCase();
				if (msg.includes('turnstile')) {
					formError = $_('auth.turnstile.failed', { default: '验证码校验失败，请重试。' });
					turnstileToken = '';
				} else if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('credentials')) {
					formError = $_('auth.errors.INVALID_CREDENTIALS', { default: '登录凭证无效' });
				} else if (msg.includes('network') || msg.includes('failed to fetch')) {
					formError = $_('auth.errors.NETWORK_ERROR', { default: '网络错误' });
				} else {
					formError = $_('auth.errors.UNKNOWN', { default: '未知错误' });
				}
				showError(formError);
			}
		}
	});

	// ── State ──────────────────────────────────────────────────────────
	let needsTotp = $state(false);
	let formError = $state<string>('');
	let settingsLoaded = $state(false);

	// Turnstile state.
	let turnstileEnabled = $state(false);
	let turnstileSiteKey = $state('');
	let turnstileToken = $state('');

	// Login agreement state.
	let loginAgreementEnabled = $state(false);
	let loginAgreementMode = $state<'modal' | 'checkbox' | string>('modal');
	let loginAgreementUpdatedAt = $state('');
	let loginAgreementRevision = $state('');
	let loginAgreementDocuments = $state<LoginAgreementDocument[]>([]);
	let agreementAccepted = $state(false);
	let showAgreementModal = $state(false);

	// ── Derived ───────────────────────────────────────────────────────
	const agreementGateActive = $derived(loginAgreementEnabled && !agreementAccepted);
	const authActionsDisabled = $derived(
		$submitting || !settingsLoaded || agreementGateActive
	);
	const submitDisabled = $derived(
		authActionsDisabled || (turnstileEnabled && !!turnstileSiteKey && !turnstileToken)
	);

	// ── Lifecycle ─────────────────────────────────────────────────────
	onMount(async () => {
		// Check for expired session flag.
		if (typeof window !== 'undefined') {
			try {
				const expired = window.sessionStorage.getItem('auth_expired');
				if (expired) {
					window.sessionStorage.removeItem('auth_expired');
					const msg = $_('auth.login.sessionExpired', { default: '会话已过期，请重新登录。' });
					formError = msg;
					showError(msg);
				}
			} catch { /* storage disabled */ }
		}

		try {
			const s = await authApi.getPublicSettings();
			applyTurnstileSettings(s);
			applyAgreementSettings(s);
		} catch {
			// Settings fetch failed — allow login without gates.
			loginAgreementEnabled = false;
			agreementAccepted = true;
		} finally {
			settingsLoaded = true;
		}
	});

	// ── Turnstile ─────────────────────────────────────────────────────
	function applyTurnstileSettings(s: PublicSettings) {
		turnstileEnabled = s.turnstile_enabled === true;
		turnstileSiteKey = s.turnstile_site_key || '';
	}

	function onTurnstileVerify(token: string) {
		turnstileToken = token;
	}

	function onTurnstileExpire() {
		turnstileToken = '';
	}

	function onTurnstileError() {
		turnstileToken = '';
	}

	// ── Login Agreement ───────────────────────────────────────────────
	function applyAgreementSettings(s: PublicSettings) {
		const docs = Array.isArray(s.login_agreement_documents)
			? s.login_agreement_documents.filter((d) => d.title?.trim())
			: [];
		loginAgreementDocuments = docs;
		loginAgreementEnabled = s.login_agreement_enabled === true && docs.length > 0;
		loginAgreementMode = s.login_agreement_mode === 'checkbox' ? 'checkbox' : 'modal';
		loginAgreementUpdatedAt = s.login_agreement_updated_at || '';
		loginAgreementRevision =
			s.login_agreement_revision ||
			`${loginAgreementUpdatedAt}:${docs.map((d) => `${d.id}:${d.title}`).join('|')}`;

		agreementAccepted = !loginAgreementEnabled || hasAcceptedAgreement(loginAgreementRevision);
		showAgreementModal =
			loginAgreementEnabled && !agreementAccepted && loginAgreementMode !== 'checkbox';
	}

	function hasAcceptedAgreement(revision: string): boolean {
		if (!revision || typeof window === 'undefined') return false;
		try {
			const raw = window.localStorage.getItem(LOGIN_AGREEMENT_STORAGE_KEY);
			if (!raw) return false;
			const parsed = JSON.parse(raw) as { revision?: string };
			return parsed.revision === revision;
		} catch {
			return false;
		}
	}

	function acceptAgreement() {
		if (loginAgreementRevision && typeof window !== 'undefined') {
			try {
				window.localStorage.setItem(
					LOGIN_AGREEMENT_STORAGE_KEY,
					JSON.stringify({ revision: loginAgreementRevision, accepted_at: new Date().toISOString() })
				);
			} catch {
				// Storage full — accept for current session anyway.
			}
		}
		agreementAccepted = true;
		showAgreementModal = false;
	}

	function rejectAgreement() {
		if (typeof window !== 'undefined') {
			try { window.localStorage.removeItem(LOGIN_AGREEMENT_STORAGE_KEY); } catch { /* */ }
		}
		agreementAccepted = false;
		showAgreementModal = false;
		showError($_('auth.agreement.rejectedWarning', { default: '登录前必须接受条款。' }));
	}

	// ── Helpers ────────────────────────────────────────────────────────
	function tr(key: string | undefined, fallback: string): string {
		if (!key) return '';
		return $_(key, { default: fallback });
	}
</script>

<svelte:head>
	<title>{$_('auth.login.title', { default: '登录' })} · sub2api</title>
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-background px-4 py-12">
	<div class="w-full max-w-[360px] space-y-6">
		<header class="space-y-2 text-center">
			<img src="/logo.svg" alt="Logo" class="mx-auto h-10 w-10 rounded-md" />
			<h1 class="text-2xl font-semibold tracking-tight text-foreground">
				{$_('auth.login.title', { default: '登录' })}
			</h1>
			<p class="text-sm text-muted-foreground">
				{$_('auth.login.subtitle', { default: '欢迎回来，登录以继续。' })}
			</p>
		</header>

		<form method="POST" use:enhance class="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
			<!-- email -->
			<div class="space-y-1.5">
				<label for="email" class="text-sm font-medium text-foreground">
					{$_('auth.login.emailLabel', { default: '邮箱' })}
				</label>
				<Input
					id="email"
					name="email"
					type="email"
					autocomplete="email"
					placeholder={$_('auth.login.emailPlaceholder', { default: 'you@example.com' })}
					bind:value={$form.email}
					aria-invalid={$errors.email ? 'true' : undefined}
					disabled={authActionsDisabled}
				/>
				{#if $errors.email && $errors.email[0]}
					<p class="text-xs text-destructive" data-testid="error-email">
						{tr($errors.email[0], 'Email error')}
					</p>
				{/if}
			</div>

			<!-- password -->
			<div class="space-y-1.5">
				<label for="password" class="text-sm font-medium text-foreground">
					{$_('auth.login.passwordLabel', { default: '密码' })}
				</label>
				<Input
					id="password"
					name="password"
					type="password"
					autocomplete="current-password"
					placeholder={$_('auth.login.passwordPlaceholder', { default: '您的密码' })}
					bind:value={$form.password}
					aria-invalid={$errors.password ? 'true' : undefined}
					disabled={authActionsDisabled}
				/>
				{#if $errors.password && $errors.password[0]}
					<p class="text-xs text-destructive" data-testid="error-password">
						{tr($errors.password[0], 'Password error')}
					</p>
				{/if}
			</div>

			<!-- TOTP (only after 2FA challenge) -->
			{#if needsTotp}
				<div class="space-y-1.5">
					<label for="totp" class="text-sm font-medium text-foreground">
						{$_('auth.login.totpLabel', { default: '双因素验证码' })}
					</label>
					<Input
						id="totp"
						name="totp"
						type="text"
						inputmode="numeric"
						maxlength={6}
						autocomplete="one-time-code"
						placeholder={$_('auth.login.totpPlaceholder', { default: '6-digit code' })}
						bind:value={$form.totp}
						class="tracking-widest"
					/>
				</div>
			{/if}

			<!-- Turnstile CAPTCHA -->
			{#if turnstileEnabled && turnstileSiteKey}
				<TurnstileWidget
					siteKey={turnstileSiteKey}
					onVerify={onTurnstileVerify}
					onExpire={onTurnstileExpire}
					onError={onTurnstileError}
				/>
			{/if}

			<!-- Login Agreement -->
			{#if loginAgreementEnabled}
				<LoginAgreementPrompt
					accepted={agreementAccepted}
					documents={loginAgreementDocuments}
					mode={loginAgreementMode}
					updatedAt={loginAgreementUpdatedAt}
					visible={showAgreementModal}
					onAccept={acceptAgreement}
					onReject={rejectAgreement}
					onOpen={() => (showAgreementModal = true)}
				/>
			{/if}

			<!-- form error -->
			{#if formError}
				<Alert variant="destructive" class="px-3 py-2 text-xs" data-testid="error-form">
					{formError}
				</Alert>
			{/if}

			<Button
				type="submit"
				disabled={submitDisabled}
				class="w-full"
			>
				{$submitting
					? $_('auth.login.submitting', { default: '登录中...' })
					: $_('auth.login.submit', { default: '登录' })}
			</Button>

			<OAuthProvidersSection disabled={authActionsDisabled} />

			<div class="flex items-center justify-between text-xs text-muted-foreground">
				<a class="hover:text-foreground hover:underline" href="/auth/forgot">
					{$_('auth.login.forgotPassword', { default: '忘记密码？' })}
				</a>
				<span>
					{$_('auth.login.noAccount', { default: "Don't have an account?" })}
					<a class="ml-1 text-foreground underline-offset-4 hover:underline" href="/auth/register">
						{$_('auth.login.registerLink', { default: '去注册' })}
					</a>
				</span>
			</div>
		</form>
	</div>
</main>
