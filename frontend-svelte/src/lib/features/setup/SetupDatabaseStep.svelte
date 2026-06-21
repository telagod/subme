<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { Database, Loader2, CheckCircle2 } from '@lucide/svelte';
	import { setupApi } from '$lib/api/setup';
	import Button from '$lib/ui/Button.svelte';
	import Input from '$lib/ui/Input.svelte';
	import NativeSelect from '$lib/ui/NativeSelect.svelte';

	interface Props {
		formData: { host: string; port: number; user: string; password: string; dbname: string; sslmode: string };
		dbConnected: boolean;
		onConnected: (connected: boolean) => void;
		onError: (msg: string) => void;
	}

	let { formData = $bindable(), dbConnected = $bindable(), onConnected, onError }: Props = $props();

	let testingDb = $state(false);
	const labelClass = 'mb-1.5 block text-sm font-medium text-foreground';

	async function testDatabaseConnection(): Promise<void> {
		testingDb = true;
		onError('');
		dbConnected = false;
		try {
			await setupApi.testDatabase(formData);
			dbConnected = true;
			onConnected(true);
		} catch (err) {
			onError((err as Error)?.message || 'Connection failed');
		} finally {
			testingDb = false;
		}
	}
</script>

<div class="space-y-6" data-testid="setup-step-database">
	<div class="text-center">
		<Database class="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
		<h2 class="text-xl font-semibold tracking-normal text-foreground">
			{$_('setup.database.title', { default: 'Database Configuration' })}
		</h2>
		<p class="mt-1 text-sm text-muted-foreground">
			{$_('setup.database.description', { default: 'Connect to your PostgreSQL database' })}
		</p>
	</div>

	<div class="grid gap-4 sm:grid-cols-2">
		<div>
			<label class={labelClass} for="setup-db-host">{$_('setup.database.host', { default: 'Host' })}</label>
			<Input id="setup-db-host" data-testid="setup-db-host" bind:value={formData.host} />
		</div>
		<div>
			<label class={labelClass} for="setup-db-port">{$_('setup.database.port', { default: 'Port' })}</label>
			<Input id="setup-db-port" data-testid="setup-db-port" type="number" bind:value={formData.port} />
		</div>
	</div>

	<div class="grid gap-4 sm:grid-cols-2">
		<div>
			<label class={labelClass} for="setup-db-user">{$_('setup.database.username', { default: 'Username' })}</label>
			<Input id="setup-db-user" data-testid="setup-db-user" bind:value={formData.user} />
		</div>
		<div>
			<label class={labelClass} for="setup-db-password">{$_('setup.database.password', { default: 'Password' })}</label>
			<Input id="setup-db-password" type="password" bind:value={formData.password} />
		</div>
	</div>

	<div class="grid gap-4 sm:grid-cols-2">
		<div>
			<label class={labelClass} for="setup-db-name">{$_('setup.database.databaseName', { default: 'Database Name' })}</label>
			<Input id="setup-db-name" data-testid="setup-db-name" bind:value={formData.dbname} />
		</div>
		<div>
			<label class={labelClass} for="setup-db-ssl">{$_('setup.database.sslMode', { default: 'SSL Mode' })}</label>
			<NativeSelect id="setup-db-ssl" class="w-full" bind:value={formData.sslmode}>
				<option value="disable">{$_('setup.database.ssl.disable', { default: 'Disable' })}</option>
				<option value="require">{$_('setup.database.ssl.require', { default: 'Require' })}</option>
				<option value="verify-ca">{$_('setup.database.ssl.verifyCa', { default: 'Verify CA' })}</option>
				<option value="verify-full">{$_('setup.database.ssl.verifyFull', { default: 'Verify Full' })}</option>
			</NativeSelect>
		</div>
	</div>

	<Button variant="outline" class="w-full" data-testid="setup-test-db" disabled={testingDb} onclick={() => void testDatabaseConnection()}>
		{#if testingDb}
			<Loader2 class="h-4 w-4 animate-spin" />
			{$_('setup.status.testing', { default: 'Testing...' })}
		{:else if dbConnected}
			<CheckCircle2 class="h-4 w-4 text-emerald-500" />
			{$_('setup.status.success', { default: 'Connection Successful' })}
		{:else}
			{$_('setup.status.testConnection', { default: 'Test Connection' })}
		{/if}
	</Button>
</div>
