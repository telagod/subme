import { apiClient } from '../client';
import { unwrapData, type ApiEnvelope } from './supply';

export type GeminiOAuthPayload = Record<string, unknown>;
export type GeminiOAuthResult = Record<string, unknown>;
export type GeminiCapabilities = Record<string, unknown>;

const BASE = '/api/v1/admin/gemini';

export async function generateAuthUrl(payload: GeminiOAuthPayload): Promise<GeminiOAuthResult> {
	const raw = await apiClient.post<ApiEnvelope<GeminiOAuthResult>>(`${BASE}/oauth/auth-url`, payload);
	return unwrapData(raw);
}

export async function exchangeCode(payload: GeminiOAuthPayload): Promise<GeminiOAuthResult> {
	const raw = await apiClient.post<ApiEnvelope<GeminiOAuthResult>>(
		`${BASE}/oauth/exchange-code`,
		payload
	);
	return unwrapData(raw);
}

export async function getCapabilities(): Promise<GeminiCapabilities> {
	const raw = await apiClient.get<ApiEnvelope<GeminiCapabilities>>(`${BASE}/oauth/capabilities`);
	return unwrapData(raw);
}

export const geminiAPI = {
	generateAuthUrl,
	exchangeCode,
	getCapabilities
};

export default geminiAPI;
