<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { Save } from '@lucide/svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';
	import { getSchedule, updateSchedule, type BackupScheduleConfig } from '$lib/api/admin/backup';
	import { showError, showSuccess } from '$lib/stores/toast.svelte';
	import { normalizeRetainNumber } from '$lib/features/backup/backup';

	let scheduleForm = $state<BackupScheduleConfig>({
		enabled: false,
		cron_expr: '0 2 * * *',
		retain_days: 14,
		retain_count: 10
	});
	let savingSchedule = $state(false);

	export async function load() {
		try {
			const cfg = await getSchedule();
			scheduleForm = {
				enabled: Boolean(cfg.enabled),
				cron_expr: cfg.cron_expr || '0 2 * * *',
				retain_days: normalizeRetainNumber(cfg.retain_days, 14),
				retain_count: normalizeRetainNumber(cfg.retain_count, 10)
			};
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		}
	}

	async function saveSchedule() {
		savingSchedule = true;
		try {
			await updateSchedule({
				...scheduleForm,
				retain_days: normalizeRetainNumber(scheduleForm.retain_days, 14),
				retain_count: normalizeRetainNumber(scheduleForm.retain_count, 10)
			});
			showSuccess($_('admin.backup.schedule.saved'));
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			savingSchedule = false;
		}
	}
</script>

<Card class="p-4">
	<div class="mb-4">
		<h2 class="text-base font-semibold">{$_('admin.backup.schedule.title')}</h2>
		<p class="mt-1 text-sm text-muted-foreground">{$_('admin.backup.schedule.description')}</p>
	</div>
	<div class="grid gap-3 md:grid-cols-3">
		<label class="flex items-center gap-2 text-sm md:col-span-3">
			<Checkbox bind:checked={scheduleForm.enabled} data-testid="backup-schedule-enabled" />
			<span>{$_('admin.backup.schedule.enabled')}</span>
		</label>
		<label class="space-y-1 text-xs font-medium">
			<span>{$_('admin.backup.schedule.cronExpr')}</span>
			<Input bind:value={scheduleForm.cron_expr} placeholder="0 2 * * *" data-testid="backup-schedule-cron" />
			<span class="block text-muted-foreground">{$_('admin.backup.schedule.cronHint')}</span>
		</label>
		<label class="space-y-1 text-xs font-medium">
			<span>{$_('admin.backup.schedule.retainDays')}</span>
			<Input bind:value={scheduleForm.retain_days} type="number" min="0" data-testid="backup-schedule-retain-days" />
			<span class="block text-muted-foreground">{$_('admin.backup.schedule.retainDaysHint')}</span>
		</label>
		<label class="space-y-1 text-xs font-medium">
			<span>{$_('admin.backup.schedule.retainCount')}</span>
			<Input bind:value={scheduleForm.retain_count} type="number" min="0" data-testid="backup-schedule-retain-count" />
			<span class="block text-muted-foreground">{$_('admin.backup.schedule.retainCountHint')}</span>
		</label>
	</div>
	<div class="mt-4">
		<Button size="sm" onclick={saveSchedule} disabled={savingSchedule}>
			<Save size={14} />{savingSchedule ? $_('common.loading', { default: 'Loading' }) : $_('common.save', { default: 'Save' })}
		</Button>
	</div>
</Card>
