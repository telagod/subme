<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { Cloud, Download, HardDrive, RefreshCw, RotateCcw, Save, Trash2 } from '@lucide/svelte';
	import Alert from '$lib/ui/Alert.svelte';
	import Badge from '$lib/ui/Badge.svelte';
	import Button from '$lib/ui/Button.svelte';
	import Card from '$lib/ui/Card.svelte';
	import Checkbox from '$lib/ui/Checkbox.svelte';
	import Input from '$lib/ui/Input.svelte';
	import StandardDialog from '$lib/ui/StandardDialog.svelte';
	import {
		createBackup,
		deleteBackup,
		getBackup,
		getDownloadURL,
		getS3Config,
		getSchedule,
		listBackups,
		restoreBackup,
		testS3Connection,
		updateS3Config,
		updateSchedule,
		type BackupRecord,
		type BackupS3Config,
		type BackupScheduleConfig
	} from '$lib/api/admin/backup';
	import { showError, showInfo, showSuccess } from '$lib/stores/toast.svelte';
	import {
		backupStatusLabel,
		backupStatusTone,
		backupTriggerLabel,
		formatBackupDate,
		formatBackupSize,
		normalizeRetainNumber,
		summarizeBackups
	} from '$lib/features/backup/backup';

	const MAX_POLL_COUNT = 900;
	const POLL_INTERVAL_MS = 2000;

	let s3Form = $state<BackupS3Config>({
		endpoint: '',
		region: 'auto',
		bucket: '',
		access_key_id: '',
		secret_access_key: '',
		prefix: 'backups/',
		force_path_style: false
	});
	let s3SecretConfigured = $state(false);
	let savingS3 = $state(false);
	let testingS3 = $state(false);

	let scheduleForm = $state<BackupScheduleConfig>({
		enabled: false,
		cron_expr: '0 2 * * *',
		retain_days: 14,
		retain_count: 10
	});
	let savingSchedule = $state(false);

	let rows = $state<BackupRecord[]>([]);
	let loadingRows = $state(false);
	let creatingBackup = $state(false);
	let restoringId = $state('');
	let manualExpireDays = $state(14);
	let loadError = $state<string | null>(null);
	let actionResult = $state<string | null>(null);
	let r2GuideOpen = $state(false);
	let restoreDialogOpen = $state(false);
	let restoreTarget = $state<BackupRecord | null>(null);
	let restorePassword = $state('');
	let deleteDialogOpen = $state(false);
	let deleteTarget = $state<BackupRecord | null>(null);
	let backupPoll: ReturnType<typeof setInterval> | null = null;
	let restorePoll: ReturnType<typeof setInterval> | null = null;

	const summary = $derived(summarizeBackups(rows));
	const r2Rows = $derived([
		{ field: $_('admin.backup.s3.endpoint'), value: 'https://<account_id>.r2.cloudflarestorage.com' },
		{ field: $_('admin.backup.s3.region'), value: 'auto' },
		{ field: $_('admin.backup.s3.bucket'), value: $_('admin.backup.r2Guide.step4.bucketValue') },
		{ field: $_('admin.backup.s3.prefix'), value: 'backups/' },
		{ field: 'Access Key ID', value: $_('admin.backup.r2Guide.step4.fromStep2') },
		{ field: 'Secret Access Key', value: $_('admin.backup.r2Guide.step4.fromStep2') },
		{ field: $_('admin.backup.s3.forcePathStyle'), value: $_('admin.backup.r2Guide.step4.unchecked') }
	]);

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

	async function loadS3() {
		try {
			const cfg = await getS3Config();
			s3Form = {
				endpoint: cfg.endpoint || '',
				region: cfg.region || 'auto',
				bucket: cfg.bucket || '',
				access_key_id: cfg.access_key_id || '',
				secret_access_key: '',
				prefix: cfg.prefix || 'backups/',
				force_path_style: Boolean(cfg.force_path_style)
			};
			s3SecretConfigured = Boolean(cfg.access_key_id);
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		}
	}

	async function saveS3() {
		savingS3 = true;
		try {
			await updateS3Config(s3Form);
			showSuccess($_('admin.backup.s3.saved'));
			await loadS3();
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			savingS3 = false;
		}
	}

	async function testS3() {
		testingS3 = true;
		try {
			const result = await testS3Connection(s3Form);
			if (result.ok) showSuccess(result.message || $_('admin.backup.s3.testSuccess'));
			else showError(result.message || $_('admin.backup.s3.testFailed'));
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		} finally {
			testingS3 = false;
		}
	}

	async function loadSchedule() {
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

	async function createManualBackup() {
		creatingBackup = true;
		try {
			const record = await createBackup({ expire_days: normalizeRetainNumber(manualExpireDays, 14) });
			rows = [record, ...rows.filter((row) => row.id !== record.id)];
			actionResult = `Backup ${record.id} started`;
			startBackupPolling(record.id);
		} catch (err) {
			creatingBackup = false;
			showError(err instanceof Error ? err.message : String(err));
		}
	}

	async function downloadBackup(id: string) {
		try {
			const result = await getDownloadURL(id);
			window.open(result.url, '_blank', 'noopener,noreferrer');
			actionResult = `Download URL opened for ${id}`;
		} catch (err) {
			showError(err instanceof Error ? err.message : String(err));
		}
	}

	function openRestore(row: BackupRecord) {
		restoreTarget = row;
		restorePassword = '';
		restoreDialogOpen = true;
	}

	async function confirmRestore() {
		if (!restoreTarget || !restorePassword.trim()) return;
		restoringId = restoreTarget.id;
		try {
			const record = await restoreBackup(restoreTarget.id, restorePassword);
			updateRecord(record);
			actionResult = `Restore started for ${restoreTarget.id}`;
			restoreDialogOpen = false;
			startRestorePolling(restoreTarget.id);
		} catch (err) {
			restoringId = '';
			showError(err instanceof Error ? err.message : String(err));
		}
	}

	function openDelete(row: BackupRecord) {
		deleteTarget = row;
		deleteDialogOpen = true;
	}

	async function confirmDelete() {
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
		void loadS3();
		void loadSchedule();
		void loadRows();
	});

	onDestroy(() => {
		stopBackupPolling();
		stopRestorePolling();
	});
