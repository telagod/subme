import { describe, expect, it } from 'vitest';
import usersApiSrc from '$lib/api/admin/users.ts?raw';
import usersPageSrc from '../../../routes/admin/users/+page.svelte?raw';
import {
	formatMoney,
	roleTone,
	statusTone,
	summarizeUsers,
	userDisplayName,
	userGroups,
	userInitial
} from './users';
import type { AdminUser } from '$lib/api/admin/users';

describe('admin users helpers', () => {
	const users: AdminUser[] = [
		{
			id: 1,
			email: 'root@example.com',
			username: 'root',
			role: 'admin',
			status: 'active',
			balance: 12.345,
			groups: [{ id: 10, name: 'vip' }]
		},
		{
			id: 2,
			email: 'alice@example.com',
			role: 'user',
			status: 'disabled',
			balance: 3,
			allowed_groups: [20, 21]
		}
	];

	it('summarizes list state and formats display values', () => {
		expect(summarizeUsers(users)).toEqual([
			{ label: 'Total', value: 2 },
			{ label: 'Active', value: 1 },
			{ label: 'Admins', value: 1 },
			{ label: 'Balance', value: 15.35 }
		]);
		expect(userDisplayName(users[0])).toBe('root');
		expect(userInitial(users[1])).toBe('A');
		expect(userGroups(users[0])).toBe('vip');
		expect(userGroups(users[1])).toBe('#20, #21');
		expect(formatMoney(1.2)).toBe('$1.20');
		expect(statusTone('active')).toContain('emerald');
		expect(roleTone('admin')).toContain('primary');
	});

	it('keeps the admin users surface on the existing users API contract', () => {
		expect(usersApiSrc).toContain("const USERS_BASE = '/api/v1/admin/users'");
		expect(usersApiSrc).toContain('toggleUserStatus');
		expect(usersApiSrc).not.toContain("const USERS_BASE = '/admin/users'");
		expect(usersApiSrc).not.toContain("'/api/admin/users'");
		expect(usersApiSrc).not.toContain('"/api/admin/users"');
		expect(usersPageSrc).toContain('data-testid="admin-users-row"');
		expect(usersPageSrc).toContain('VirtualTable');
	});
});
