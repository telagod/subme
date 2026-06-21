<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { Server, Loader2, CheckCircle2 } from '@lucide/svelte';
	import { setupApi } from '$lib/api/setup';
	import Button from '$lib/ui/Button.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';

	interface Props {
		formData: { host: string; port: number; password: string; db: number; enable_tls: boolean };
		redisConnected: boolean;
		onConnected: (connected: boolean) => void;
		onError: (msg: string) => void;
	}

	let { formData = $bindable(), redisConnected = $bindable(), onConnected, onError }: Props = $props();

	let testingRedis = $state(false);
	const labelClass = 'mb-1.5 block text-sm font-medium text-foreground';

	async function testRedisConnection(): Promise<void> {
		testingRedis = true;
		onError('');
		redisConnected = false;
		try {
			await setupApi.testRedis(formData);
			redisConnected = true;
			onConnected(true);
		} catch (err) {
			onError((err as Error)?.message || 'Connection failed');
		} finally {
			testingRedis = false;
		}
	}
</script>

<div class="space-y-6" data-testid="setup-step-redis">
	<div class="text-center">
		<Server class="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
		<h2 class="text-xl font-semibold tracking-normal text-foreground">
			{$_('setup.redis.title', { default: 'Redis Configuration' })}
		</h2>
		<p class="mt-1 text-sm text-muted-foreground">
			{$_('setup.redis.description', { default: 'Connect to your Redis server' })}
		</p>
	</div>

	<div class="grid gap-4 sm:grid-cols-2">
		<div>
			<label class={labelClass} for="setup-redis-host">{$_('setup.redis.host', { default: 'Host' })}</label>
			<Input id="setup-redis-host" data-testid="setup-redis-host" bind:value={formData.host} />
		</div>
		<div>
			<label class={labelClass} for="setup-redis-port">{$_('setup.redis.port', { default: 'Port' })}</label>
			<Input id="setup-redis-port" type="number" bind:value={formData.port} />
		</div>
	</div>
	<div class="grid gap-4 sm:grid-cols-2">
		<div>
			<label class={labelClass} for="setup-redis-password">{$_('setup.redis.password', { default: 'Password (optional)' })}</label>
			<Input id="setup-redis-password" type="password" bind:value={formData.password} />
		</div>
		<div>
			<label class={labelClass} for="setup-redis-db">{$_('setup.redis.database', { default: 'Database' })}</label>
			<Input id="setup-redis-db" type="number" bind:value={formData.db} />
		</div>
	</div>
	<label class="flex items-center justify-between gap-4 rounded-md border border-border p-3">
		<span>
			<span class="block text-sm font-medium text-foreground">{$_('setup.redis.enableTls', { default: 'Enable TLS' })}</span>
			<span class="block text-xs text-muted-foreground">{$_('setup.redis.enableTlsHint', { default: 'Use TLS when connecting to Redis' })}</span>
		</span>
		<Checkbox bind:checked={formData.enable_tls} />
	</label>
	<Button variant="outline" class="w-full" data-testid="setup-test-redis" disabled={testingRedis} onclick={() => void testRedisConnection()}>
		{#if testingRedis}
			<Loader2 class="h-4 w-4 animate-spin" />
			{$_('setup.status.testing', { default: 'Testing...' })}
		{:else if redisConnected}
			<CheckCircle2 class="h-4 w-4 text-emerald-500" />
			{$_('setup.status.success', { default: 'Connection Successful' })}
		{:else}
			{$_('setup.status.testConnection', { default: 'Test Connection' })}
		{/if}
	</Button>
</div>
