import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { createStableObjectKeyResolver } from '@/utils/stableObjectKey'

/**
 * 临时不可调度规则（temp_unschedulable_rules）配置
 *
 * 从 CreateAccountModal / EditAccountModal 抽取的共享逻辑：两个组件原本各自重复声明
 * 同一套 ref + presets + add/remove/move/build/apply + split/format/toPositiveNumber
 * （Edit 多一个 load 回填）。抽到此处后两边复用、单处维护。
 *
 * keyPrefix 用于 createStableObjectKeyResolver，两个组件传不同前缀
 * （'create-temp-unsched-rule' / 'edit-temp-unsched-rule'）以隔离拖拽 key 空间。
 */

export interface TempUnschedRuleForm {
  error_code: number | null
  keywords: string
  duration_minutes: number | null
  description: string
}

/** 关键词字符串 → 去空、按 , ; 切分的数组 */
const splitKeywords = (value: string): string[] =>
  value
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

/** 后端返回的关键词（数组或字符串）→ 回填到输入框的逗号分隔字符串 */
const formatKeywords = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .join(', ')
  }
  if (typeof value === 'string') return value
  return ''
}

/** 任意值 → 正整数或 null（回填 error_code / duration） */
const toPositiveNumber = (value: unknown): number | null => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return null
  return Math.trunc(num)
}

export function useTempUnschedRules(keyPrefix: string) {
  const { t } = useI18n()
  const appStore = useAppStore()

  const tempUnschedEnabled = ref(false)
  const tempUnschedRules = ref<TempUnschedRuleForm[]>([])
  const getTempUnschedRuleKey = createStableObjectKeyResolver<TempUnschedRuleForm>(keyPrefix)

  const tempUnschedPresets = computed(() => [
    {
      label: t('admin.accounts.tempUnschedulable.presets.overloadLabel'),
      rule: {
        error_code: 529,
        keywords: 'overloaded, too many',
        duration_minutes: 60,
        description: t('admin.accounts.tempUnschedulable.presets.overloadDesc')
      }
    },
    {
      label: t('admin.accounts.tempUnschedulable.presets.rateLimitLabel'),
      rule: {
        error_code: 429,
        keywords: 'rate limit, too many requests',
        duration_minutes: 10,
        description: t('admin.accounts.tempUnschedulable.presets.rateLimitDesc')
      }
    },
    {
      label: t('admin.accounts.tempUnschedulable.presets.unavailableLabel'),
      rule: {
        error_code: 503,
        keywords: 'unavailable, maintenance',
        duration_minutes: 30,
        description: t('admin.accounts.tempUnschedulable.presets.unavailableDesc')
      }
    }
  ])

  /** 追加一条规则；带 preset 则克隆，否则插入默认空白规则 */
  const addTempUnschedRule = (preset?: TempUnschedRuleForm): void => {
    if (preset) {
      tempUnschedRules.value.push({ ...preset })
      return
    }
    tempUnschedRules.value.push({
      error_code: null,
      keywords: '',
      duration_minutes: 30,
      description: ''
    })
  }

  const removeTempUnschedRule = (index: number): void => {
    tempUnschedRules.value.splice(index, 1)
  }

  /** 上移/下移一条规则（direction = -1 / +1） */
  const moveTempUnschedRule = (index: number, direction: number): void => {
    const target = index + direction
    if (target < 0 || target >= tempUnschedRules.value.length) return
    const rules = tempUnschedRules.value
    const current = rules[index]
    rules[index] = rules[target]
    rules[target] = current
  }

  /** 表单规则 → 提交 payload（过滤掉非法 error_code/duration/空关键词） */
  const buildTempUnschedRules = (rules: TempUnschedRuleForm[]) => {
    const out: Array<{
      error_code: number
      keywords: string[]
      duration_minutes: number
      description: string
    }> = []

    for (const rule of rules) {
      const errorCode = Number(rule.error_code)
      const duration = Number(rule.duration_minutes)
      const keywords = splitKeywords(rule.keywords)
      if (!Number.isFinite(errorCode) || errorCode < 100 || errorCode > 599) {
        continue
      }
      if (!Number.isFinite(duration) || duration <= 0) {
        continue
      }
      if (keywords.length === 0) {
        continue
      }
      out.push({
        error_code: Math.trunc(errorCode),
        keywords,
        duration_minutes: Math.trunc(duration),
        description: rule.description.trim()
      })
    }

    return out
  }

  /**
   * 写入提交凭证，返回是否通过校验。
   * - 未启用：删除字段，返回 true
   * - 启用但无有效规则：showError，返回 false（调用方据此中止提交）
   * - 启用且有效：写入字段，返回 true
   */
  const applyToCredentials = (credentials: Record<string, unknown>): boolean => {
    if (!tempUnschedEnabled.value) {
      delete credentials.temp_unschedulable_enabled
      delete credentials.temp_unschedulable_rules
      return true
    }

    const rules = buildTempUnschedRules(tempUnschedRules.value)
    if (rules.length === 0) {
      appStore.showError(t('admin.accounts.tempUnschedulable.rulesInvalid'))
      return false
    }

    credentials.temp_unschedulable_enabled = true
    credentials.temp_unschedulable_rules = rules
    return true
  }

  /** 重置为默认值（新建表单 / 关闭弹窗） */
  const reset = (): void => {
    tempUnschedEnabled.value = false
    tempUnschedRules.value = []
  }

  /** 从账号凭证回填（编辑表单打开时） */
  const loadFromCredentials = (credentials?: Record<string, unknown>): void => {
    tempUnschedEnabled.value = credentials?.temp_unschedulable_enabled === true
    const rawRules = credentials?.temp_unschedulable_rules
    if (!Array.isArray(rawRules)) {
      tempUnschedRules.value = []
      return
    }

    tempUnschedRules.value = rawRules.map((rule) => {
      const entry = rule as Record<string, unknown>
      return {
        error_code: toPositiveNumber(entry.error_code),
        keywords: formatKeywords(entry.keywords),
        duration_minutes: toPositiveNumber(entry.duration_minutes),
        description: typeof entry.description === 'string' ? entry.description : ''
      }
    })
  }

  return {
    tempUnschedEnabled,
    tempUnschedRules,
    getTempUnschedRuleKey,
    tempUnschedPresets,
    addTempUnschedRule,
    removeTempUnschedRule,
    moveTempUnschedRule,
    buildTempUnschedRules,
    applyToCredentials,
    reset,
    loadFromCredentials,
  }
}
