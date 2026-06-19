/**
 * Settings Registry · 类型契约（POC 4）
 *
 * 与 Vue tree (frontend/src/views/admin/settings-registry/types.ts) 同构，
 * 但精简到 SUBME 自定义路线所需的最小集合。后续 M10 全量铺开时再回填字段。
 *
 * 设计要点：
 *   - 字段值统一走 flat key（与后端 SystemSettings / UpdateSettingsRequest 拍齐）。
 *   - Section 支持两种模式：fields 网格 + special escape hatch（如 SMTP 测试按钮）。
 *   - select 选项 value **禁止空字符串**（reka-ui / bits-ui 历史教训：见 ~/.claude
 *     memory reshadcn-migration），需使用 'all' / 'none' / '__unset__' 等显式哨兵。
 *
 * 哨兵语义（运行时由 FieldRenderer + buildZodSchema 双重把关）：
 *   - 'all'      —— 查询过滤场景的"全部"
 *   - 'none'     —— 显式置空（区别于"未设置"）
 *   - '__unset__' —— "未设置"，patch 时该字段会被剔出 payload
 */

/** 字段渲染类型 —— 与 SectionRenderer 的 dispatch 分支严格对齐。 */
export type FieldType =
	| 'text'
	| 'password'
	| 'number'
	| 'switch'
	| 'checkbox'
	| 'textarea'
	| 'select'
	| 'image'
	| 'json';

/** select 字段的选项 —— value 不能为空字符串。 */
export interface SelectOption {
	value: string;
	labelKey: string;
}

/** 单字段定义。 */
export interface Field {
	/** 后端 flat key，例如 'smtp_host'。 */
	key: string;
	type: FieldType;
	/** i18n key；FieldRenderer 优先 $_(labelKey)，未命中时回落到 key 本身。 */
	labelKey: string;
	/** 可选描述/帮助文案（同上 i18n key 语义）。 */
	descriptionKey?: string;
	required?: boolean;
	defaultValue?: unknown;
	/** 仅 type='select' 用；其余类型应忽略。 */
	options?: SelectOption[];
	placeholder?: string;
	/** number 字段的边界；前端只做最小校验，最终以后端为准。 */
	min?: number;
	max?: number;
	/** sensitive=true 触发 *_configured 占位策略（密码已配置时的提示）。 */
	sensitive?: boolean;
	/**
	 * 条件渲染谓词 —— Vue tree showWhen 同语义。
	 * 返回 false 时整个 field 不出现（FieldRenderer 自身判定）。
	 * 注意：与 Vue 不同的是不持有引用 —— 序列化场景慎用。
	 */
	showWhen?: (values: Record<string, unknown>) => boolean;
}

/** 单 Section 定义。fields 与 special 至少一个非空。 */
export interface SectionDef {
	/** 唯一 id，例如 'email.smtp'；同时作为 vitest 选择器目标。 */
	id: string;
	titleKey: string;
	descriptionKey?: string;
	/** 常规字段网格。fields 与 special 二选一；special 出现时 fields 可省略。 */
	fields?: Field[];
	/**
	 * Escape hatch：指明该 section 由特定 special 组件接管。
	 * 当前注册：'smtp' | 'test-email' | 'admin-api-key' | 'email-suffix-whitelist'
	 * | 'custom-menu' | 'dingtalk-connect' | 'oidc-connect' | 'wechat-connect'.
	 * 未知 special 值由 SectionRenderer 兜底告警。
	 */
	special?:
		| 'smtp'
		| 'test-email'
		| 'admin-api-key'
		| 'email-suffix-whitelist'
		| 'custom-menu'
		| 'dingtalk-connect'
		| 'oidc-connect'
		| 'wechat-connect'
		| 'user-defaults'
		| 'auth-source-defaults'
		| 'affiliate-custom-users'
		| 'overload-cooldown'
		| 'rate-limit-429'
		| 'payment-provider-list'
		| 'login-agreement-documents'
		| 'backup'
		| 'quota-notify'
		| 'stream-timeout'
		| 'rectifier'
		| 'beta-policy'
		| 'openai-fast-policy'
		| 'web-search-emulation'
		| string;
}

/** 顶层 schema —— 即一组 SectionDef。 */
export type SettingsSchema = SectionDef[];

/** 哨兵常量 —— 仅供生产代码 import，避免散落各处魔法字符串。 */
export const SELECT_SENTINEL_ALL = 'all' as const;
export const SELECT_SENTINEL_NONE = 'none' as const;
export const SELECT_SENTINEL_UNSET = '__unset__' as const;
