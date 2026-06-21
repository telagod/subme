import { apiClient } from '../client';
import { buildQuery, unwrapData, type ApiEnvelope } from './supply';

export type BackupType = 'postgres' | 'redis' | 'full';
export type BackupJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'partial_succeeded' | string;
export type SourceType = 'postgres' | 'redis';

export interface BackupAgentInfo {
	status: string;
	version: string;
	uptime_seconds: number;
}

export interface BackupAgentHealth {
	enabled: boolean;
	reason?: string;
	socket_path?: string;
	agent?: BackupAgentInfo;
	[key: string]: unknown;
}

export interface DataManagementSourceConfig {
	host?: string;
	port?: number;
	user?: string;
	password?: string;
	database?: string;
	ssl_mode?: string;
	addr?: string;
	username?: string;
	db?: number;
	container_name?: string;
	[key: string]: unknown;
}

export interface DataManagementS3Config {
	enabled: boolean;
	endpoint: string;
	region: string;
	bucket: string;
	access_key_id: string;
	secret_access_key?: string;
	secret_access_key_configured?: boolean;
	prefix: string;
	force_path_style: boolean;
	use_ssl: boolean;
	[key: string]: unknown;
}

export interface DataManagementConfig {
	source_mode: 'direct' | 'docker_exec' | string;
	backup_root: string;
	sqlite_path?: string;
	retention_days: number;
	keep_last: number;
	active_postgres_profile_id?: string;
	active_redis_profile_id?: string;
	active_s3_profile_id?: string;
	postgres?: DataManagementSourceConfig;
	redis?: DataManagementSourceConfig;
	s3?: DataManagementS3Config;
	[key: string]: unknown;
}

export interface DataManagementSourceProfile {
	source_type: SourceType;
	profile_id: string;
	name: string;
	is_active: boolean;
	password_configured?: boolean;
	config: DataManagementSourceConfig;
	created_at?: string;
	updated_at?: string;
}

export interface CreateSourceProfileRequest {
	profile_id: string;
	name: string;
	config: DataManagementSourceConfig;
	set_active?: boolean;
}

export interface UpdateSourceProfileRequest {
	name: string;
	config: DataManagementSourceConfig;
}

export interface DataManagementS3Profile {
	profile_id: string;
	name: string;
	is_active: boolean;
	s3: DataManagementS3Config;
	secret_access_key_configured?: boolean;
	created_at?: string;
	updated_at?: string;
}

export interface CreateS3ProfileRequest extends Partial<DataManagementS3Config> {
	profile_id: string;
	name: string;
	set_active?: boolean;
}

export interface UpdateS3ProfileRequest extends Partial<DataManagementS3Config> {
	name: string;
}

export interface TestS3Request extends Partial<DataManagementS3Config> {
	secret_access_key: string;
}

export interface TestS3Response {
	ok: boolean;
	message: string;
}

export interface CreateBackupJobRequest {
	backup_type: BackupType;
	upload_to_s3?: boolean;
	s3_profile_id?: string;
	postgres_profile_id?: string;
	redis_profile_id?: string;
	idempotency_key?: string;
}

export interface CreateBackupJobResponse {
	job_id: string;
	status: BackupJobStatus;
}

export interface BackupJob {
	job_id: string;
	backup_type: BackupType;
	status: BackupJobStatus;
	triggered_by?: string;
	s3_profile_id?: string;
	postgres_profile_id?: string;
	redis_profile_id?: string;
	started_at?: string;
	finished_at?: string;
	error_message?: string;
	artifact?: Record<string, unknown>;
	s3?: Record<string, unknown>;
	[key: string]: unknown;
}

export interface ListBackupJobsRequest {
	page_size?: number;
	page_token?: string;
	status?: BackupJobStatus;
	backup_type?: BackupType;
}

export interface ListResponse<T> {
	items: T[];
	next_page_token?: string;
}

const BASE = '/api/v1/admin/data-management';

export async function getAgentHealth(): Promise<BackupAgentHealth> {
	const raw = await apiClient.get<ApiEnvelope<BackupAgentHealth>>(`${BASE}/agent/health`);
	return unwrapData(raw);
}

export async function getConfig(): Promise<DataManagementConfig> {
	const raw = await apiClient.get<ApiEnvelope<DataManagementConfig>>(`${BASE}/config`);
	return unwrapData(raw);
}

export async function updateConfig(payload: DataManagementConfig): Promise<DataManagementConfig> {
	const raw = await apiClient.put<ApiEnvelope<DataManagementConfig>>(`${BASE}/config`, payload);
	return unwrapData(raw);
}

