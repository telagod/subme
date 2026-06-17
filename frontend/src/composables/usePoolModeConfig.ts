import { ref } from 'vue'

/**
 * Pool Mode（账号池化重试）配置
 *
 * 从 CreateAccountModal / EditAccountModal 抽取的共享逻辑。
 * 两个组件原本各自重复声明同一套常量 + ref + parse/format/normalize +
 * reset/load/apply（连文件内部都重复两遍），抽到此处后两边复用、单处维护。
 *
 * 纯函数单独 export，便于在 __tests__ 中直接断言边界行为。
 */

export const DEFAULT_POOL_MODE_RETRY_COUNT = 3
export const MAX_POOL_MODE_RETRY_COUNT = 10
export const DEFAULT_POOL_MODE_RETRY_STATUS_CODES = [401, 403, 429]

/** 解析用户输入的重试状态码字符串 → 去重、升序、限定 [100,599] 的整数数组 */
export function parsePoolModeRetryStatusCodes(input: string): number[] {
  if (!input || !input.trim()) return []
  const seen = new Set<number>()
  const out: number[] = []
  for (const token of input.split(/[,\s]+/)) {
    const trimmed = token.trim()
    if (!trimmed) continue
    const n = Number(trimmed)
    if (!Number.isFinite(n) || !Number.isInteger(n)) continue
    if (n < 100 || n > 599) continue
    if (seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out.sort((a, b) => a - b)
}

/** 后端返回的状态码数组 → 回填到输入框的显示字符串 */
export function formatPoolModeRetryStatusCodes(value: unknown): string {
  if (!Array.isArray(value)) return ''
  const out: number[] = []
  const seen = new Set<number>()
  for (const v of value) {
    const n = typeof v === 'string' ? Number(v.trim()) : Number(v)
    if (!Number.isFinite(n) || !Number.isInteger(n)) continue
    if (n < 100 || n > 599) continue
    if (seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out.sort((a, b) => a - b).join(', ')
}

/** 重试次数归一化：截断为整数并 clamp 到 [0, MAX] */
export function normalizePoolModeRetryCount(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_POOL_MODE_RETRY_COUNT
  const normalized = Math.trunc(value)
  if (normalized < 0) return 0
  if (normalized > MAX_POOL_MODE_RETRY_COUNT) return MAX_POOL_MODE_RETRY_COUNT
  return normalized
}

export function usePoolModeConfig() {
  const poolModeEnabled = ref(false)
  const poolModeRetryCount = ref(DEFAULT_POOL_MODE_RETRY_COUNT)
  const poolModeRetryStatusCodesInput = ref('')

  /** 重置为默认值（新建表单 / 关闭弹窗） */
  function reset(): void {
    poolModeEnabled.value = false
    poolModeRetryCount.value = DEFAULT_POOL_MODE_RETRY_COUNT
    poolModeRetryStatusCodesInput.value = ''
  }

  /** 从账号凭证回填（编辑表单打开时） */
  function loadFromCredentials(credentials: Record<string, unknown> | null | undefined): void {
    poolModeEnabled.value = credentials?.pool_mode === true
    poolModeRetryCount.value = normalizePoolModeRetryCount(
      Number(credentials?.pool_mode_retry_count ?? DEFAULT_POOL_MODE_RETRY_COUNT)
    )
    poolModeRetryStatusCodesInput.value = formatPoolModeRetryStatusCodes(
      credentials?.pool_mode_retry_status_codes
    )
  }

  /**
   * 写入提交凭证。
   * - mode='create'：仅在启用时写入字段（新对象，无需清理）
   * - mode='edit'：未启用 / 状态码为空时显式 delete 旧字段
   */
  function applyToCredentials(
    credentials: Record<string, unknown>,
    mode: 'create' | 'edit' = 'create'
  ): void {
    if (poolModeEnabled.value) {
      credentials.pool_mode = true
      credentials.pool_mode_retry_count = normalizePoolModeRetryCount(poolModeRetryCount.value)
      const parsed = parsePoolModeRetryStatusCodes(poolModeRetryStatusCodesInput.value)
      if (parsed.length > 0) {
        credentials.pool_mode_retry_status_codes = parsed
      } else if (mode === 'edit') {
        delete credentials.pool_mode_retry_status_codes
      }
    } else if (mode === 'edit') {
      delete credentials.pool_mode
      delete credentials.pool_mode_retry_count
      delete credentials.pool_mode_retry_status_codes
    }
  }

  return {
    poolModeEnabled,
    poolModeRetryCount,
    poolModeRetryStatusCodesInput,
    reset,
    loadFromCredentials,
    applyToCredentials,
  }
}
