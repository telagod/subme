<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { AlertOctagon } from '@lucide/svelte';
	import { auth } from '$lib/stores/auth.svelte';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import { deleteAccount } from '$lib/api/user/profile';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';

	interface Props {
		email: string;
	}

	let { email }: Props = $props();

	let confirmEmail = $state('');
	let deletePassword = $state('');
	let deletingAccount = $state(false);
	const canDelete = $derived(
		!!email && confirmEmail.trim().toLowerCase() === email.trim().toLowerCase() && deletePassword.length >= 1
	);

	async function handleDeleteAccount() {
		if (!canDelete || deletingAccount) return;
		deletingAccount = true;
		try {
			await deleteAccount({ email: confirmEmail.trim(), password: deletePassword });
			showSuccess(
				$_('user.danger.deleteSuccess', { default: 'Account deleted. Logging out…' })
			);
			await auth.logout();
		} catch (err) {
			const e = err as Error;
			showError(
				e?.message ?? $_('user.danger.deleteFailed', { default: 'Failed to delete account' })
			);
		} finally {
			deletingAccount = false;
		}
	}
</script>

<section
	class="rounded-lg border border-destructive/40 bg-card p-6 shadow-sm"
	data-testid="panel-danger"
	role="tabpanel"
>
	<header class="mb-5 flex items-start gap-3">
		<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
			<AlertOctagon class="h-5 w-5" />
		</div>
		<div class="space-y-1">
			<h2 class="text-base font-semibold text-destructive">
				{$_('user.danger.title', { default: 'Delete account' })}
			</h2>
			<p class="text-sm text-muted-foreground">
				{$_('user.danger.description', {
					default:
						'Permanently delete your account and all associated data. This action cannot be undone.'
				})}
			</p>
		</div>
	</header>

	<div class="space-y-4">
		<div class="space-y-1.5">
			<label for="dz-email" class="text-sm font-medium text-foreground">
				{$_('user.danger.confirmEmail', {
					default: 'Type your email to confirm ({email})',
					values: { email }
				})}
			</label>
			<Input
				id="dz-email"
				type="email"
				autocomplete="off"
				data-testid="dz-email"
				bind:value={confirmEmail}
				placeholder={email}
			/>
		</div>
		<div class="space-y-1.5">
			<label for="dz-password" class="text-sm font-medium text-foreground">
				{$_('user.danger.password', { default: 'Current password' })}
			</label>
			<Input
				id="dz-password"
				type="password"
				autocomplete="current-password"
				data-testid="dz-password"
				bind:value={deletePassword}
			/>
		</div>

		<div class="flex items-center justify-end pt-2">
			<Button
				type="button"
				variant="destructive"
				data-testid="dz-submit"
				disabled={!canDelete || deletingAccount}
				onclick={handleDeleteAccount}
			>
				{deletingAccount
					? $_('user.danger.deleting', { default: 'Deleting…' })
					: $_('user.danger.deleteButton', { default: 'Delete my account' })}
			</Button>
		</div>
	</div>
</section>
