import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'

/**
 * 自定义错误码（custom_error_codes）配置
 *
 * 从 CreateAccountModal / EditAccountModal 抽取的共享逻辑：两个组件原本各自重复声明
 * 同一套 ref + toggle/add/remove + reset/load/apply（toggle/add 连 429/529 二次确认逻辑
 * 都一字不差）。抽到此处后两边复用、单处维护。
 *
 * toggle/add 依赖 i18n 文案、appStore 通知与 window.confirm，composable 内部自取依赖；
 * 纯状态方法（reset/load/apply）无副作用，便于断言。
 */
export function useCustomErrorCodes() {
  const { t } = useI18n()
  const appStore = useAppStore()

  const customErrorCodesEnabled = ref(false)
  const selectedErrorCodes = ref<number[]>([])
  const customErrorCodeInput = ref<number | null>(null)

  /** 切换某个错误码的选中态；新增 429/529 时弹二次确认 */
  const toggleErrorCode = (code: number): void => {
    const index = selectedErrorCodes.value.indexOf(code)
    if (index === -1) {
      if (code === 429) {
        if (!confirm(t('admin.accounts.customErrorCodes429Warning'))) return
      } else if (code === 529) {
        if (!confirm(t('admin.accounts.customErrorCodes529Warning'))) return
      }
      selectedErrorCodes.value.push(code)
    } else {
      selectedErrorCodes.value.splice(index, 1)
    }
  }

  /** 从手动输入框新增错误码：校验范围 [100,599]、去重、429/529 二次确认 */
  const addCustomErrorCode = (): void => {
    const code = customErrorCodeInput.value
    if (code === null || code < 100 || code > 599) {
      appStore.showError(t('admin.accounts.invalidErrorCode'))
      return
    }
    if (selectedErrorCodes.value.includes(code)) {
      appStore.showInfo(t('admin.accounts.errorCodeExists'))
      return
    }
    if (code === 429) {
      if (!confirm(t('admin.accounts.customErrorCodes429Warning'))) return
    } else if (code === 529) {
      if (!confirm(t('admin.accounts.customErrorCodes529Warning'))) return
    }
    selectedErrorCodes.value.push(code)
    customErrorCodeInput.value = null
  }

  /** 移除某个已选错误码 */
  const removeErrorCode = (code: number): void => {
    const index = selectedErrorCodes.value.indexOf(code)
    if (index !== -1) {
      selectedErrorCodes.value.splice(index, 1)
    }
  }

  /** 重置为默认值（新建表单 / 关闭弹窗） */
  const reset = (): void => {
    customErrorCodesEnabled.value = false
    selectedErrorCodes.value = []
    customErrorCodeInput.value = null
  }

  /** 从账号凭证回填（编辑表单打开时） */
  const loadFromCredentials = (credentials: Record<string, unknown> | null | undefined): void => {
    customErrorCodesEnabled.value = credentials?.custom_error_codes_enabled === true
    const existing = credentials?.custom_error_codes
    selectedErrorCodes.value = Array.isArray(existing) ? [...existing] as number[] : []
  }

  /**
   * 写入提交凭证。
   * - mode='create'：仅在启用时写入字段
   * - mode='edit'：未启用时显式 delete 旧字段
   */
  const applyToCredentials = (
    credentials: Record<string, unknown>,
    mode: 'create' | 'edit' = 'create'
  ): void => {
    if (customErrorCodesEnabled.value) {
      credentials.custom_error_codes_enabled = true
      credentials.custom_error_codes = [...selectedErrorCodes.value]
    } else if (mode === 'edit') {
      delete credentials.custom_error_codes_enabled
      delete credentials.custom_error_codes
    }
  }

  return {
    customErrorCodesEnabled,
    selectedErrorCodes,
    customErrorCodeInput,
    toggleErrorCode,
    addCustomErrorCode,
    removeErrorCode,
    reset,
    loadFromCredentials,
    applyToCredentials,
  }
}
