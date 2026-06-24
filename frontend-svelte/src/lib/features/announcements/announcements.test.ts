import { describe, expect, it } from 'vitest';
import apiSrc from '$lib/api/admin/announcements.ts?raw';
import pageSrc from '../../../routes/admin/announcements/+page.svelte?raw';
import {
	dateTimeLocalToUnix,
	notifyTone,
	parseTargetingJson,
	statusTone,
	summarizeAnnouncements,
	targetingSummary
} from './announcements';
import type { Announcement } from '$lib/api/admin/announcements';

describe('admin announcements helpers', () => {
	it('summarizes rows and formats targeting state', () => {
		const rows: Announcement[] = [
			{ id: 1, title: 'A', content: 'x', status: 'active', notify_mode: 'popup', targeting: { any_of: [] }, created_at: '2026-01-01', updated_at: '2026-01-01' },
			{ id: 2, title: 'B', content: 'x', status: 'draft', notify_mode: 'silent', targeting: { any_of: [{ all_of: [{ type: 'group', operator: 'in', group_ids: [1] }] }] }, created_at: '2026-01-01', updated_at: '2026-01-01' }
		];
		expect(summarizeAnnouncements(rows)).toEqual([
			{ label: 'Total', value: 2 },
			{ label: 'Active', value: 1 },
			{ label: 'Draft', value: 1 },
			{ label: 'Popup', value: 1 }
		]);
		expect(targetingSummary(rows[0].targeting)).toBe('All users');
		expect(targetingSummary(rows[1].targeting)).toBe('1 group / 1 condition');
		expect(statusTone('active')).toContain('emerald');
		expect(notifyTone('popup')).toContain('amber');
	});

	it('parses targeting JSON and converts datetime-local values', () => {
		expect(parseTargetingJson('')).toEqual({ any_of: [] });
		expect(parseTargetingJson('{"any_of":[{"all_of":[]}]}')).toEqual({ any_of: [{ all_of: [] }] });
		expect(dateTimeLocalToUnix('')).toBeUndefined();
		expect(dateTimeLocalToUnix('2026-01-01T00:00')).toBeGreaterThan(0);
	});

	it('keeps the page on the existing admin announcement API contract', () => {
		expect(apiSrc).toContain("const ANNOUNCEMENTS_BASE = '/api/v1/admin/announcements'");
		expect(apiSrc).not.toContain("const ANNOUNCEMENTS_BASE = '/admin/announcements'");
		expect(apiSrc).toContain('listAnnouncementReadStatus');
		expect(pageSrc).toContain('data-testid="admin-announcements-row"');
		expect(pageSrc).toContain('VirtualTable');
	});
});
