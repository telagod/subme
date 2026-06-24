import { apiClient } from '../client';
import { buildQuery, unwrapData, type ApiEnvelope } from './supply';

export interface ScheduledTestPlan {
	id: number;
	account_id?: number;
	name?: string;
	enabled?: boolean;
	cron_expr?: string;
	created_at?: string;
	updated_at?: string;
	[key: string]: unknown;
}

export interface ScheduledTestResult {
	id: number;
	plan_id: number;
	status?: string;
	started_at?: string;
	finished_at?: string;
	error_message?: string;
	[key: string]: unknown;
}

export type SaveScheduledTestPlanRequest = Partial<ScheduledTestPlan>;

const BASE = '/api/v1/admin/scheduled-test-plans';

export async function listByAccount(accountId: number): Promise<ScheduledTestPlan[]> {
	const raw = await apiClient.get<ApiEnvelope<ScheduledTestPlan[]>>(
		`/api/v1/admin/accounts/${accountId}/scheduled-test-plans`
	);
	return unwrapData(raw);
}

export async function create(payload: SaveScheduledTestPlanRequest): Promise<ScheduledTestPlan> {
	const raw = await apiClient.post<ApiEnvelope<ScheduledTestPlan>>(BASE, payload);
	return unwrapData(raw);
}

export async function update(
	id: number,
	payload: SaveScheduledTestPlanRequest
): Promise<ScheduledTestPlan> {
	const raw = await apiClient.put<ApiEnvelope<ScheduledTestPlan>>(`${BASE}/${id}`, payload);
	return unwrapData(raw);
}

export async function deletePlan(id: number): Promise<{ message?: string }> {
	const raw = await apiClient.delete<ApiEnvelope<{ message?: string }>>(`${BASE}/${id}`);
	return unwrapData(raw);
}

export async function listResults(
	planId: number,
	params: Record<string, unknown> = {}
): Promise<Record<string, unknown> | ScheduledTestResult[]> {
	const raw = await apiClient.get<ApiEnvelope<Record<string, unknown> | ScheduledTestResult[]>>(
		`${BASE}/${planId}/results${buildQuery(params)}`
	);
	return unwrapData(raw);
}

export const scheduledTestsAPI = {
	listByAccount,
	create,
	update,
	deletePlan,
	listResults
};

export default scheduledTestsAPI;
