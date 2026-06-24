import { apiClient } from '../client';
import { unwrapData, type ApiEnvelope } from './supply';

export type AntigravityOAuthPayload = Record<string, unknown>;
export type AntigravityOAuthResult = Record<string, unknown>;

const BASE = '/api/v1/admin/antigravity';

export async function generateAuthUrl(
	payload: AntigravityOAuthPayload
): Promise<AntigravityOAuthResult> {
	const raw = await apiClient.post<ApiEnvelope<AntigravityOAuthResult>>(
		`${BASE}/oauth/auth-url`,
		payload
	);
	return unwrapData(raw);
}

export async function exchangeCode(
	payload: AntigravityOAuthPayload
): Promise<AntigravityOAuthResult> {
	const raw = await apiClient.post<ApiEnvelope<AntigravityOAuthResult>>(
		`${BASE}/oauth/exchange-code`,
		payload
	);
	return unwrapData(raw);
}

export async function refreshAntigravityToken(
	payload: AntigravityOAuthPayload
): Promise<AntigravityOAuthResult> {
	const raw = await apiClient.post<ApiEnvelope<AntigravityOAuthResult>>(
		`${BASE}/oauth/refresh-token`,
		payload
	);
	return unwrapData(raw);
}

export const antigravityAPI = {
	generateAuthUrl,
	exchangeCode,
	refreshAntigravityToken
};

export default antigravityAPI;
