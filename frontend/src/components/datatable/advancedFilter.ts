/**
 * advancedFilter.ts — 高级筛选类型定义 + 序列化工具
 * 淬钢 QUENCH · DataTable 底座
 *
 * 职责：
 *   1. FilterFieldDef — schema 驱动字段描述符
 *   2. AdvancedFilterValue — 运行时值类型（区间/日期/选择等）
 *   3. serializeFilters / deserializeFilters — 扁平化 query 参数 ↔ 结构化值
 *      区间：{ balance: { min: 5, max: 100 } } ↔ { af_balance_min: '5', af_balance_max: '100' }
 *      日期：{ created_at: { after: '2024-01-01', before: '2024-12-31' } } ↔ { af_created_at_after: '...', af_created_at_before: '...' }
 *      select/text/boolean：{ role: 'admin' } ↔ { af_role: 'admin' }
 */

// ─── 类型定义 ──────────────────────────────────────────────────────────────

/** 筛选字段选项（用于 type='select'） */
export interface FilterFieldOption {
  value: string
  label: string
}

/** 数值区间值 */
export interface NumberRangeValue {
  min?: number | ''
  max?: number | ''
}

/** 日期区间值 */
export interface DateRangeValue {
  after?: string
  before?: string
}

/** 单个字段的运行时值（联合类型） */
export type AdvancedFilterFieldValue =
  | string
  | boolean
  | NumberRangeValue
  | DateRangeValue

/** 所有字段的筛选值集合 */
export type AdvancedFilterValues = Record<string, AdvancedFilterFieldValue>

/**
 * 字段描述符 — 每页组装自己的 fields[]，传给 AdvancedFilter 组件。
 * type 决定渲染控件及序列化策略。
 */
export interface FilterFieldDef {
  /** URL query 参数前缀后的字段 key，如 'balance'、'created_at' */
  key: string
  /** 表头/弹层显示名称（可直接是翻译结果） */
  label: string
  /** 控件类型 */
  type: 'select' | 'text' | 'numberRange' | 'dateRange' | 'boolean'
  /** type='select' 时的选项列表 */
  options?: FilterFieldOption[]
  /** 输入框 placeholder（text / numberRange min / dateRange after） */
  placeholder?: string
  /** numberRange max 输入框 placeholder */
  placeholderMax?: string
}

// ─── URL 序列化前缀 ─────────────────────────────────────────────────────────

/** 高级筛选在 URL query 中的 key 前缀，与 useTableUrlState 的 f_ 前缀隔离 */
export const AF_PREFIX = 'af_'

// ─── 序列化：结构化值 → 扁平 query 参数 ────────────────────────────────────

/**
 * 把 AdvancedFilterValues 序列化成扁平的 URL query 对象。
 * 空值（''、undefined、null、两端都为空的区间）不输出，保持 URL 干净。
 *
 * @example
 * serializeFilters({ balance: { min: 5, max: '' }, role: 'admin' })
 * // => { 'af_balance_min': '5', 'af_role': 'admin' }
 */
export function serializeFilters(
  values: AdvancedFilterValues,
  fields: FilterFieldDef[]
): Record<string, string> {
  const out: Record<string, string> = {}

  for (const field of fields) {
    const val = values[field.key]
    if (val == null) continue

    const pfx = AF_PREFIX + field.key

    if (field.type === 'numberRange') {
      const v = val as NumberRangeValue
      if (v.min !== '' && v.min != null) out[`${pfx}_min`] = String(v.min)
      if (v.max !== '' && v.max != null) out[`${pfx}_max`] = String(v.max)
    } else if (field.type === 'dateRange') {
      const v = val as DateRangeValue
      if (v.after) out[`${pfx}_after`] = v.after
      if (v.before) out[`${pfx}_before`] = v.before
    } else if (field.type === 'boolean') {
      // 只在明确设为 true 或 false 时写入；undefined 不写
      if (typeof val === 'boolean') out[pfx] = val ? '1' : '0'
    } else {
      // select / text
      if (typeof val === 'string' && val !== '') out[pfx] = val
    }
  }

  return out
}

