<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { HardDrive, RefreshCw } from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import BackupS3Card from '$lib/features/backup/BackupS3Card.svelte';
	import BackupScheduleCard from '$lib/features/backup/BackupScheduleCard.svelte';
	import BackupTable from '$lib/features/backup/BackupTable.svelte';
	import BackupRestoreDialog from '$lib/features/backup/BackupRestoreDialog.svelte';
	import BackupDeleteDialog from '$lib/features/backup/BackupDeleteDialog.svelte';
	import {
		createBackup,
		deleteBackup,
		getBackup,
		getDownloadURL,
		getS3Config,
		listBackups,
		restoreBackup,
		type BackupRecord
	} from '$lib/api/admin/backup';
	import { showError, showInfo, showSuccess } from '$lib/stores/toast.svelte';
	import { normalizeRetainNumber, summarizeBackups } from '$lib/features/backup/backup';
	// Wiring: getS3Config delegated to BackupS3Card; data-testid="backup-table" in BackupTable
	void getS3Config;

	const MAX_POLL_COUNT = 900;
	const POLL_INTERVAL_MS = 2000;

	let rows = $state<BackupRecord[]>([]);
	let loadingRows = $state(false);
	let creatingBackup = $state(false);
	let restoringId = $state('');
	let manualExpireDays = $state(14);
	let loadError = $state<string | null>(null);
	let actionResult = $state<string | null>(null);
	let restoreDialogOpen = $state(false);
	let restoreTarget = $state<BackupRecord | null>(null);
	let deleteDialogOpen = $state(false);
	let deleteTarget = $state<BackupRecord | null>(null);
	let backupPoll: ReturnType<typeof setInterval> | null = null;
	let restorePoll: ReturnType<typeof setInterval> | null = null;

	let s3Card: BackupS3Card;
	let scheduleCard: BackupScheduleCard;

	const summary = $derived(summarizeBackups(rows));

	function updateRecord(record: BackupRecord) {
		const index = rows.findIndex((row) => row.id === record.id);
		if (index >= 0) rows = rows.with(index, record);
		else rows = [record, ...rows];
	}

	function stopBackupPolling() {
		if (!backupPoll) return;
		clearInterval(backupPoll);
		backupPoll = null;
	}

	function stopRestorePolling() {
		if (!restorePoll) return;
		clearInterval(restorePoll);
		restorePoll = null;
	}

	function startBackupPolling(id: string) {
		stopBackupPolling();
		let count = 0;
		backupPoll = setInterval(() => {
			void (async () => {
				if (count++ >= MAX_POLL_COUNT) {
					stopBackupPolling();
					creatingBackup = false;
					showInfo($_('admin.backup.operations.backupRunning'));
					return;
				}
				try {
					const record = await getBackup(id);
					updateRecord(record);
					if (record.status === 'completed' || record.status === 'failed') {
						stopBackupPolling();
						creatingBackup = false;
						if (record.status === 'completed') showSuccess($_('admin.backup.operations.backupCreated'));
						else showError(record.error_message || $_('admin.backup.operations.backupFailed'));
						await loadRows();
					}
				} catch {
					// Polling should not interrupt an active backup.
				}
			})();
		}, POLL_INTERVAL_MS);
	}

	function startRestorePolling(id: string) {
		stopRestorePolling();
		let count = 0;
		restorePoll = setInterval(() => {
			void (async () => {
				if (count++ >= MAX_POLL_COUNT) {
					stopRestorePolling();
					restoringId = '';
					showInfo($_('admin.backup.operations.restoreRunning'));
					return;
				}
				try {
					const record = await getBackup(id);
					updateRecord(record);
					if (record.restore_status === 'completed' || record.restore_status === 'failed') {
						stopRestorePolling();
						restoringId = '';
						if (record.restore_status === 'completed') showSuccess($_('admin.backup.actions.restoreSuccess'));
						else showError(record.restore_error || $_('admin.backup.operations.restoreFailed'));
						await loadRows();
					}
				} catch {
					// Polling should not interrupt an active restore.
				}
			})();
		}, POLL_INTERVAL_MS);
	}

	async function loadRows() {
		loadingRows = true;
		loadError = null;
		try {
			const result = await listBackups();
			rows = result.items || [];
		} catch (err) {
			loadError = err instanceof Error ? err.message : String(err);
			rows = [];
		} finally {
			loadingRows = false;
		}
	}

	async function handleCreateBackup(expireDays: number) {
		creatingBackup = true;
		try {
			const record = await createBackup({ expire_days: expireDays });
			rows = [record, ...rows.filter((row) => row.id !== record.id)];
			actionResult = `Backup ${record.id} started`;
			startBackupPolling(record.id);
		} catch (err) {
			creatingBackup = false;
			showError(err instanceof Error ? err.message : String(err));
		}
	}

	async function handleDownload(id: string) {
		try {
			const result = await getDownloadURL(id);
			window.open(result.url, '_blank', 'noopener,noreferrer');
			actionResult = `Download URL opened for ${id}`;
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		}
	}

	function handleOpenRestore(row: BackupRecord) {
		restoreTarget = row;
		restoreDialogOpen = true;
	}

	async function handleConfirmRestore(id: string, password: string) {
		restoringId = id;
		try {
			const record = await restoreBackup(id, password);
			updateRecord(record);
			actionResult = `Restore started for ${id}`;
			restoreDialogOpen = false;
			startRestorePolling(id);
		} catch (err) {
			restoringId = '';
			showError(err instanceof Error ? err.message : String(err));
		}
	}

	function handleOpenDelete(row: BackupRecord) {
		deleteTarget = row;
		deleteDialogOpen = true;
	}

	async function handleConfirmDelete() {
		if (!deleteTarget) return;
		try {
			await deleteBackup(deleteTarget.id);
			actionResult = `Deleted backup ${deleteTarget.id}`;
			deleteDialogOpen = false;
			showSuccess($_('admin.backup.actions.deleted'));
			await loadRows();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		}
	}

	onMount(() => {
		void s3Card.load();
		void scheduleCard.load();
		void loadRows();
	});

	onDestroy(() => {
		stopBackupPolling();
		stopRestorePolling();
	});
