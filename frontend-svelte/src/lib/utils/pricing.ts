/**
 * Pricing 工具函数（POC 5）
 *
 * 纯函数，无外部依赖 —— 1:1 port 自 Vue tree
 * `frontend/src/views/admin/monetization/pricing/PricingModelListView.vue` 与
 * `ProviderVerifyDrawer.vue` 的 script section。改一行需同步检查 Vue 侧防漂移。
 *
 * 业务语义：
 *   - extractProvider(id): 从 OpenRouter slug "owner/model-name" 抽 owner
 *   - prettifyProvider(raw): 将 'x-ai' / 'z-ai' 美化为 'X AI' / 'Z AI'
 *   - fmtPriceMTok(perToken): per-token USD → per-MTok 美元字符串（digits 自适应）
 *   - fmtCtx(n): context window 数字 → "1.0M" / "128K"
 *   - sourceLabel(src): 'openrouter' → 'Openrouter'，'override' → 'Override'
 *   - lastSyncedText(isoStr, now, t): RFC3339 → 相对时间（justNow/minutesAgo/...）
 *   - MAINSTREAM_PROVIDER_WHITELIST: 主流 provider tag + aliases，**声明顺序**渲染
 */

export const ALL_SENTINEL = '__all__';

export interface MainstreamProviderEntry {
	tag: string;
	aliases: ReadonlyArray<string>;
}

/**
 * 主流 provider 白名单 —— pill 渲染顺序按声明顺序，不按 count desc。
 * aliases 用于把 OpenRouter 不同时期 slug 前缀映射到同一 pill。
 */
export const MAINSTREAM_PROVIDER_WHITELIST: ReadonlyArray<MainstreamProviderEntry> = [
	{ tag: 'anthropic', aliases: ['anthropic'] },
	{ tag: 'openai', aliases: ['openai'] },
	{ tag: 'google', aliases: ['google', 'google-vertex'] },
	{ tag: 'x-ai', aliases: ['x-ai', 'xai'] },
	{ tag: 'deepseek', aliases: ['deepseek'] },
	{ tag: 'qwen', aliases: ['qwen', 'alibaba', 'tongyi'] },
	{ tag: 'z-ai', aliases: ['z-ai', 'zhipu', 'zhipuai', 'glm'] },
	{ tag: 'minimax', aliases: ['minimax'] },
	{ tag: 'moonshotai', aliases: ['moonshotai', 'moonshot'] }
];

/** drawer 中渲染的 capability 白名单 —— 与 Vue 一致 */
export const SHOW_CAPS = ['reasoning', 'tools', 'structured_outputs', 'vision', 'image-generation'];

export const CAP_LABELS: Record<string, string> = {
	reasoning: 'Reasoning',
	tools: 'Tool Use',
	structured_outputs: 'Structured Out',
	vision: 'Vision',
	'image-generation': 'Image Gen'
};

export function extractProvider(id: string): string {
	const idx = id.indexOf('/');
	return idx > 0 ? id.slice(0, idx) : '';
}

export function prettifyProvider(raw: string): string {
	if (!raw) return raw;
	return raw
		.split(/[-_]/)
		.map((part) => {
			if (!part) return part;
			if (part.length <= 3 && /^[a-z]+$/i.test(part)) return part.toUpperCase();
			return part.charAt(0).toUpperCase() + part.slice(1);
		})
		.join(' ');
}

/**
 * per-token USD → per-MTok 美元字符串。
 * digits 规则（与 Vue 一致）：
 *   - perM >= 1   → 2 位
 *   - perM >= 0.01 → 3 位
 *   - 否则         → 4 位
 * 非数 / 非正数 → "—"
 */
export function fmtPriceMTok(perToken: number | undefined | null): string {
	if (perToken == null || !Number.isFinite(perToken) || perToken <= 0) return '—';
	const perM = perToken * 1e6;
	let digits = 2;
	if (perM < 0.01) digits = 4;
	else if (perM < 1) digits = 3;
	return `$${perM.toFixed(digits)}`;
}

