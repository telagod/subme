import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './client';
import { authApi } from './auth';

vi.mock('./client', () => ({
	apiClient: {
		get: vi.fn(),
		post: vi.fn()
	}
}));

const mockedApi = apiClient as unknown as {
	get: ReturnType<typeof vi.fn>;
	post: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe('auth API facade', () => {
	it('unwraps backend login envelopes before returning auth data', async () => {
		mockedApi.post.mockResolvedValueOnce({
			code: 0,
			message: 'success',
			data: {
				access_token: 'jwt.abc',
				user: { id: 1, email: 'admin@sub2api.local', role: 'admin' }
			}
		});

		await expect(
			authApi.login({ email: 'admin@sub2api.local', password: 'sub2api-admin-123456' })
		).resolves.toEqual({
			access_token: 'jwt.abc',
			user: { id: 1, email: 'admin@sub2api.local', role: 'admin' }
		});
		expect(mockedApi.post).toHaveBeenCalledWith('/api/v1/auth/login', {
			email: 'admin@sub2api.local',
			password: 'sub2api-admin-123456'
		});
	});

	it('keeps legacy bare login responses working', async () => {
		mockedApi.post.mockResolvedValueOnce({
			access_token: 'jwt.bare',
			user: { id: 2, email: 'user@example.com', role: 'user' }
		});

		await expect(
			authApi.login({ email: 'user@example.com', password: 'password1' })
		).resolves.toEqual({
			access_token: 'jwt.bare',
			user: { id: 2, email: 'user@example.com', role: 'user' }
		});
	});
});
