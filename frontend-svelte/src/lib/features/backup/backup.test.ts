import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor, within } from '@testing-library/svelte';
import { addMessages, init, locale } from 'svelte-i18n';
import { tick } from 'svelte';
import pageSrc from '../../../routes/admin/backup/+page.svelte?raw';
import apiSrc from '$lib/api/admin/backup.ts?raw';
import navSrc from '$lib/nav/admin.config.ts?raw';
import {
	backupStatusLabel,
	backupStatusTone,
	backupTriggerLabel,
	formatBackupSize,
	normalizeRetainNumber,
	summarizeBackups
} from './backup';

vi.mock('$lib/api/admin/backup', () => ({
	createBackup: vi.fn(),
	deleteBackup: vi.fn(),
	getBackup: vi.fn(),
	getDownloadURL: vi.fn(),
	getS3Config: vi.fn(),
	getSchedule: vi.fn(),
	listBackups: vi.fn(),
	restoreBackup: vi.fn(),
	testS3Connection: vi.fn(),
	updateS3Config: vi.fn(),
	updateSchedule: vi.fn()
}));

vi.mock('$lib/stores/toast.svelte', () => ({
	showError: vi.fn(),
	showInfo: vi.fn(),
	showSuccess: vi.fn()
}));

const messages = {
	en: {
		common: {
			cancel: 'Cancel',
			close: 'Close',
			delete: 'Delete',
			loading: 'Loading',
			refresh: 'Refresh',
			save: 'Save'
		},
		admin: {
			backup: {
				title: 'Database Backup',
				description: 'Backup database',
				s3: {
					title: 'S3 Storage Configuration',
					descriptionPrefix: 'Configure S3-compatible storage (supports',
					descriptionSuffix: ')',
					endpoint: 'Endpoint',
					region: 'Region',
					bucket: 'Bucket',
					prefix: 'Key Prefix',
					accessKeyId: 'Access Key ID',
					secretAccessKey: 'Secret Access Key',
					secretConfigured: 'Already configured',
					forcePathStyle: 'Force Path Style',
					testConnection: 'Test Connection',
					testSuccess: 'S3 connection test successful',
					testFailed: 'S3 connection test failed',
					saved: 'S3 configuration saved'
				},
				schedule: {
					title: 'Scheduled Backup',
					description: 'Configure automatic scheduled backups',
					enabled: 'Enable Scheduled Backup',
					cronExpr: 'Cron Expression',
					cronHint: 'Cron hint',
					retainDays: 'Backup Expire Days',
					retainDaysHint: 'Days hint',
					retainCount: 'Max Retain Count',
					retainCountHint: 'Count hint',
					saved: 'Schedule configuration saved'
				},
				operations: {
					title: 'Backup Records',
					description: 'Manage records',
					createBackup: 'Create Backup',
					backing: 'Backing up...',
					backupCreated: 'Backup created successfully',
					expireDays: 'Expire Days',
					backupRunning: 'Backup in progress...',
					backupFailed: 'Backup failed',
					restoreRunning: 'Restore in progress...',
					restoreFailed: 'Restore failed'
				},
				columns: {
					status: 'Status',
					fileName: 'File Name',
					size: 'Size',
					expiresAt: 'Expires At',
					triggeredBy: 'Triggered By',
					startedAt: 'Started At',
					actions: 'Actions'
				},
				neverExpire: 'Never',
				empty: 'No backup records',
				actions: {
					download: 'Download',
					restore: 'Restore',
					restoreConfirm: 'Restore confirm',
					restorePasswordPrompt: 'Password',
					restoreSuccess: 'Database restored successfully',
					deleteConfirm: 'Delete confirm',
					deleted: 'Backup deleted'
				},
				r2Guide: {
					title: 'Cloudflare R2 Setup Guide',
					intro: 'R2 intro',
					step1: { title: 'Create bucket', line1: 'a', line2: 'b', line3: 'c' },
					step2: { title: 'Create token', line1: 'a', line2: 'b', line3: 'c', line4: 'd', warning: 'warning' },
					step3: { title: 'Endpoint', desc: 'Endpoint desc', accountId: 'account' },
					step4: { title: 'Fill', bucketValue: 'bucket', fromStep2: 'token', unchecked: 'unchecked' },
					freeTier: 'free'
				}
			}
		}
	}
};

const record = {
	id: 'b1',
	status: 'completed',
	file_name: 'backup.sql.gz',
	size_bytes: 2048,
	triggered_by: 'manual',
	started_at: '2026-01-01T00:00:00Z',
	expires_at: null
};

describe('admin backup helpers', () => {
	it('formats backup values and summarizes records', () => {
		expect(formatBackupSize(0)).toBe('-');
		expect(formatBackupSize(2048)).toBe('2.0 KB');
		expect(backupStatusLabel({ id: 'r1', status: 'running', progress: 'uploading' })).toBe('uploading');
		expect(backupStatusTone('failed')).toContain('destructive');
		expect(backupTriggerLabel('scheduled')).toBe('scheduled');
		expect(normalizeRetainNumber('9', 14)).toBe(9);
		expect(normalizeRetainNumber(-1, 14)).toBe(14);
		expect(
			summarizeBackups([
				{ id: '1', status: 'completed' },
				{ id: '2', status: 'running' },
				{ id: '3', status: 'failed' }
			])
		).toEqual([
			{ label: 'Total', value: 3 },
			{ label: 'Completed', value: 1 },
			{ label: 'Running', value: 1 },
			{ label: 'Failed', value: 1 }
		]);
	});

	it('keeps backup page wired to upstream backup API and admin nav', () => {
		expect(apiSrc).toContain('/api/v1/admin/backups');
		expect(pageSrc).toContain('getS3Config');
		expect(pageSrc).toContain('restoreBackup');
		expect(pageSrc).toContain('data-testid="backup-table"');
		expect(navSrc).toContain("path: '/admin/backup'");
	});
});

