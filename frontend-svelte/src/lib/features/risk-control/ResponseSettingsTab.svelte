<script lang="ts">
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';
	import type { ContentModerationConfig } from '$lib/api/admin/riskControl';

	type Props = {
		config: ContentModerationConfig;
	};

	let { config = $bindable() }: Props = $props();
</script>

<div class="space-y-5">
	<h3 class="text-sm font-semibold text-foreground">Response &amp; Enforcement</h3>
	<p class="text-xs text-muted-foreground">
		Configure how blocked requests are handled and when users are automatically banned.
	</p>

	<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
		<label class="space-y-1.5 text-sm">
			<span class="text-xs font-medium text-muted-foreground">Block HTTP status</span>
			<Input type="number" min={400} max={599} bind:value={config.block_status} />
			<span class="text-[11px] text-muted-foreground">HTTP status code returned to blocked requests (400-599)</span>
		</label>

		<label class="space-y-1.5 text-sm">
			<span class="text-xs font-medium text-muted-foreground">Block message</span>
			<Input bind:value={config.block_message} />
			<span class="text-[11px] text-muted-foreground">Error message returned to blocked users</span>
		</label>

		<label class="flex min-h-14 items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm">
			<Checkbox bind:checked={config.email_on_hit} />
			<span>
				<span class="block text-xs font-medium text-foreground">Email on hit</span>
				<span class="block text-[11px] text-muted-foreground">Send email notification when moderation triggers</span>
			</span>
		</label>

		<label class="flex min-h-14 items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm">
			<Checkbox bind:checked={config.auto_ban_enabled} />
			<span>
				<span class="block text-xs font-medium text-foreground">Auto-ban</span>
				<span class="block text-[11px] text-muted-foreground">Automatically disable users who exceed ban threshold</span>
			</span>
		</label>

		<label class="space-y-1.5 text-sm">
			<span class="text-xs font-medium text-muted-foreground">Ban threshold (violations)</span>
			<Input type="number" min={1} max={1000} bind:value={config.ban_threshold} />
			<span class="text-[11px] text-muted-foreground">Number of violations before auto-ban triggers</span>
		</label>

		<label class="space-y-1.5 text-sm">
			<span class="text-xs font-medium text-muted-foreground">Violation window (hours)</span>
			<Input type="number" min={1} max={8760} bind:value={config.violation_window_hours} />
			<span class="text-[11px] text-muted-foreground">Time window for counting violations (1-8760 hours)</span>
		</label>
	</div>
</div>