</script>

<svelte:head>
	<title>{$_('admin.backup.title', { default: 'Database Backup' })}</title>
</svelte:head>

<div class="space-y-4 px-5 py-5">
	<header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
		<div>
			<h1 class="text-xl font-semibold tracking-tight text-foreground">{$_('admin.backup.title')}</h1>
			<p class="text-sm text-muted-foreground">{$_('admin.backup.description')}</p>
		</div>
		<div class="flex gap-2">
			<Button variant="outline" onclick={loadRows} disabled={loadingRows}>
				<RefreshCw size={15} class={loadingRows ? 'animate-spin' : ''} />{$_('common.refresh', { default: 'Refresh' })}
			</Button>
			<Button onclick={createManualBackup} disabled={creatingBackup}>
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

	<Card class="p-4">
		<div class="mb-4 flex flex-wrap items-start justify-between gap-3">
			<div>
				<h2 class="text-base font-semibold">{$_('admin.backup.s3.title')}</h2>
				<p class="mt-1 text-sm text-muted-foreground">
					{$_('admin.backup.s3.descriptionPrefix')}
					<Button variant="ghost" size="sm" class="h-auto px-1 underline" onclick={() => (r2GuideOpen = true)}>Cloudflare R2</Button>
					{$_('admin.backup.s3.descriptionSuffix')}
				</p>
			</div>
			<div class="flex gap-2">
				<Button variant="outline" size="sm" onclick={testS3} disabled={testingS3}>
					<Cloud size={14} />{testingS3 ? $_('common.loading', { default: 'Loading' }) : $_('admin.backup.s3.testConnection')}
				</Button>
				<Button size="sm" onclick={saveS3} disabled={savingS3}>
					<Save size={14} />{savingS3 ? $_('common.loading', { default: 'Loading' }) : $_('common.save', { default: 'Save' })}
				</Button>
			</div>
		</div>
		<div class="grid gap-3 md:grid-cols-2">
			<label class="space-y-1 text-xs font-medium">
				<span>{$_('admin.backup.s3.endpoint')}</span>
				<Input bind:value={s3Form.endpoint} placeholder="https://<account_id>.r2.cloudflarestorage.com" data-testid="backup-s3-endpoint" />
			</label>
			<label class="space-y-1 text-xs font-medium">
				<span>{$_('admin.backup.s3.region')}</span>
				<Input bind:value={s3Form.region} placeholder="auto" data-testid="backup-s3-region" />
			</label>
			<label class="space-y-1 text-xs font-medium">
				<span>{$_('admin.backup.s3.bucket')}</span>
				<Input bind:value={s3Form.bucket} data-testid="backup-s3-bucket" />
			</label>
			<label class="space-y-1 text-xs font-medium">
				<span>{$_('admin.backup.s3.prefix')}</span>
				<Input bind:value={s3Form.prefix} placeholder="backups/" data-testid="backup-s3-prefix" />
			</label>
			<label class="space-y-1 text-xs font-medium">
				<span>{$_('admin.backup.s3.accessKeyId')}</span>
				<Input bind:value={s3Form.access_key_id} data-testid="backup-s3-access-key" />
			</label>
			<label class="space-y-1 text-xs font-medium">
				<span>{$_('admin.backup.s3.secretAccessKey')}</span>
				<Input
					bind:value={s3Form.secret_access_key}
					type="password"
					placeholder={s3SecretConfigured ? $_('admin.backup.s3.secretConfigured') : ''}
					data-testid="backup-s3-secret"
				/>
			</label>
			<label class="flex items-center gap-2 text-sm md:col-span-2">
				<Checkbox bind:checked={s3Form.force_path_style} data-testid="backup-s3-force-path" />
				<span>{$_('admin.backup.s3.forcePathStyle')}</span>
			</label>
		</div>
	</Card>

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
				<Button size="sm" onclick={createManualBackup} disabled={creatingBackup}>
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
										<Button variant="outline" size="sm" onclick={() => downloadBackup(row.id)}>
											<Download size={13} />{$_('admin.backup.actions.download')}
										</Button>
										<Button variant="outline" size="sm" disabled={restoringId === row.id} onclick={() => openRestore(row)}>
											<RotateCcw size={13} />{restoringId === row.id ? $_('common.loading', { default: 'Loading' }) : $_('admin.backup.actions.restore')}
										</Button>
									{/if}
									<Button variant="outline" size="sm" class="text-destructive" onclick={() => openDelete(row)}>
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
</div>