describe('admin backup page', () => {
	beforeEach(async () => {
		await init({ fallbackLocale: 'en', initialLocale: 'en' });
		addMessages('en', messages.en);
		locale.set('en');
		vi.clearAllMocks();
	});

	it('loads config, saves S3 and schedule, and runs backup record actions', async () => {
		const api = await import('$lib/api/admin/backup');
		(api.getS3Config as ReturnType<typeof vi.fn>).mockResolvedValue({
			endpoint: 'https://r2.example',
			region: 'auto',
			bucket: 'sub2api',
			access_key_id: 'ak',
			prefix: 'backups/',
			force_path_style: false
		});
		(api.getSchedule as ReturnType<typeof vi.fn>).mockResolvedValue({
			enabled: true,
			cron_expr: '0 3 * * *',
			retain_days: 21,
			retain_count: 12
		});
		(api.listBackups as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [record] });
		(api.testS3Connection as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, message: 'ok' });
		(api.updateS3Config as ReturnType<typeof vi.fn>).mockResolvedValue({});
		(api.updateSchedule as ReturnType<typeof vi.fn>).mockResolvedValue({});
		(api.createBackup as ReturnType<typeof vi.fn>).mockResolvedValue({ ...record, id: 'b2', status: 'running' });
		(api.getDownloadURL as ReturnType<typeof vi.fn>).mockResolvedValue({ url: 'https://download.example/b1' });
		(api.restoreBackup as ReturnType<typeof vi.fn>).mockResolvedValue({ ...record, restore_status: 'running' });
		(api.deleteBackup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
		const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
		const page = await import('../../../routes/admin/backup/+page.svelte');

		const { container } = render(page.default);
		await waitFor(() => expect(api.getS3Config).toHaveBeenCalled());
		await waitFor(() => expect(api.listBackups).toHaveBeenCalled());
		await waitFor(() => expect(container.textContent).toContain('backup.sql.gz'));

		const endpoint = within(container).getByTestId('backup-s3-endpoint') as HTMLInputElement;
		await waitFor(() => expect(endpoint.value).toBe('https://r2.example'));
		await fireEvent.input(endpoint, { target: { value: 'https://r2.changed' } });
		await fireEvent.click(within(container).getByRole('button', { name: /Test Connection/ }));
		await waitFor(() => expect(api.testS3Connection).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'https://r2.changed' })));
		await fireEvent.click(within(container).getAllByRole('button', { name: /Save/ })[0]);
		await waitFor(() => expect(api.updateS3Config).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'https://r2.changed' })));

		const cron = within(container).getByTestId('backup-schedule-cron') as HTMLInputElement;
		await fireEvent.input(cron, { target: { value: '0 4 * * *' } });
		await fireEvent.click(within(container).getAllByRole('button', { name: /Save/ })[1]);
		await waitFor(() => expect(api.updateSchedule).toHaveBeenCalledWith(expect.objectContaining({ cron_expr: '0 4 * * *' })));

		await fireEvent.input(within(container).getByTestId('backup-manual-expire-days'), { target: { value: '30' } });
		await fireEvent.click(within(container).getAllByRole('button', { name: /Create Backup/ })[1]);
		await waitFor(() => expect(api.createBackup).toHaveBeenCalledWith({ expire_days: 30 }));
		await waitFor(() => expect(container.querySelector('[data-testid="backup-action-result"]')?.textContent).toContain('Backup b2 started'));

		const row = [...container.querySelectorAll('[data-testid="backup-row"]')].find((item) =>
			item.textContent?.includes('b1')
		) as HTMLElement;
		await fireEvent.click(within(row).getByRole('button', { name: /Download/ }));
		await waitFor(() => expect(api.getDownloadURL).toHaveBeenCalledWith('b1'));
		expect(openSpy).toHaveBeenCalledWith('https://download.example/b1', '_blank', 'noopener,noreferrer');

		await fireEvent.click(within(row).getByRole('button', { name: /Restore/ }));
		await waitFor(() => expect(document.querySelector('[data-testid="backup-restore-dialog"]')).not.toBeNull());
		const restoreDialog = document.querySelector('[data-testid="backup-restore-dialog"]') as HTMLElement;
		await fireEvent.input(within(restoreDialog).getByTestId('backup-restore-password'), { target: { value: 'secret' } });
		await fireEvent.click(within(restoreDialog).getByTestId('backup-restore-confirm'));
		await waitFor(() => expect(api.restoreBackup).toHaveBeenCalledWith('b1', 'secret'));

		await fireEvent.click(within(row).getByRole('button', { name: /Delete/ }));
		await waitFor(() => expect(document.querySelector('[data-testid="backup-delete-dialog"]')).not.toBeNull());
		await fireEvent.click(within(document.body).getByTestId('backup-delete-confirm'));
		await waitFor(() => expect(api.deleteBackup).toHaveBeenCalledWith('b1'));

		await fireEvent.click(within(container).getByRole('button', { name: /Cloudflare R2/ }));
		await tick();
		expect(document.querySelector('[data-testid="backup-r2-guide"]')?.textContent).toContain('Cloudflare R2 Setup Guide');
	});
});
