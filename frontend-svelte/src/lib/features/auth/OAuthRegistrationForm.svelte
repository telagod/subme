<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';

	interface Props {
		registrationEmail: string;
		invitationRequired: boolean;
		submitting: boolean;
		registrationError: string;
		onSubmit: (data: { password: string; invitationCode: string }) => void;
	}

	let {
		registrationEmail,
		invitationRequired,
		submitting,
		registrationError,
		onSubmit
	}: Props = $props();

	let password = $state('');
	let confirmPassword = $state('');
	let invitationCode = $state('');

	const canSubmit = $derived(
		registrationEmail.trim() !== '' &&
			password.length >= 6 &&
			password === confirmPassword &&
			(!invitationRequired || invitationCode.trim() !== '')
	);
</script>

<form
	class="space-y-4"
	data-testid="oauth-registration-form"
	onsubmit={(e) => {
		e.preventDefault();
		onSubmit({ password, invitationCode: invitationCode.trim() });
	}}
>
	<div class="space-y-1.5">
		<label for="oauth-registration-email" class="text-sm font-medium text-foreground">
			{$_('auth.emailLabel', { default: 'Email' })}
		</label>
		<Input
			id="oauth-registration-email"
			type="email"
			value={registrationEmail}
			readonly
			disabled
			data-testid="oauth-registration-email"
			class="bg-muted text-muted-foreground"
		/>
	</div>

	<div class="space-y-1.5">
		<label for="oauth-registration-password" class="text-sm font-medium text-foreground">
			{$_('auth.register.passwordLabel', { default: 'Password' })}
		</label>
		<Input
			id="oauth-registration-password"
			type="password"
			autocomplete="new-password"
			bind:value={password}
			disabled={submitting}
			data-testid="oauth-registration-password"
		/>
	</div>

	<div class="space-y-1.5">
		<label for="oauth-registration-confirm" class="text-sm font-medium text-foreground">
			{$_('auth.register.confirmPasswordLabel', { default: 'Confirm password' })}
		</label>
		<Input
			id="oauth-registration-confirm"
			type="password"
			autocomplete="new-password"
			bind:value={confirmPassword}
			disabled={submitting}
			data-testid="oauth-registration-confirm"
		/>
	</div>

	{#if invitationRequired}
		<div class="space-y-1.5">
			<label for="oauth-registration-invitation" class="text-sm font-medium text-foreground">
				{$_('auth.invitationCodeLabel', { default: 'Invitation code' })}
			</label>
			<Input
				id="oauth-registration-invitation"
				type="text"
				bind:value={invitationCode}
				disabled={submitting}
				data-testid="oauth-registration-invitation"
			/>
		</div>
	{/if}

	{#if registrationError}
		<Alert variant="destructive" class="px-3 py-2 text-xs" data-testid="oauth-registration-error">
			{registrationError}
		</Alert>
	{/if}

	<Button
		type="submit"
		disabled={submitting || !canSubmit}
		data-testid="oauth-registration-submit"
		class="w-full"
	>
		{submitting
			? $_('auth.callback.totpSubmitting', { default: 'Verifying...' })
			: $_('auth.emailCompletion.submit', { default: 'Complete sign-in' })}
	</Button>
</form>
