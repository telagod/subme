import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../client';
import { generateAuthUrl as generateAntigravityAuthUrl, refreshAntigravityToken } from './antigravity';
import { updateApiKeyGroup } from './apiKeys';
import { createBackup, getDownloadURL, getS3Config, updateSchedule } from './backup';
import {
	apply,
	list as listChannelMonitorTemplates,
	listAssociatedMonitors
} from './channelMonitorTemplate';
import {
	createBackupJob,
	getAgentHealth,
	listBackupJobs,
	listSourceProfiles,
	setActiveS3Profile
} from './dataManagement';
import { create as createErrorRule, toggleEnabled } from './errorPassthrough';
import { exchangeCode as exchangeGeminiCode, getCapabilities } from './gemini';
import { listByAccount, listResults } from './scheduledTests';
import { checkUpdates, restartService } from './system';
import { create as createTLSProfile, deleteProfile } from './tlsFingerprintProfile';
import {
	getBatchUserAttributes,
	listEnabledDefinitions,
	updateUserAttributeValues
} from './userAttributes';

vi.mock('../client', () => ({
	apiClient: {
		delete: vi.fn(),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn()
	}
}));

const mockedApi = apiClient as unknown as {
	delete: ReturnType<typeof vi.fn>;
	get: ReturnType<typeof vi.fn>;
	post: ReturnType<typeof vi.fn>;
	put: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe('admin infrastructure API facades', () => {
	it('covers OAuth and API key infrastructure endpoints', async () => {
		mockedApi.post.mockResolvedValueOnce({ code: 0, data: { url: 'https://ag.example/auth' } });
		await expect(generateAntigravityAuthUrl({ redirect_uri: '/cb' })).resolves.toEqual({
			url: 'https://ag.example/auth'
		});
		expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/antigravity/oauth/auth-url', {
			redirect_uri: '/cb'
		});

		mockedApi.post.mockResolvedValueOnce({ code: 0, data: { refreshed: true } });
		await expect(refreshAntigravityToken({ account_id: 7 })).resolves.toEqual({ refreshed: true });
		expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/antigravity/oauth/refresh-token', {
			account_id: 7
		});

		mockedApi.post.mockResolvedValueOnce({ code: 0, data: { token: 'gem' } });
		await expect(exchangeGeminiCode({ code: 'abc' })).resolves.toEqual({ token: 'gem' });
		expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/gemini/oauth/exchange-code', {
			code: 'abc'
		});

		mockedApi.get.mockResolvedValueOnce({ code: 0, data: { oauth: true } });
		await expect(getCapabilities()).resolves.toEqual({ oauth: true });
		expect(mockedApi.get).toHaveBeenCalledWith('/api/v1/admin/gemini/oauth/capabilities');

		mockedApi.put.mockResolvedValueOnce({ code: 0, data: { message: 'ok' } });
		await expect(updateApiKeyGroup(9, { group_id: 3 })).resolves.toEqual({ message: 'ok' });
		expect(mockedApi.put).toHaveBeenCalledWith('/api/v1/admin/api-keys/9', { group_id: 3 });
	});

	it('covers backup and system lifecycle endpoints', async () => {
		mockedApi.get.mockResolvedValueOnce({ code: 0, data: { bucket: 'backups' } });
		await expect(getS3Config()).resolves.toEqual({ bucket: 'backups' });
		expect(mockedApi.get).toHaveBeenCalledWith('/api/v1/admin/backups/s3-config');

		mockedApi.put.mockResolvedValueOnce({ code: 0, data: { enabled: true, cron_expr: '0 3 * * *' } });
		await expect(
			updateSchedule({ enabled: true, cron_expr: '0 3 * * *', retain_days: 7, retain_count: 3 })
		).resolves.toEqual({ enabled: true, cron_expr: '0 3 * * *' });
		expect(mockedApi.put).toHaveBeenCalledWith('/api/v1/admin/backups/schedule', {
			cron_expr: '0 3 * * *',
			enabled: true,
			retain_count: 3,
			retain_days: 7
		});

		mockedApi.post.mockResolvedValueOnce({ code: 0, data: { id: 'b1', status: 'pending' } });
		await expect(createBackup({ expire_days: 14 })).resolves.toEqual({ id: 'b1', status: 'pending' });
		expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/backups', { expire_days: 14 });

		mockedApi.get.mockResolvedValueOnce({ code: 0, data: { url: 'https://download.example' } });
		await expect(getDownloadURL('b1')).resolves.toEqual({ url: 'https://download.example' });
		expect(mockedApi.get).toHaveBeenCalledWith('/api/v1/admin/backups/b1/download-url');

		mockedApi.get.mockResolvedValueOnce({ code: 0, data: { has_update: false } });
		await expect(checkUpdates(true)).resolves.toEqual({ has_update: false });
		expect(mockedApi.get).toHaveBeenCalledWith('/api/v1/admin/system/check-updates?force=true');

		mockedApi.post.mockResolvedValueOnce({ code: 0, data: { message: 'restarting' } });
		await expect(restartService()).resolves.toEqual({ message: 'restarting' });
		expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/system/restart', {});
	});

	it('covers data-management source, S3, and backup job endpoints', async () => {
		mockedApi.get.mockResolvedValueOnce({ code: 0, data: { enabled: true } });
		await expect(getAgentHealth()).resolves.toEqual({ enabled: true });
		expect(mockedApi.get).toHaveBeenCalledWith('/api/v1/admin/data-management/agent/health');

		mockedApi.get.mockResolvedValueOnce({ code: 0, data: { items: [{ profile_id: 'pg-main' }] } });
		await expect(listSourceProfiles('postgres')).resolves.toEqual({ items: [{ profile_id: 'pg-main' }] });
		expect(mockedApi.get).toHaveBeenCalledWith(
			'/api/v1/admin/data-management/sources/postgres/profiles'
		);

		mockedApi.post.mockResolvedValueOnce({ code: 0, data: { profile_id: 's3-main', is_active: true } });
		await expect(setActiveS3Profile('s3-main')).resolves.toEqual({
			is_active: true,
			profile_id: 's3-main'
		});
		expect(mockedApi.post).toHaveBeenCalledWith(
			'/api/v1/admin/data-management/s3/profiles/s3-main/activate',
			{}
		);

		mockedApi.post.mockResolvedValueOnce({ code: 0, data: { job_id: 'job1', status: 'queued' } });
		await expect(createBackupJob({ backup_type: 'full', upload_to_s3: true })).resolves.toEqual({
			job_id: 'job1',
			status: 'queued'
		});
		expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/data-management/backups', {
			backup_type: 'full',
			upload_to_s3: true
		});

		mockedApi.get.mockResolvedValueOnce({ code: 0, data: { items: [] } });
		await expect(listBackupJobs({ backup_type: 'redis', status: 'failed' })).resolves.toEqual({
			items: []
		});
		expect(mockedApi.get).toHaveBeenCalledWith(
			'/api/v1/admin/data-management/backups?backup_type=redis&status=failed'
		);
	});

	it('covers channel-monitor templates, passthrough rules, scheduled tests, and TLS profiles', async () => {
		mockedApi.get.mockResolvedValueOnce({ code: 0, data: { items: [{ id: 1, name: 'tpl' }] } });
		await expect(listChannelMonitorTemplates({ provider: 'anthropic', api_mode: 'messages' })).resolves.toEqual([
			{ id: 1, name: 'tpl' }
		]);
		expect(mockedApi.get).toHaveBeenCalledWith(
			'/api/v1/admin/channel-monitor-templates?provider=anthropic&api_mode=messages'
		);

		mockedApi.post.mockResolvedValueOnce({ code: 0, data: { affected: 2 } });
		await expect(apply(1, { monitor_ids: [7, 8] })).resolves.toEqual({ affected: 2 });
		expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/channel-monitor-templates/1/apply', {
			monitor_ids: [7, 8]
		});

		mockedApi.get.mockResolvedValueOnce({ code: 0, data: { items: [{ id: 7, name: 'm' }] } });
		await expect(listAssociatedMonitors(1)).resolves.toEqual([{ id: 7, name: 'm' }]);
		expect(mockedApi.get).toHaveBeenCalledWith('/api/v1/admin/channel-monitor-templates/1/monitors');

		mockedApi.post.mockResolvedValueOnce({ code: 0, data: { id: 5, enabled: true } });
		await expect(createErrorRule({ name: 'pass', enabled: true })).resolves.toEqual({
			enabled: true,
			id: 5
		});
		expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/error-passthrough-rules', {
			enabled: true,
			name: 'pass'
		});

		mockedApi.put.mockResolvedValueOnce({ code: 0, data: { id: 5, enabled: false } });
		await expect(toggleEnabled(5, false)).resolves.toEqual({ enabled: false, id: 5 });
		expect(mockedApi.put).toHaveBeenCalledWith('/api/v1/admin/error-passthrough-rules/5', {
			enabled: false
		});

		mockedApi.get.mockResolvedValueOnce({ code: 0, data: [{ id: 2 }] });
		await expect(listByAccount(12)).resolves.toEqual([{ id: 2 }]);
		expect(mockedApi.get).toHaveBeenCalledWith('/api/v1/admin/accounts/12/scheduled-test-plans');

		mockedApi.get.mockResolvedValueOnce({ code: 0, data: { items: [] } });
		await expect(listResults(2, { limit: 10 })).resolves.toEqual({ items: [] });
		expect(mockedApi.get).toHaveBeenCalledWith('/api/v1/admin/scheduled-test-plans/2/results?limit=10');

		mockedApi.post.mockResolvedValueOnce({ code: 0, data: { id: 4, name: 'chrome' } });
		await expect(createTLSProfile({ name: 'chrome' })).resolves.toEqual({ id: 4, name: 'chrome' });
		expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/tls-fingerprint-profiles', {
			name: 'chrome'
		});

		mockedApi.delete.mockResolvedValueOnce({ code: 0, data: { message: 'deleted' } });
		await expect(deleteProfile(4)).resolves.toEqual({ message: 'deleted' });
		expect(mockedApi.delete).toHaveBeenCalledWith('/api/v1/admin/tls-fingerprint-profiles/4');
	});

	it('covers user-attribute definition and value endpoints', async () => {
		mockedApi.get.mockResolvedValueOnce({ code: 0, data: [{ id: 1, key: 'dept' }] });
		await expect(listEnabledDefinitions()).resolves.toEqual([{ id: 1, key: 'dept' }]);
		expect(mockedApi.get).toHaveBeenCalledWith('/api/v1/admin/user-attributes?enabled=true');

		mockedApi.put.mockResolvedValueOnce({ code: 0, data: { message: 'ok' } });
		await expect(updateUserAttributeValues(7, { dept: 'ops' })).resolves.toEqual({ message: 'ok' });
		expect(mockedApi.put).toHaveBeenCalledWith('/api/v1/admin/users/7/attributes', {
			values: { dept: 'ops' }
		});

		mockedApi.post.mockResolvedValueOnce({ code: 0, data: { attributes: { 7: { 1: 'ops' } } } });
		await expect(getBatchUserAttributes([7])).resolves.toEqual({ attributes: { 7: { 1: 'ops' } } });
		expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/admin/user-attributes/batch', {
			user_ids: [7]
		});
	});
});