<StandardDialog bind:open={r2GuideOpen} title={$_('admin.backup.r2Guide.title')} description={$_('admin.backup.r2Guide.intro')} width="lg" data-testid="backup-r2-guide">
	<div class="mt-4 max-h-[60vh] space-y-5 overflow-auto pr-1">
		<section>
			<h3 class="text-sm font-semibold">1. {$_('admin.backup.r2Guide.step1.title')}</h3>
			<ol class="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
				<li>{$_('admin.backup.r2Guide.step1.line1')}</li>
				<li>{$_('admin.backup.r2Guide.step1.line2')}</li>
				<li>{$_('admin.backup.r2Guide.step1.line3')}</li>
			</ol>
		</section>
		<section>
			<h3 class="text-sm font-semibold">2. {$_('admin.backup.r2Guide.step2.title')}</h3>
			<ol class="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
				<li>{$_('admin.backup.r2Guide.step2.line1')}</li>
				<li>{$_('admin.backup.r2Guide.step2.line2')}</li>
				<li>{$_('admin.backup.r2Guide.step2.line3')}</li>
				<li>{$_('admin.backup.r2Guide.step2.line4')}</li>
			</ol>
			<p class="mt-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">{$_('admin.backup.r2Guide.step2.warning')}</p>
		</section>
		<section>
			<h3 class="text-sm font-semibold">3. {$_('admin.backup.r2Guide.step3.title')}</h3>
			<p class="mt-2 text-sm text-muted-foreground">{$_('admin.backup.r2Guide.step3.desc')}</p>
			<code class="mt-2 block rounded bg-muted px-3 py-2 text-xs">https://&lt;{$_('admin.backup.r2Guide.step3.accountId')}&gt;.r2.cloudflarestorage.com</code>
		</section>
		<section>
			<h3 class="text-sm font-semibold">4. {$_('admin.backup.r2Guide.step4.title')}</h3>
			<div class="mt-2 overflow-hidden rounded-md border border-border">
				{#each r2Rows as item}
					<div class="grid grid-cols-[160px_1fr] border-b text-sm last:border-b-0">
						<p class="bg-muted px-3 py-2 font-medium">{item.field}</p>
						<code class="px-3 py-2 text-xs text-muted-foreground">{item.value}</code>
					</div>
				{/each}
			</div>
		</section>
		<p class="rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">{$_('admin.backup.r2Guide.freeTier')}</p>
	</div>
	<div class="mt-5 flex justify-end">
		<Button variant="outline" onclick={() => (r2GuideOpen = false)}>{$_('common.close', { default: 'Close' })}</Button>
	</div>
</StandardDialog>

<StandardDialog bind:open={restoreDialogOpen} title={$_('admin.backup.actions.restore')} description={$_('admin.backup.actions.restoreConfirm')} width="sm" data-testid="backup-restore-dialog">
	<div class="mt-4 space-y-4">
		<label class="space-y-1 text-sm font-medium">
			<span>{$_('admin.backup.actions.restorePasswordPrompt')}</span>
			<Input bind:value={restorePassword} type="password" data-testid="backup-restore-password" />
		</label>
		<div class="flex justify-end gap-2 border-t pt-4">
			<Button variant="outline" onclick={() => (restoreDialogOpen = false)}>{$_('common.cancel', { default: 'Cancel' })}</Button>
			<Button onclick={confirmRestore} disabled={!restorePassword.trim() || !restoreTarget || restoringId === restoreTarget.id} data-testid="backup-restore-confirm">
				{$_('admin.backup.actions.restore')}
			</Button>
		</div>
	</div>
</StandardDialog>

<StandardDialog bind:open={deleteDialogOpen} title={$_('common.delete', { default: 'Delete' })} description={$_('admin.backup.actions.deleteConfirm')} width="sm" data-testid="backup-delete-dialog">
	<div class="mt-4 flex justify-end gap-2 border-t pt-4">
		<Button variant="outline" onclick={() => (deleteDialogOpen = false)}>{$_('common.cancel', { default: 'Cancel' })}</Button>
		<Button variant="outline" class="text-destructive" onclick={confirmDelete} disabled={!deleteTarget} data-testid="backup-delete-confirm">
			{$_('common.delete', { default: 'Delete' })}
		</Button>
	</div>
</StandardDialog>
