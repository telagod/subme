<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { RefreshCw } from '@lucide/svelte';

	interface Props {
		database: { user: string; host: string; port: number; dbname: string };
		redis: { host: string; port: number };
		adminEmail: string;
	}

	let { database, redis, adminEmail }: Props = $props();
</script>

<div class="space-y-6" data-testid="setup-step-ready">
	<div class="text-center">
		<RefreshCw class="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
		<h2 class="text-xl font-semibold tracking-normal text-foreground">
			{$_('setup.ready.title', { default: 'Ready to Install' })}
		</h2>
		<p class="mt-1 text-sm text-muted-foreground">
			{$_('setup.ready.description', { default: 'Review your configuration and complete setup' })}
		</p>
	</div>
	<div class="space-y-4">
		<div class="rounded-md border border-border bg-muted p-4">
			<h3 class="mb-2 text-sm font-medium text-muted-foreground">{$_('setup.ready.database', { default: 'Database' })}</h3>
			<p class="break-words text-sm text-foreground">{database.user}@{database.host}:{database.port}/{database.dbname}</p>
		</div>
		<div class="rounded-md border border-border bg-muted p-4">
			<h3 class="mb-2 text-sm font-medium text-muted-foreground">{$_('setup.ready.redis', { default: 'Redis' })}</h3>
			<p class="break-words text-sm text-foreground">{redis.host}:{redis.port}</p>
		</div>
		<div class="rounded-md border border-border bg-muted p-4">
			<h3 class="mb-2 text-sm font-medium text-muted-foreground">{$_('setup.ready.adminEmail', { default: 'Admin Email' })}</h3>
			<p class="break-words text-sm text-foreground">{adminEmail}</p>
		</div>
	</div>
</div>