export function fmtCtx(ctx: number | undefined | null): string {
	if (ctx == null || ctx <= 0) return '—';
	if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(1)}M`;
	if (ctx >= 1_000) return `${(ctx / 1_000).toFixed(0)}K`;
	return String(ctx);
}

export function sourceLabel(source: string | undefined | null): string {
	const s = (source || '').trim();
	if (!s) return '—';
	return s
		.split(/[-/_]/)
		.map((part) => {
			if (!part) return part;
			if (part.length <= 3 && /^[a-z]+$/.test(part)) return part.toUpperCase();
			return part.charAt(0).toUpperCase() + part.slice(1);
		})
		.join(' ');
}

export function fmtUptime(u: number | undefined | null): string {
	if (u == null || !Number.isFinite(u)) return '—';
	// backend 返回 0..1，UI 显示百分比；与 Vue 一致取一位小数
	const pct = u <= 1 ? u * 100 : u;
	return `${pct.toFixed(1)}%`;
}

/** 颜色等级：>=95% green / <95% warn / null muted */
export function uptimeColor(u: number | undefined | null): 'ok' | 'warn' | 'muted' {
	if (u == null || !Number.isFinite(u)) return 'muted';
	const pct = u <= 1 ? u * 100 : u;
	return pct >= 95 ? 'ok' : 'warn';
}

/**
 * RFC3339 时间字符串 → 相对时间描述。
 * t(key, params) 由调用方传入，注入 i18n —— 保持本工具纯。
 */
export function lastSyncedText(
	iso: string | null | undefined,
	now: number,
	t: (key: string, params?: Record<string, unknown>) => string,
	keyPrefix = 'admin.pricingList'
): string | null {
	if (!iso) return null;
	const ts = Date.parse(iso);
	if (Number.isNaN(ts)) return null;
	const diffMs = now - ts;
	if (diffMs < 0) return formatAbs(ts);
	const min = Math.floor(diffMs / 60_000);
	if (min < 1) return t(`${keyPrefix}.justNow`);
	if (min < 60) return t(`${keyPrefix}.minutesAgo`, { n: min });
	const hr = Math.floor(min / 60);
	if (hr < 24) return t(`${keyPrefix}.hoursAgo`, { n: hr });
	const day = Math.floor(hr / 24);
	if (day < 30) return t(`${keyPrefix}.daysAgo`, { n: day });
	return formatAbs(ts);
}

function formatAbs(ts: number): string {
	try {
		return new Date(ts).toLocaleDateString();
	} catch {
		return '';
	}
}

/**
 * Channel model-pricing 单位换算 —— backend 存 per-token，UI 显示 $/MTok。
 * 1:1 port 自 Vue `frontend/src/components/admin/channel/types.ts`，改一行需同步检查。
 *
 * toPrecision(10) 杀浮点误差：5e-8 * 1e6 必须 round 成 0.05；3e-6 round-trip 稳定。
 * 注意：per_request_price 是定额费，绝不换算——调用方对该字段直接传 raw。
 */
export const MTOK = 1_000_000;

function toNullableNumber(val: number | string | null | undefined): number | null {
	if (val === null || val === undefined) return null;
	if (typeof val === 'number') return Number.isFinite(val) ? val : null;
	const trimmed = val.trim();
	if (!trimmed) return null;
	const n = Number(trimmed);
	return Number.isFinite(n) ? n : null;
}

/** SAVE: 表单 $/MTok 值 → backend per-token。null 透传。 */
export function mTokToPerToken(val: number | string | null | undefined): number | null {
	const n = toNullableNumber(val);
	return n === null ? null : parseFloat((n / MTOK).toPrecision(10));
}

/** LOAD: backend per-token → 表单 $/MTok 值。null 透传。 */
export function perTokenToMTok(val: number | null | undefined): number | null {
	if (val == null) return null;
	return parseFloat((val * MTOK).toPrecision(10));
}