export async function testS3(payload: TestS3Request): Promise<TestS3Response> {
	const raw = await apiClient.post<ApiEnvelope<TestS3Response>>(`${BASE}/s3/test`, payload);
	return unwrapData(raw);
}

export async function listSourceProfiles(sourceType: SourceType): Promise<ListResponse<DataManagementSourceProfile>> {
	const raw = await apiClient.get<ApiEnvelope<ListResponse<DataManagementSourceProfile>>>(
		`${BASE}/sources/${sourceType}/profiles`
	);
	return unwrapData(raw);
}

export async function createSourceProfile(
	sourceType: SourceType,
	payload: CreateSourceProfileRequest
): Promise<DataManagementSourceProfile> {
	const raw = await apiClient.post<ApiEnvelope<DataManagementSourceProfile>>(
		`${BASE}/sources/${sourceType}/profiles`,
		payload
	);
	return unwrapData(raw);
}

export async function updateSourceProfile(
	sourceType: SourceType,
	profileID: string,
	payload: UpdateSourceProfileRequest
): Promise<DataManagementSourceProfile> {
	const raw = await apiClient.put<ApiEnvelope<DataManagementSourceProfile>>(
		`${BASE}/sources/${sourceType}/profiles/${profileID}`,
		payload
	);
	return unwrapData(raw);
}

export async function deleteSourceProfile(sourceType: SourceType, profileID: string): Promise<void> {
	await apiClient.delete<ApiEnvelope<void>>(`${BASE}/sources/${sourceType}/profiles/${profileID}`);
}

export async function setActiveSourceProfile(
	sourceType: SourceType,
	profileID: string
): Promise<DataManagementSourceProfile> {
	const raw = await apiClient.post<ApiEnvelope<DataManagementSourceProfile>>(
		`${BASE}/sources/${sourceType}/profiles/${profileID}/activate`,
		{}
	);
	return unwrapData(raw);
}

export async function listS3Profiles(): Promise<ListResponse<DataManagementS3Profile>> {
	const raw = await apiClient.get<ApiEnvelope<ListResponse<DataManagementS3Profile>>>(`${BASE}/s3/profiles`);
	return unwrapData(raw);
}

export async function createS3Profile(payload: CreateS3ProfileRequest): Promise<DataManagementS3Profile> {
	const raw = await apiClient.post<ApiEnvelope<DataManagementS3Profile>>(`${BASE}/s3/profiles`, payload);
	return unwrapData(raw);
}

export async function updateS3Profile(
	profileID: string,
	payload: UpdateS3ProfileRequest
): Promise<DataManagementS3Profile> {
	const raw = await apiClient.put<ApiEnvelope<DataManagementS3Profile>>(
		`${BASE}/s3/profiles/${profileID}`,
		payload
	);
	return unwrapData(raw);
}

export async function deleteS3Profile(profileID: string): Promise<void> {
	await apiClient.delete<ApiEnvelope<void>>(`${BASE}/s3/profiles/${profileID}`);
}

export async function setActiveS3Profile(profileID: string): Promise<DataManagementS3Profile> {
	const raw = await apiClient.post<ApiEnvelope<DataManagementS3Profile>>(
		`${BASE}/s3/profiles/${profileID}/activate`,
		{}
	);
	return unwrapData(raw);
}

export async function createBackupJob(payload: CreateBackupJobRequest): Promise<CreateBackupJobResponse> {
	const raw = await apiClient.post<ApiEnvelope<CreateBackupJobResponse>>(`${BASE}/backups`, payload);
	return unwrapData(raw);
}

export async function listBackupJobs(
	params: ListBackupJobsRequest = {}
): Promise<ListResponse<BackupJob>> {
	const raw = await apiClient.get<ApiEnvelope<ListResponse<BackupJob>>>(
		`${BASE}/backups${buildQuery({ ...params })}`
	);
	return unwrapData(raw);
}

export async function getBackupJob(jobID: string): Promise<BackupJob> {
	const raw = await apiClient.get<ApiEnvelope<BackupJob>>(`${BASE}/backups/${jobID}`);
	return unwrapData(raw);
}

export const dataManagementAPI = {
	getAgentHealth,
	getConfig,
	updateConfig,
	listSourceProfiles,
	createSourceProfile,
	updateSourceProfile,
	deleteSourceProfile,
	setActiveSourceProfile,
	testS3,
	listS3Profiles,
	createS3Profile,
	updateS3Profile,
	deleteS3Profile,
	setActiveS3Profile,
	createBackupJob,
	listBackupJobs,
	getBackupJob
};

export default dataManagementAPI;
