<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { ShieldCheck } from '@lucide/svelte';
	import Input from '$lib/ui/Input.svelte';

	interface Props {
		email: string;
		password: string;
		confirmPassword: string;
		onEmailChange: (v: string) => void;
		onPasswordChange: (v: string) => void;
		onConfirmChange: (v: string) => void;
	}

	let {
		email = $bindable(),
		password = $bindable(),
		confirmPassword = $bindable(),
		onEmailChange,
		onPasswordChange,
		onConfirmChange
	}: Props = $props();

	const passwordMismatch = $derived(
		confirmPassword !== '' && password !== confirmPassword
	);
	const labelClass = 'mb-1.5 block text-sm font-medium text-foreground';
</script>

<div class="space-y-6" data-testid="setup-step-admin">
	<div class="text-center">
		<ShieldCheck class="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
		<h2 class="text-xl font-semibold tracking-normal text-foreground">
			{$_('setup.admin.title', { default: 'Admin Account' })}
		</h2>
		<p class="mt-1 text-sm text-muted-foreground">
			{$_('setup.admin.description', { default: 'Create your administrator account' })}
		</p>
	</div>
	<div>
		<label class={labelClass} for="setup-admin-email">{$_('setup.admin.email', { default: 'Email' })}</label>
		<Input id="setup-admin-email" data-testid="setup-admin-email" type="email" bind:value={email} />
	</div>
	<div>
		<label class={labelClass} for="setup-admin-password">{$_('setup.admin.password', { default: 'Password' })}</label>
		<Input id="setup-admin-password" data-testid="setup-admin-password" type="password" bind:value={password} />
	</div>
	<div>
		<label class={labelClass} for="setup-admin-confirm">{$_('setup.admin.confirmPassword', { default: 'Confirm Password' })}</label>
		<Input id="setup-admin-confirm" data-testid="setup-admin-confirm" type="password" bind:value={confirmPassword} />
		{#if passwordMismatch}
			<p class="mt-1 text-sm text-destructive" data-testid="setup-password-mismatch">
				{$_('setup.admin.passwordMismatch', { default: 'Passwords do not match' })}
			</p>
		{/if}
	</div>
</div>
