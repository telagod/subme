import { apiClient } from '../client';
import { unwrapData, type ApiEnvelope } from './supply';

export interface BackupS3Config {
	endpoint: string;
	region: string;
	bucket: string;
	access_key_id: string;
	secret_access_key?: string;
	prefix: string;
	force_path_style: boolean;
}

export interface BackupScheduleConfig {
	enabled: boolean;
	cron_expr: string;
	retain_days: number;
	retain_count: number;
}

export interface BackupRecord {
	id: string;
	status: 'pending' | 'running' | 'completed' | 'failed' | string;
	backup_type?: string;
	file_name?: string;
	s3_key?: string;
	size_bytes?: number;
	triggered_by?: string;
	error_message?: string;
	started_at?: string;
	finished_at?: string;
	expires_at?: string;
	progress?: string;
	restore_status?: string;
	restore_error?: string;
	restored_at?: string;
	[key: string]: unknown;
}

export interface CreateBackupRequest {
	expire_days?: number;
}

export interface TestS3Response {
	ok: boolean;
	message: string;
}

export interface BackupListResponse {
	items: BackupRecord[];
}

const BASE = '/api/v1/admin/backups';

export async function getS3Config(): Promise<BackupS3Config> {
	const raw = await apiClient.get<ApiEnvelope<BackupS3Config>>(`${BASE}/s3-config`);
	return unwrapData(raw);
}

export async function updateS3Config(config: BackupS3Config): Promise<BackupS3Config> {
	const raw = await apiClient.put<ApiEnvelope<BackupS3Config>>(`${BASE}/s3-config`, config);
	return unwrapData(raw);
}

export async function testS3Connection(config: BackupS3Config): Promise<TestS3Response> {
	const raw = await apiClient.post<ApiEnvelope<TestS3Response>>(`${BASE}/s3-config/test`, config);
	return unwrapData(raw);
}

export async function getSchedule(): Promise<BackupScheduleConfig> {
	const raw = await apiClient.get<ApiEnvelope<BackupScheduleConfig>>(`${BASE}/schedule`);
	return unwrapData(raw);
}

export async function updateSchedule(config: BackupScheduleConfig): Promise<BackupScheduleConfig> {
	const raw = await apiClient.put<ApiEnvelope<BackupScheduleConfig>>(`${BASE}/schedule`, config);
	return unwrapData(raw);
}

export async function createBackup(payload: CreateBackupRequest = {}): Promise<BackupRecord> {
	const raw = await apiClient.post<ApiEnvelope<BackupRecord>>(BASE, payload);
	return unwrapData(raw);
}

export async function listBackups(): Promise<BackupListResponse> {
	const raw = await apiClient.get<ApiEnvelope<BackupListResponse>>(BASE);
	return unwrapData(raw);
}

export async function getBackup(id: string): Promise<BackupRecord> {
	const raw = await apiClient.get<ApiEnvelope<BackupRecord>>(`${BASE}/${id}`);
	return unwrapData(raw);
}

export async function deleteBackup(id: string): Promise<void> {
	await apiClient.delete<ApiEnvelope<void>>(`${BASE}/${id}`);
}

export async function getDownloadURL(id: string): Promise<{ url: string }> {
	const raw = await apiClient.get<ApiEnvelope<{ url: string }>>(`${BASE}/${id}/download-url`);
	return unwrapData(raw);
}

export async function restoreBackup(id: string, password: string): Promise<BackupRecord> {
	const raw = await apiClient.post<ApiEnvelope<BackupRecord>>(`${BASE}/${id}/restore`, {
		password
	});
	return unwrapData(raw);
}

export const backupAPI = {
	getS3Config,
	updateS3Config,
	testS3Connection,
	getSchedule,
	updateSchedule,
	createBackup,
	listBackups,
	getBackup,
	deleteBackup,
	getDownloadURL,
	restoreBackup
};

export default backupAPI;
