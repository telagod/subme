import type {
	ContentModerationAPIKeyStatus,
	ContentModerationConfig,
	ContentModerationLog,
	ContentModerationRuntimeStatus,
	ContentModerationTestAuditResult,
	ModerationMode
} from '$lib/api/admin/riskControl';

export const PAGE_SIZE = 20;
export const RESULT_ALL = '__all__';
export const AUTO_REFRESH_MS = 15_000;

export type SettingsTab = 'basic' | 'scope' | 'runtime' | 'response' | 'riskThresholds' | 'keywords' | 'retention';

export const SETTINGS_TABS: Array<{ id: SettingsTab; label: string }> = [
	{ id: 'basic', label: 'Basic' },
	{ id: 'scope', label: 'Scope' },
	{ id: 'runtime', label: 'Runtime' },
	{ id: 'response', label: 'Response' },
	{ id: 'riskThresholds', label: 'Thresholds' },
	{ id: 'keywords', label: 'Keywords' },
	{ id: 'retention', label: 'Retention' }
];

export const RISK_THRESHOLD_DEFAULTS: Record<string, number> = {
	harassment: 98,
	'harassment/threatening': 90,
	hate: 65,
	'hate/threatening': 65,
	illicit: 95,
	'illicit/violent': 95,
	'self-harm': 65,
	'self-harm/intent': 85,
	'self-harm/instructions': 65,
	sexual: 65,
	'sexual/minors': 65,
	violence: 95,
	'violence/graphic': 95
};
export const RISK_THRESHOLD_CATEGORIES = Object.keys(RISK_THRESHOLD_DEFAULTS);

export const ENDPOINT_OPTIONS = [
	{ value: '', label: 'All endpoints' },
	{ value: '/v1/messages', label: '/v1/messages' },
	{ value: '/v1/responses', label: '/v1/responses' },
	{ value: '/v1/chat/completions', label: '/v1/chat/completions' },
	{ value: '/v1beta/models', label: '/v1beta/models' },
	{ value: '/v1/images/generations', label: '/v1/images/generations' },
	{ value: '/v1/images/edits', label: '/v1/images/edits' }
];

export const DEFAULT_CONFIG: ContentModerationConfig = {
	enabled: false,
	mode: 'pre_block',
	base_url: 'https://api.openai.com',
	model: 'omni-moderation-latest',
	api_key_configured: false,
	api_key_masked: '',
	api_key_count: 0,
	api_key_masks: [],
	api_key_statuses: [],
	timeout_ms: 3000,
	sample_rate: 100,
	all_groups: true,
	group_ids: [],
	record_non_hits: false,
	thresholds: {},
	worker_count: 4,
	queue_size: 32768,
	block_status: 403,
	block_message: 'Content moderation blocked this request.',
	email_on_hit: true,
	auto_ban_enabled: true,
	ban_threshold: 10,
	violation_window_hours: 720,
	retry_count: 2,
	hit_retention_days: 180,
	non_hit_retention_days: 3,
	pre_hash_check_enabled: false,
	blocked_keywords: [],
	keyword_blocking_mode: 'keyword_and_api',
	model_filter: { type: 'all', models: [] }
};

export function cloneConfig(config: ContentModerationConfig | null): ContentModerationConfig {
	return {
		...DEFAULT_CONFIG,
		...(config ?? {}),
		api_key_masks: [...(config?.api_key_masks ?? [])],
		api_key_statuses: [...(config?.api_key_statuses ?? [])],
		group_ids: [...(config?.group_ids ?? [])],
		thresholds: { ...(config?.thresholds ?? {}) },
		blocked_keywords: [...(config?.blocked_keywords ?? [])],
		model_filter: {
			type: config?.model_filter?.type ?? DEFAULT_CONFIG.model_filter.type,
			models: [...(config?.model_filter?.models ?? [])]
		}
	};
}

export function parseLines(value: string): string[] {
	return value
		.split(/[\n,]/)
		.map((item) => item.trim())
		.filter(Boolean);
}

export function modeLabel(mode: ModerationMode | string): string {
	switch (mode) {
		case 'pre_block':
			return 'Pre-block';
		case 'observe':
			return 'Observe';
		case 'off':
			return 'Off';
		default:
			return mode || '—';
	}
}

export function runtimeEnabled(config: ContentModerationConfig, status: ContentModerationRuntimeStatus | null): boolean {
	return Boolean(status?.risk_control_enabled && config.enabled && config.mode !== 'off');
}