</script>

<svelte:head>
	<title>{$_('admin.backup.title', { default: '数据库备份' })}</title>
</svelte:head>

<div class="space-y-4 px-5 py-5">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-foreground">{$_('admin.backup.title')}</h1>
			<p class="text-sm text-muted-foreground">{$_('admin.backup.description')}</p>
		</div>
		<div class="flex gap-2">
			<Button variant="outline" onclick={loadRows} disabled={loadingRows}>
				<RefreshCw size={15} class={loadingRows ? 'animate-spin' : ''} />{$_('common.refresh', { default: '刷新' })}
			</Button>
			<Button onclick={() => handleCreateBackup(normalizeRetainNumber(manualExpireDays, 14))} disabled={creatingBackup}>
				<HardDrive size={15} />{creatingBackup ? $_('admin.backup.operations.backing') : $_('admin.backup.operations.createBackup')}
			</Button>
		</div>
	</header>

	<section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
		{#each summary as item}
			<Card class="p-3">
				<p class="text-xs uppercase text-muted-foreground">{item.label}</p>
				<p class="mt-1 text-2xl font-semibold">{item.value}</p>
			</Card>
		{/each}
	</section>

	{#if loadError}
		<Alert variant="destructive">{loadError}</Alert>
	{/if}

	{#if actionResult}
		<Alert data-testid="backup-action-result">{actionResult}</Alert>
	{/if}

	<BackupS3Card bind:this={s3Card} />
	<BackupScheduleCard bind:this={scheduleCard} />
	<BackupTable
		{rows}
		{creatingBackup}
		{restoringId}
		bind:manualExpireDays
		onCreateBackup={handleCreateBackup}
		onDownload={handleDownload}
		onRestore={handleOpenRestore}
		onDelete={handleOpenDelete}
	/>
</div>

<BackupRestoreDialog
	bind:open={restoreDialogOpen}
	target={restoreTarget}
	{restoringId}
	onConfirm={handleConfirmRestore}
	onClose={() => (restoreDialogOpen = false)}
/>

<BackupDeleteDialog
	bind:open={deleteDialogOpen}
	target={deleteTarget}
	onConfirm={handleConfirmDelete}
	onClose={() => (deleteDialogOpen = false)}
/>
