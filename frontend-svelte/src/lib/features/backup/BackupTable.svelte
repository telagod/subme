<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { Download, HardDrive, RotateCcw, Trash2 } from '@lucide/svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Input from '$lib/ui/Input.svelte';
	import type { BackupRecord } from '$lib/api/admin/backup';
	import {
		backupStatusLabel,
		backupStatusTone,
		backupTriggerLabel,
		formatBackupDate,
		formatBackupSize,
		normalizeRetainNumber
	} from '$lib/features/backup/backup';

	type Props = {
		rows: BackupRecord[];
		creatingBackup: boolean;
		restoringId: string;
		manualExpireDays: number;
		onCreateBackup: (expireDays: number) => void;
		onDownload: (id: string) => void;
		onRestore: (row: BackupRecord) => void;
		onDelete: (row: BackupRecord) => void;
	};

	let {
		rows,
		creatingBackup,
		restoringId,
		manualExpireDays = $bindable(),
		onCreateBackup,
		onDownload,
		onRestore,
		onDelete
	}: Props = $props();
</script>

<Card class="p-4">
	<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="text-base font-semibold">{$_('admin.backup.operations.title')}</h2>
			<p class="mt-1 text-sm text-muted-foreground">{$_('admin.backup.operations.description')}</p>
		</div>
		<div class="flex flex-wrap items-end gap-2">
			<label class="space-y-1 text-xs font-medium">
				<span>{$_('admin.backup.operations.expireDays')}</span>
				<Input class="w-24" bind:value={manualExpireDays} type="number" min="0" data-testid="backup-manual-expire-days" />
			</label>
			<Button size="sm" onclick={() => onCreateBackup(normalizeRetainNumber(manualExpireDays, 14))} disabled={creatingBackup}>
				<HardDrive size={14} />{creatingBackup ? $_('admin.backup.operations.backing') : $_('admin.backup.operations.createBackup')}
			</Button>
		</div>
	</div>
	<div class="overflow-x-auto rounded-md border border-border">
		<table class="w-full min-w-[860px] text-sm" data-testid="backup-table">
			<thead>
				<tr class="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
					<th class="px-3 py-2">ID</th>
					<th class="px-3 py-2">{$_('admin.backup.columns.status')}</th>
					<th class="px-3 py-2">{$_('admin.backup.columns.fileName')}</th>
					<th class="px-3 py-2">{$_('admin.backup.columns.size')}</th>
					<th class="px-3 py-2">{$_('admin.backup.columns.expiresAt')}</th>
					<th class="px-3 py-2">{$_('admin.backup.columns.triggeredBy')}</th>
					<th class="px-3 py-2">{$_('admin.backup.columns.startedAt')}</th>
					<th class="px-3 py-2">{$_('admin.backup.columns.actions')}</th>
				</tr>
			</thead>
			<tbody>
				{#each rows as row (row.id)}
					<tr class="border-b last:border-b-0" data-testid="backup-row">
						<td class="px-3 py-3 font-mono text-xs">{row.id}</td>
						<td class="px-3 py-3">
							<Badge variant="outline" class={backupStatusTone(row.status)}>{backupStatusLabel(row)}</Badge>
						</td>
						<td class="max-w-48 truncate px-3 py-3 text-xs" title={row.file_name}>{row.file_name || '-'}</td>
						<td class="px-3 py-3 text-xs">{formatBackupSize(row.size_bytes)}</td>
						<td class="px-3 py-3 text-xs">{row.expires_at ? formatBackupDate(row.expires_at) : $_('admin.backup.neverExpire')}</td>
						<td class="px-3 py-3 text-xs">{backupTriggerLabel(row.triggered_by)}</td>
						<td class="px-3 py-3 text-xs">{formatBackupDate(row.started_at)}</td>
						<td class="px-3 py-3">
							<div class="flex flex-wrap gap-1.5">
								{#if row.status === 'completed'}
									<Button variant="outline" size="sm" onclick={() => onDownload(row.id)}>
										<Download size={13} />{$_('admin.backup.actions.download')}
									</Button>
									<Button variant="outline" size="sm" disabled={restoringId === row.id} onclick={() => onRestore(row)}>
										<RotateCcw size={13} />{restoringId === row.id ? $_('common.loading', { default: 'Loading' }) : $_('admin.backup.actions.restore')}
									</Button>
								{/if}
								<Button variant="outline" size="sm" class="text-destructive" onclick={() => onDelete(row)}>
									<Trash2 size={13} />{$_('common.delete', { default: 'Delete' })}
								</Button>
							</div>
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="8" class="px-3 py-8 text-center text-sm text-muted-foreground">{$_('admin.backup.empty')}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</Card>