// ─── 反序列化：扁平 query 参数 → 结构化值 ──────────────────────────────────

/**
 * 把 URL query 对象中的 af_ 前缀参数反序列化回 AdvancedFilterValues。
 * query 中与 fields 无关的 key 会被静默忽略。
 *
 * @example
 * deserializeFilters({ 'af_balance_min': '5', 'af_role': 'admin' }, fields)
 * // => { balance: { min: 5, max: '' }, role: 'admin' }
 */
export function deserializeFilters(
  query: Record<string, string | string[] | null | undefined>,
  fields: FilterFieldDef[]
): AdvancedFilterValues {
  const out: AdvancedFilterValues = {}

  for (const field of fields) {
    const pfx = AF_PREFIX + field.key

    if (field.type === 'numberRange') {
      const rawMin = query[`${pfx}_min`]
      const rawMax = query[`${pfx}_max`]
      const min = rawMin != null ? parseFloat(String(rawMin)) : ''
      const max = rawMax != null ? parseFloat(String(rawMax)) : ''
      // 只有至少一端有值时才写入
      if ((typeof min === 'number' && !isNaN(min)) || (typeof max === 'number' && !isNaN(max))) {
        out[field.key] = {
          min: typeof min === 'number' && !isNaN(min) ? min : '',
          max: typeof max === 'number' && !isNaN(max) ? max : '',
        }
      }
    } else if (field.type === 'dateRange') {
      const after = query[`${pfx}_after`]
      const before = query[`${pfx}_before`]
      if (after || before) {
        out[field.key] = {
          after: after ? String(after) : undefined,
          before: before ? String(before) : undefined,
        }
      }
    } else if (field.type === 'boolean') {
      const raw = query[pfx]
      if (raw != null) {
        out[field.key] = String(raw) === '1' || String(raw) === 'true'
      }
    } else {
      // select / text
      const raw = query[pfx]
      if (raw != null && raw !== '') {
        out[field.key] = Array.isArray(raw) ? raw[0] : String(raw)
      }
    }
  }

  return out
}

// ─── 辅助：判断某个字段值是否「有效激活」──────────────────────────────────

/**
 * 判断某个字段值是否算"已激活筛选"（有非空、非空区间的值）。
 * 用于计算活性 chip 数量角标。
 */
export function isFilterActive(val: AdvancedFilterFieldValue | undefined): boolean {
  if (val == null) return false
  if (typeof val === 'string') return val !== ''
  if (typeof val === 'boolean') return true
  if (typeof val === 'object') {
    // numberRange or dateRange
    const v = val as NumberRangeValue & DateRangeValue
    return (
      (v.min !== '' && v.min != null) ||
      (v.max !== '' && v.max != null) ||
      !!v.after ||
      !!v.before
    )
  }
  return false
}

/**
 * 计算当前 values 中激活的筛选条数。
 */
export function countActiveFilters(values: AdvancedFilterValues): number {
  return Object.values(values).filter(isFilterActive).length
}

/**
 * 生成单个字段激活值的人类可读摘要（用于 chip label）。
 */
export function summarizeFilterValue(
  field: FilterFieldDef,
  val: AdvancedFilterFieldValue
): string {
  if (field.type === 'select') {
    const opt = field.options?.find(o => o.value === val)
    return opt ? opt.label : String(val)
  }
  if (field.type === 'boolean') {
    return val ? '✓' : '✗'
  }
  if (field.type === 'numberRange') {
    const v = val as NumberRangeValue
    const hasMin = v.min !== '' && v.min != null
    const hasMax = v.max !== '' && v.max != null
    if (hasMin && hasMax) return `${v.min} – ${v.max}`
    if (hasMin) return `≥ ${v.min}`
    if (hasMax) return `≤ ${v.max}`
    return ''
  }
  if (field.type === 'dateRange') {
    const v = val as DateRangeValue
    if (v.after && v.before) return `${v.after} ~ ${v.before}`
    if (v.after) return `≥ ${v.after}`
    if (v.before) return `≤ ${v.before}`
    return ''
  }
  return String(val)
}
