import { apiClient } from '../client';
import { buildQuery, getPaginated, type PaginatedResponse } from './supply';

export type AnnouncementStatus = 'draft' | 'active' | 'archived';
export type AnnouncementNotifyMode = 'silent' | 'popup';
export type AnnouncementConditionType = 'group' | 'balance' | 'subscription' | string;
export type AnnouncementOperator = 'in' | 'not_in' | 'gte' | 'lte' | 'eq' | string;

export interface AnnouncementCondition {
	type: AnnouncementConditionType;
	operator: AnnouncementOperator;
	group_ids?: number[];
	value?: number;
}

export interface AnnouncementConditionGroup {
	all_of?: AnnouncementCondition[];
}

export interface AnnouncementTargeting {
	any_of?: AnnouncementConditionGroup[];
}

export interface Announcement {
	id: number;
	title: string;
	content: string;
	status: AnnouncementStatus;
	notify_mode: AnnouncementNotifyMode;
	targeting: AnnouncementTargeting;
	starts_at?: string | null;
	ends_at?: string | null;
	created_at: string;
	updated_at: string;
}

export interface AnnouncementUserReadStatus {
	user_id: number;
	email: string;
	username: string;
	balance: number;
	eligible: boolean;
	read_at?: string | null;
}

export interface AnnouncementFilters {
	status?: string;
	search?: string;
	sort_by?: string;
	sort_order?: 'asc' | 'desc';
}

export interface CreateAnnouncementRequest {
	title: string;
	content: string;
	status?: AnnouncementStatus;
	notify_mode?: AnnouncementNotifyMode;
	targeting: AnnouncementTargeting;
	starts_at?: number;
	ends_at?: number;
}

export interface UpdateAnnouncementRequest {
	title?: string;
	content?: string;
	status?: AnnouncementStatus;
	notify_mode?: AnnouncementNotifyMode;
	targeting?: AnnouncementTargeting;
	starts_at?: number;
	ends_at?: number;
}

const ANNOUNCEMENTS_BASE = '/api/v1/admin/announcements';

export async function listAnnouncements(
	page = 1,
	pageSize = 20,
	filters: AnnouncementFilters = {}
): Promise<PaginatedResponse<Announcement>> {
	return getPaginated<Announcement>(
		`${ANNOUNCEMENTS_BASE}${buildQuery({ page, page_size: pageSize, ...filters })}`
	);
}

export function getAnnouncement(id: number): Promise<Announcement> {
	return apiClient.get<Announcement>(`${ANNOUNCEMENTS_BASE}/${id}`);
}

export function createAnnouncement(payload: CreateAnnouncementRequest): Promise<Announcement> {
	return apiClient.post<Announcement>(ANNOUNCEMENTS_BASE, payload);
}

export function updateAnnouncement(
	id: number,
	payload: UpdateAnnouncementRequest
): Promise<Announcement> {
	return apiClient.put<Announcement>(`${ANNOUNCEMENTS_BASE}/${id}`, payload);
}

export function deleteAnnouncement(id: number): Promise<{ message: string }> {
	return apiClient.delete<{ message: string }>(`${ANNOUNCEMENTS_BASE}/${id}`);
}

export function listAnnouncementReadStatus(
	id: number,
	page = 1,
	pageSize = 20,
	filters: { search?: string; sort_by?: string; sort_order?: 'asc' | 'desc' } = {}
): Promise<PaginatedResponse<AnnouncementUserReadStatus>> {
	return getPaginated<AnnouncementUserReadStatus>(
		`${ANNOUNCEMENTS_BASE}/${id}/read-status${buildQuery({ page, page_size: pageSize, ...filters })}`
	);
}

export const adminAnnouncementsApi = {
	listAnnouncements,
	getAnnouncement,
	createAnnouncement,
	updateAnnouncement,
	deleteAnnouncement,
	listAnnouncementReadStatus
};