export function summarizeRisk(config: ContentModerationConfig, status: ContentModerationRuntimeStatus | null, logTotal: number) {
	return [
		{
			label: 'Status',
			value: config.enabled ? 'Enabled' : 'Disabled',
			meta: `${modeLabel(config.mode)} · ${runtimeEnabled(config, status) ? 'runtime on' : 'runtime off'}`
		},
		{
			label: 'API keys',
			value: config.api_key_configured ? String(config.api_key_count || config.api_key_masks.length || 1) : '0',
			meta: apiKeyHealthSummary(status?.api_key_statuses ?? config.api_key_statuses)
		},
		{
			label: 'Queue',
			value: `${Math.round(Number(status?.queue_usage_percent ?? 0) * 10) / 10}%`,
			meta: `${formatNumber(status?.queue_length)} / ${formatNumber(status?.queue_size)}`
		},
		{
			label: 'Logs',
			value: formatNumber(logTotal),
			meta: `${formatNumber(status?.flagged_hash_count)} flagged hashes`
		}
	];
}

export function apiKeyHealthSummary(rows: ContentModerationAPIKeyStatus[]): string {
	if (!rows.length) return 'unknown';
	const counts = rows.reduce<Record<string, number>>((acc, row) => {
		acc[row.status] = (acc[row.status] ?? 0) + 1;
		return acc;
	}, {});
	return Object.entries(counts).map(([status, count]) => `${status} ${count}`).join(' · ');
}

export function resultLabel(row: ContentModerationLog): string {
	if (row.action === 'keyword_block') return 'Keyword block';
	if (row.action === 'block') return 'Blocked';
	if (row.action === 'error' || row.error) return 'Error';
	if (row.flagged) return 'Hit';
	return 'Pass';
}

export function resultTone(row: ContentModerationLog): string {
	if (row.action === 'block' || row.action === 'keyword_block' || row.flagged) {
		return 'border-destructive/30 bg-destructive/10 text-destructive';
	}
	if (row.action === 'error' || row.error) {
		return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
	}
	return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
}

export function statusTone(status: string): string {
	switch (status) {
		case 'ok':
			return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
		case 'error':
		case 'frozen':
			return 'border-destructive/30 bg-destructive/10 text-destructive';
		default:
			return 'border-border bg-background text-muted-foreground';
	}
}

export function auditResultSummary(result: ContentModerationTestAuditResult | null): string {
	if (!result) return 'No audit result';
	return `${result.flagged ? 'Flagged' : 'Passed'} · ${result.highest_category || 'unknown'} ${formatPercent(result.highest_score)}`;
}

export function formatPercent(value?: number | null): string {
	if (!Number.isFinite(value ?? Number.NaN)) return '0%';
	return `${Math.round((value as number) * 100) / 100}%`;
}

export function formatNumber(value?: number | null): string {
	if (!Number.isFinite(value ?? Number.NaN)) return '0';
	return new Intl.NumberFormat().format(value as number);
}

export function formatDateTime(value?: string | null): string {
	if (!value) return '—';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString();
}

export function isValidHash(value: string): boolean {
	return /^[a-fA-F0-9]{64}$/.test(value.trim());
}

export function clampPercent(value: unknown): number {
	const n = Number(value);
	if (!Number.isFinite(n)) return 0;
	return Math.min(100, Math.max(0, n));
}

export function formatThresholdPercent(value: number): string {
	return `${clampPercent(value).toFixed(1)}%`;
}

export function thresholdsFromConfig(raw: Record<string, number> | null | undefined): Record<string, number> {
	const out: Record<string, number> = { ...RISK_THRESHOLD_DEFAULTS };
	for (const cat of RISK_THRESHOLD_CATEGORIES) {
		const v = raw?.[cat];
		if (Number.isFinite(v)) out[cat] = clampPercent(Number(v) * 100);
	}
	return out;
}

export function thresholdsToPayload(local: Record<string, number>): Record<string, number> {
	const out: Record<string, number> = {};
	for (const cat of RISK_THRESHOLD_CATEGORIES) {
		out[cat] = Number((clampPercent(local[cat]) / 100).toFixed(4));
	}
	return out;
}

export function modelFilterSummary(type: string, count: number): string {
	if (type === 'include') return `Include ${count} model${count === 1 ? '' : 's'}`;
	if (type === 'exclude') return `Exclude ${count} model${count === 1 ? '' : 's'}`;
	return 'All models';
}
