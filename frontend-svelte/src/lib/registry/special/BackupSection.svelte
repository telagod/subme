<script lang="ts">
	/**
	 * BackupSection · 数据备份完整面板（M10d · backup tab）
	 *
	 * 端口自 frontend/src/views/admin/BackupView.vue。
	 *
	 * 三个独立卡：
	 *   1. S3 存储配置 —— GET/PUT /api/admin/backups/s3-config + Test 按钮
	 *   2. 定时备份 —— GET/PUT /api/admin/backups/schedule
	 *   3. 备份操作 —— POST/GET/DELETE /api/admin/backups + Restore/Download/Delete
	 *
	 * 与 flat-form 完全解耦 —— 独立 fetch lifecycle，不向父级 emit。
	 * 与 OverloadCooldown/RateLimit429 同框架。
	 *
	 * 简化点（与 Vue tree 差异）：
	 *   - R2 引导弹窗 backlog（仅留 link 文本）—— Modal 组件未端口。
	 *   - 轮询保留 polling timer + visibilitychange 暂停；恢复时刷新一次。
	 *   - restoreConfirm + password prompt 用 window.confirm/prompt（与 BackupView.vue 同款）。
	 */
	import { onDestroy, onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import {
		settingsApi,
		type BackupS3Config,
		type BackupScheduleConfig,
		type BackupRecord
	} from '$lib/api/admin/settingsRegistry';
	import { showError, showInfo, showSuccess } from '$lib/stores/toast.svelte';

	// 仓库内 toast 暂无 warning 通道，用 info 表达 (UX 落地同色系)。
	const showWarning = showInfo;

	type FieldUpdate = { key: string; value: unknown };

	type Props = {
		values?: Record<string, unknown>;
		dirtyKeys?: Set<string>;
		onFieldUpdate?: (e: FieldUpdate) => void;
	};

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { values: _v, dirtyKeys: _d, onFieldUpdate: _f }: Props = $props();

	// ── S3 form ──────────────────────────────────────────────────────────────
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

	// ── Schedule form ────────────────────────────────────────────────────────
	let scheduleForm = $state<BackupScheduleConfig>({
		enabled: false,
		cron_expr: '0 2 * * *',
		retain_days: 14,
		retain_count: 10
	});
	let savingSchedule = $state(false);

	// ── Backups list ─────────────────────────────────────────────────────────
	let backups = $state<BackupRecord[]>([]);
	let loadingBackups = $state(false);
	let creatingBackup = $state(false);
	let restoringId = $state('');
	let manualExpireDays = $state(14);

	let pollingTimer: ReturnType<typeof setInterval> | null = null;
	let restorePollingTimer: ReturnType<typeof setInterval> | null = null;
	const MAX_POLL_COUNT = 900;

	// loading 闸 —— 测试链路需在 onMount fetch 完成后才输入/点击；非测试也能拿
	// 到一个 skeleton 占位，避免 form 在 GET resolve 后突然被覆写。
	let loading = $state(true);

	// ── helpers ──────────────────────────────────────────────────────────────
	function updateRecordInList(updated: BackupRecord) {
		const idx = backups.findIndex((r) => r.id === updated.id);
		if (idx >= 0) {
			const next = [...backups];
			next[idx] = updated;
			backups = next;
		}
	}

	function stopPolling() {
		if (pollingTimer) {
			clearInterval(pollingTimer);
			pollingTimer = null;
		}
	}
	function stopRestorePolling() {
		if (restorePollingTimer) {
			clearInterval(restorePollingTimer);
			restorePollingTimer = null;
		}
	}

	function startPolling(id: string) {
		stopPolling();
		let count = 0;
		pollingTimer = setInterval(async () => {
			if (count++ >= MAX_POLL_COUNT) {
				stopPolling();
				creatingBackup = false;
				showWarning($_('admin.backup.operations.backupRunning'));
				return;
			}
			try {
				const r = await settingsApi.getBackup(id);
				updateRecordInList(r);
				if (r.status === 'completed' || r.status === 'failed') {
					stopPolling();
					creatingBackup = false;
					if (r.status === 'completed') {
						showSuccess($_('admin.backup.operations.backupCreated'));
					} else {
						showError(r.error_message || $_('admin.backup.operations.backupFailed'));
					}
					await loadBackups();
				}
			} catch {
				// 静默忽略
			}
		}, 2000);
	}

	function startRestorePolling(id: string) {
		stopRestorePolling();
		let count = 0;
		restorePollingTimer = setInterval(async () => {
			if (count++ >= MAX_POLL_COUNT) {
				stopRestorePolling();
				restoringId = '';
				showWarning($_('admin.backup.operations.restoreRunning'));
				return;
			}
			try {
				const r = await settingsApi.getBackup(id);
				updateRecordInList(r);
				if (r.restore_status === 'completed' || r.restore_status === 'failed') {
					stopRestorePolling();
					restoringId = '';
					if (r.restore_status === 'completed') {
						showSuccess($_('admin.backup.actions.restoreSuccess'));
					} else {
						showError(r.restore_error || $_('admin.backup.operations.restoreFailed'));
					}
					await loadBackups();
				}
			} catch {
				// 静默忽略
			}
		}, 2000);
	}

	function onVisibility() {
		if (typeof document === 'undefined') return;
		if (document.hidden) {
			stopPolling();
			stopRestorePolling();
		} else {
			void loadBackups().then(() => {
				const running = backups.find((r) => r.status === 'running');
				if (running) {
					creatingBackup = true;
					startPolling(running.id);
				}
				const restoring = backups.find((r) => r.restore_status === 'running');
				if (restoring) {
					restoringId = restoring.id;
					startRestorePolling(restoring.id);
				}
			});
		}
	}

	// ── API wrappers ─────────────────────────────────────────────────────────
	async function loadS3Config() {
		try {
			const cfg = await settingsApi.getBackupS3Config();
			s3Form = {
				endpoint: cfg.endpoint || '',
				region: cfg.region || 'auto',
				bucket: cfg.bucket || '',
				access_key_id: cfg.access_key_id || '',
				secret_access_key: '',
				prefix: cfg.prefix || 'backups/',
				force_path_style: !!cfg.force_path_style
			};
			s3SecretConfigured = Boolean(cfg.access_key_id);
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('errors.networkError'));
		}
	}

	async function saveS3Config() {
		savingS3 = true;
		try {
			await settingsApi.updateBackupS3Config(s3Form);
			showSuccess($_('admin.backup.s3.saved'));
			await loadS3Config();
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('errors.networkError'));
		} finally {
			savingS3 = false;
		}
	}

	async function testS3() {
		testingS3 = true;
		try {
			const r = await settingsApi.testBackupS3Connection(s3Form);
			if (r.ok) {
				showSuccess(r.message || $_('admin.backup.s3.testSuccess'));
			} else {
				showError(r.message || $_('admin.backup.s3.testFailed'));
			}
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('errors.networkError'));
		} finally {
			testingS3 = false;
		}
	}

	async function loadSchedule() {
		try {
			const cfg = await settingsApi.getBackupSchedule();
			scheduleForm = {
				enabled: !!cfg.enabled,
				cron_expr: cfg.cron_expr || '0 2 * * *',
				retain_days: typeof cfg.retain_days === 'number' ? cfg.retain_days : 14,
				retain_count: typeof cfg.retain_count === 'number' ? cfg.retain_count : 10
			};
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('errors.networkError'));
		}
	}

	async function saveSchedule() {
		savingSchedule = true;
		try {
			await settingsApi.updateBackupSchedule(scheduleForm);
			showSuccess($_('admin.backup.schedule.saved'));
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('errors.networkError'));
		} finally {
			savingSchedule = false;
		}
	}

	async function loadBackups() {
		loadingBackups = true;
		try {
			const r = await settingsApi.listBackups();
			backups = r.items ?? [];
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('errors.networkError'));
		} finally {
			loadingBackups = false;
		}
	}

	async function createBackup() {
		creatingBackup = true;
		try {
			const rec = await settingsApi.createBackup({ expire_days: manualExpireDays });
			backups = [rec, ...backups];
			startPolling(rec.id);
		} catch (err: unknown) {
			const e = err as { response?: { status?: number }; message?: string };
			if (e?.response?.status === 409) {
				showWarning($_('admin.backup.operations.alreadyInProgress'));
			} else {
				showError(e?.message || $_('errors.networkError'));
			}
			creatingBackup = false;
		}
	}

	async function downloadBackup(id: string) {
		try {
			const r = await settingsApi.getBackupDownloadURL(id);
			if (typeof window !== 'undefined') window.open(r.url, '_blank');
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('errors.networkError'));
		}
	}

	async function restoreBackup(id: string) {
		if (typeof window === 'undefined') return;
		if (!window.confirm($_('admin.backup.actions.restoreConfirm'))) return;
		const password = window.prompt($_('admin.backup.actions.restorePasswordPrompt'));
		if (!password) return;
		restoringId = id;
		try {
			const rec = await settingsApi.restoreBackup(id, password);
			updateRecordInList(rec);
			startRestorePolling(id);
		} catch (err: unknown) {
			const e = err as { response?: { status?: number }; message?: string };
			if (e?.response?.status === 409) {
				showWarning($_('admin.backup.operations.restoreRunning'));
			} else {
				showError(e?.message || $_('errors.networkError'));
			}
			restoringId = '';
		}
	}

	async function removeBackup(id: string) {
		if (typeof window === 'undefined') return;
		if (!window.confirm($_('admin.backup.actions.deleteConfirm'))) return;
		try {
			await settingsApi.deleteBackup(id);
			showSuccess($_('admin.backup.actions.deleted'));
			await loadBackups();
		} catch (err) {
			showError(err instanceof Error ? err.message : $_('errors.networkError'));
		}
	}

	// ── format helpers ───────────────────────────────────────────────────────
	function statusClass(status: string): string {
		switch (status) {
			case 'completed':
				return 'bg-emerald-500/10 text-emerald-400';
			case 'running':
				return 'bg-sky-500/10 text-sky-400';
			case 'failed':
				return 'bg-red-500/10 text-red-400';
			default:
				return 'bg-muted text-foreground/85';
		}
	}

	function formatSize(bytes: number | undefined): string {
		if (!bytes || bytes <= 0) return '-';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function formatDate(v?: string): string {
		if (!v) return '-';
		const d = new Date(v);
		if (Number.isNaN(d.getTime())) return v;
		return d.toLocaleString();
	}

	function statusLabel(rec: BackupRecord): string {
		if (rec.status === 'running' && rec.progress) {
			return $_(`admin.backup.progress.${rec.progress}`, { default: rec.progress });
		}
		return $_(`admin.backup.status.${rec.status}`, { default: rec.status });
	}

	function triggerLabel(rec: BackupRecord): string {
		return rec.triggered_by === 'scheduled'
			? $_('admin.backup.trigger.scheduled')
			: $_('admin.backup.trigger.manual');
	}

	// ── lifecycle ────────────────────────────────────────────────────────────
	onMount(async () => {
		if (typeof document !== 'undefined') {
			document.addEventListener('visibilitychange', onVisibility);
		}
		try {
			await Promise.all([loadS3Config(), loadSchedule(), loadBackups()]);
		} finally {
			loading = false;
		}

		const running = backups.find((r) => r.status === 'running');
		if (running) {
			creatingBackup = true;
			startPolling(running.id);
		}
		const restoring = backups.find((r) => r.restore_status === 'running');
		if (restoring) {
			restoringId = restoring.id;
			startRestorePolling(restoring.id);
		}
	});

	onDestroy(() => {
		stopPolling();
		stopRestorePolling();
		if (typeof document !== 'undefined') {
			document.removeEventListener('visibilitychange', onVisibility);
		}
	});

	// ── input handlers ───────────────────────────────────────────────────────
	function onS3Field<K extends keyof BackupS3Config>(key: K, e: Event) {
		const v = (e.target as HTMLInputElement).value;
		s3Form = { ...s3Form, [key]: v } as BackupS3Config;
	}
	function onS3Checkbox(e: Event) {
		const checked = (e.target as HTMLInputElement).checked;
		s3Form = { ...s3Form, force_path_style: checked };
	}
	function onScheduleEnabled(e: Event) {
		const checked = (e.target as HTMLInputElement).checked;
		scheduleForm = { ...scheduleForm, enabled: checked };
	}
	function onScheduleCron(e: Event) {
		scheduleForm = { ...scheduleForm, cron_expr: (e.target as HTMLInputElement).value };
	}
	function onScheduleRetainDays(e: Event) {
		const raw = (e.target as HTMLInputElement).value;
		scheduleForm = { ...scheduleForm, retain_days: raw === '' ? 0 : Number(raw) };
	}
	function onScheduleRetainCount(e: Event) {
		const raw = (e.target as HTMLInputElement).value;
		scheduleForm = { ...scheduleForm, retain_count: raw === '' ? 0 : Number(raw) };
	}
	function onExpireDays(e: Event) {
		const raw = (e.target as HTMLInputElement).value;
		manualExpireDays = raw === '' ? 0 : Number(raw);
	}
</script>

<div class="flex flex-col gap-6" data-special="backup">
	{#if loading}
		<div
			data-testid="backup-loading"
			class="flex items-center gap-2 text-sm text-muted-foreground"
		>
			{$_('common.loading')}
		</div>
	{:else}
	<!-- ── S3 storage config ──────────────────────────────────────────── -->
	<section class="rounded-md border border-border bg-card p-4" data-testid="backup-s3-card">
		<header class="mb-3">
			<h3 class="text-sm font-semibold text-foreground">
				{$_('admin.backup.s3.title')}
			</h3>
			<p class="mt-0.5 text-xs text-muted-foreground">
				{$_('admin.backup.s3.description')}
			</p>
		</header>
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			<div class="flex flex-col gap-1">
				<label class="text-xs font-medium text-muted-foreground" for="backup-s3-endpoint">
					{$_('admin.backup.s3.endpoint')}
				</label>
				<input
					id="backup-s3-endpoint"
					data-testid="backup-s3-endpoint"
					type="text"
					placeholder="https://<account_id>.r2.cloudflarestorage.com"
					value={s3Form.endpoint}
					oninput={(e) => onS3Field('endpoint', e)}
					class="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
				/>
			</div>
			<div class="flex flex-col gap-1">
				<label class="text-xs font-medium text-muted-foreground" for="backup-s3-region">
					{$_('admin.backup.s3.region')}
				</label>
				<input
					id="backup-s3-region"
					type="text"
					placeholder="auto"
					value={s3Form.region}
					oninput={(e) => onS3Field('region', e)}
					class="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
				/>
			</div>
			<div class="flex flex-col gap-1">
				<label class="text-xs font-medium text-muted-foreground" for="backup-s3-bucket">
					{$_('admin.backup.s3.bucket')}
				</label>
				<input
					id="backup-s3-bucket"
					data-testid="backup-s3-bucket"
					type="text"
					value={s3Form.bucket}
					oninput={(e) => onS3Field('bucket', e)}
					class="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
				/>
			</div>
			<div class="flex flex-col gap-1">
				<label class="text-xs font-medium text-muted-foreground" for="backup-s3-prefix">
					{$_('admin.backup.s3.prefix')}
				</label>
				<input
					id="backup-s3-prefix"
					type="text"
					placeholder="backups/"
					value={s3Form.prefix}
					oninput={(e) => onS3Field('prefix', e)}
					class="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
				/>
			</div>
			<div class="flex flex-col gap-1">
				<label class="text-xs font-medium text-muted-foreground" for="backup-s3-akid">
					{$_('admin.backup.s3.accessKeyId')}
				</label>
				<input
					id="backup-s3-akid"
					type="text"
					value={s3Form.access_key_id}
					oninput={(e) => onS3Field('access_key_id', e)}
					class="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
				/>
			</div>
			<div class="flex flex-col gap-1">
				<label class="text-xs font-medium text-muted-foreground" for="backup-s3-secret">
					{$_('admin.backup.s3.secretAccessKey')}
				</label>
				<input
					id="backup-s3-secret"
					type="password"
					autocomplete="new-password"
					placeholder={s3SecretConfigured ? $_('admin.backup.s3.secretConfigured') : ''}
					value={s3Form.secret_access_key ?? ''}
					oninput={(e) => onS3Field('secret_access_key', e)}
					class="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
				/>
			</div>
			<label
				class="inline-flex items-center gap-2 text-xs sm:col-span-2"
			>
				<input
					type="checkbox"
					data-testid="backup-s3-force-path-style"
					checked={s3Form.force_path_style}
					onchange={onS3Checkbox}
					class="h-4 w-4 rounded border-input"
				/>
				<span>{$_('admin.backup.s3.forcePathStyle')}</span>
			</label>
		</div>
		<div class="mt-3 flex flex-wrap gap-2">
			<button
				type="button"
				data-testid="backup-s3-test"
				disabled={testingS3}
				onclick={testS3}
				class="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs hover:bg-accent disabled:opacity-50"
			>
				{testingS3 ? $_('common.loading') : $_('admin.backup.s3.testConnection')}
			</button>
			<button
				type="button"
				data-testid="backup-s3-save"
				disabled={savingS3}
				onclick={saveS3Config}
				class="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
			>
				{savingS3 ? $_('common.loading') : $_('common.save')}
			</button>
		</div>
	</section>

	<!-- ── Schedule config ────────────────────────────────────────────── -->
	<section class="rounded-md border border-border bg-card p-4" data-testid="backup-schedule-card">
		<header class="mb-3">
			<h3 class="text-sm font-semibold text-foreground">
				{$_('admin.backup.schedule.title')}
			</h3>
			<p class="mt-0.5 text-xs text-muted-foreground">
				{$_('admin.backup.schedule.description')}
			</p>
		</header>
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			<label class="inline-flex items-center gap-2 text-xs sm:col-span-2">
				<input
					type="checkbox"
					data-testid="backup-schedule-enabled"
					checked={scheduleForm.enabled}
					onchange={onScheduleEnabled}
					class="h-4 w-4 rounded border-input"
				/>
				<span>{$_('admin.backup.schedule.enabled')}</span>
			</label>
			<div class="flex flex-col gap-1">
				<label class="text-xs font-medium text-muted-foreground" for="backup-schedule-cron">
					{$_('admin.backup.schedule.cronExpr')}
				</label>
				<input
					id="backup-schedule-cron"
					data-testid="backup-schedule-cron"
					type="text"
					placeholder="0 2 * * *"
					value={scheduleForm.cron_expr}
					oninput={onScheduleCron}
					class="h-9 rounded-md border border-input bg-background px-3 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring"
				/>
				<p class="text-[11px] text-muted-foreground">
					{$_('admin.backup.schedule.cronHint')}
				</p>
			</div>
			<div class="flex flex-col gap-1">
				<label class="text-xs font-medium text-muted-foreground" for="backup-schedule-days">
					{$_('admin.backup.schedule.retainDays')}
				</label>
				<input
					id="backup-schedule-days"
					data-testid="backup-schedule-retain-days"
					type="number"
					min="0"
					value={scheduleForm.retain_days}
					oninput={onScheduleRetainDays}
					class="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
				/>
				<p class="text-[11px] text-muted-foreground">
					{$_('admin.backup.schedule.retainDaysHint')}
				</p>
			</div>
			<div class="flex flex-col gap-1">
				<label class="text-xs font-medium text-muted-foreground" for="backup-schedule-count">
					{$_('admin.backup.schedule.retainCount')}
				</label>
				<input
					id="backup-schedule-count"
					data-testid="backup-schedule-retain-count"
					type="number"
					min="0"
					value={scheduleForm.retain_count}
					oninput={onScheduleRetainCount}
					class="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
				/>
				<p class="text-[11px] text-muted-foreground">
					{$_('admin.backup.schedule.retainCountHint')}
				</p>
			</div>
		</div>
		<div class="mt-3">
			<button
				type="button"
				data-testid="backup-schedule-save"
				disabled={savingSchedule}
				onclick={saveSchedule}
				class="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
			>
				{savingSchedule ? $_('common.loading') : $_('common.save')}
			</button>
		</div>
	</section>

	<!-- ── Backup operations / records ────────────────────────────────── -->
	<section class="rounded-md border border-border bg-card p-4" data-testid="backup-operations-card">
		<header class="mb-3 flex flex-wrap items-center justify-between gap-3">
			<div>
				<h3 class="text-sm font-semibold text-foreground">
					{$_('admin.backup.operations.title')}
				</h3>
				<p class="mt-0.5 text-xs text-muted-foreground">
					{$_('admin.backup.operations.description')}
				</p>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				<label class="inline-flex items-center gap-1 text-xs">
					<span class="text-muted-foreground">
						{$_('admin.backup.operations.expireDays')}
					</span>
					<input
						type="number"
						min="0"
						data-testid="backup-expire-days"
						value={manualExpireDays}
						oninput={onExpireDays}
						class="h-7 w-20 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
					/>
				</label>
				<button
					type="button"
					data-testid="backup-create"
					disabled={creatingBackup}
					onclick={createBackup}
					class="inline-flex h-7 items-center rounded-md bg-primary px-3 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
				>
					{creatingBackup
						? $_('admin.backup.operations.backing')
						: $_('admin.backup.operations.createBackup')}
				</button>
				<button
					type="button"
					data-testid="backup-refresh"
					disabled={loadingBackups}
					onclick={loadBackups}
					class="inline-flex h-7 items-center rounded-md border border-input bg-background px-3 text-xs hover:bg-accent disabled:opacity-50"
				>
					{loadingBackups ? $_('common.loading') : $_('common.refresh')}
				</button>
			</div>
		</header>

		<div class="overflow-x-auto">
			<table class="w-full min-w-[760px] text-xs" data-testid="backup-table">
				<thead>
					<tr class="border-b border-border text-left uppercase tracking-wide text-muted-foreground">
						<th class="py-2 pr-3">ID</th>
						<th class="py-2 pr-3">{$_('admin.backup.columns.status')}</th>
						<th class="py-2 pr-3">{$_('admin.backup.columns.fileName')}</th>
						<th class="py-2 pr-3">{$_('admin.backup.columns.size')}</th>
						<th class="py-2 pr-3">{$_('admin.backup.columns.expiresAt')}</th>
						<th class="py-2 pr-3">{$_('admin.backup.columns.triggeredBy')}</th>
						<th class="py-2 pr-3">{$_('admin.backup.columns.startedAt')}</th>
						<th class="py-2">{$_('admin.backup.columns.actions')}</th>
					</tr>
				</thead>
				<tbody>
					{#each backups as rec (rec.id)}
						<tr class="border-b border-border" data-testid="backup-row" data-id={rec.id}>
							<td class="py-2 pr-3 font-mono">{rec.id}</td>
							<td class="py-2 pr-3">
								<span
									class="inline-flex items-center rounded border border-border px-1.5 py-px {statusClass(
										rec.status
									)}"
								>
									{statusLabel(rec)}
								</span>
							</td>
							<td class="py-2 pr-3">{rec.file_name ?? '-'}</td>
							<td class="py-2 pr-3">{formatSize(rec.size_bytes)}</td>
							<td class="py-2 pr-3">
								{rec.expires_at ? formatDate(rec.expires_at) : $_('admin.backup.neverExpire')}
							</td>
							<td class="py-2 pr-3">{triggerLabel(rec)}</td>
							<td class="py-2 pr-3">{formatDate(rec.started_at)}</td>
							<td class="py-2">
								<div class="flex flex-wrap gap-1">
									{#if rec.status === 'completed'}
										<button
											type="button"
											data-testid="backup-download"
											onclick={() => downloadBackup(rec.id)}
											class="inline-flex h-6 items-center rounded border border-input bg-background px-2 text-[11px] hover:bg-accent"
										>
											{$_('admin.backup.actions.download')}
										</button>
										<button
											type="button"
											data-testid="backup-restore"
											disabled={restoringId === rec.id}
											onclick={() => restoreBackup(rec.id)}
											class="inline-flex h-6 items-center rounded border border-input bg-background px-2 text-[11px] hover:bg-accent disabled:opacity-50"
										>
											{restoringId === rec.id
												? $_('common.loading')
												: $_('admin.backup.actions.restore')}
										</button>
									{/if}
									<button
										type="button"
										data-testid="backup-delete"
										onclick={() => removeBackup(rec.id)}
										class="inline-flex h-6 items-center rounded border border-destructive/30 bg-background px-2 text-[11px] text-destructive hover:bg-destructive/10"
									>
										{$_('common.delete')}
									</button>
								</div>
							</td>
						</tr>
					{/each}
					{#if backups.length === 0}
						<tr>
							<td
								colspan="8"
								data-testid="backup-empty"
								class="py-4 text-center text-muted-foreground"
							>
								{$_('admin.backup.empty')}
							</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>
	</section>
	{/if}
</div>
