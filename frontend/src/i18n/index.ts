import { createI18n } from 'vue-i18n'

type LocaleCode = 'en' | 'zh'

type LocaleMessages = Record<string, any>

const LOCALE_KEY = 'sub2api_locale'
const DEFAULT_LOCALE: LocaleCode = 'en'

const localeLoaders: Record<LocaleCode, () => Promise<{ default: LocaleMessages }>> = {
  en: () => import('./locales/en'),
  zh: () => import('./locales/zh')
}

function isLocaleCode(value: string): value is LocaleCode {
  return value === 'en' || value === 'zh'
}

function getDefaultLocale(): LocaleCode {
  // SSR-safe guard: 服务端无 window/navigator,直接返回兜底,避免 createI18n 阶段崩溃
  if (typeof window === 'undefined') {
    return DEFAULT_LOCALE
  }

  try {
    const saved = window.localStorage.getItem(LOCALE_KEY)
    if (saved && isLocaleCode(saved)) {
      return saved
    }
  } catch {
    // localStorage 在隐私模式 / 跨域 iframe / quota 满 时会抛错,降级到 navigator 探测
  }

  try {
    const browserLang = (typeof navigator !== 'undefined' ? navigator.language : '').toLowerCase()
    if (browserLang.startsWith('zh')) {
      return 'zh'
    }
  } catch {
    // 极端 UA 下 navigator.language 可能不可读,继续降级
  }

  return DEFAULT_LOCALE
}

export const i18n = createI18n({
  legacy: false,
  locale: getDefaultLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: {},
  // 禁用 HTML 消息警告 - 引导步骤使用富文本内容（driver.js 支持 HTML）
  // 这些内容是内部定义的，不存在 XSS 风险
  warnHtmlMessage: false
})

const loadedLocales = new Set<LocaleCode>()

export async function loadLocaleMessages(locale: LocaleCode): Promise<void> {
  if (loadedLocales.has(locale)) {
    return
  }

  const loader = localeLoaders[locale]
  const module = await loader()
  i18n.global.setLocaleMessage(locale, module.default)
  loadedLocales.add(locale)
}

export async function initI18n(): Promise<void> {
  const current = getLocale()
  await loadLocaleMessages(current)
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', current)
  }
}

export async function setLocale(locale: string): Promise<void> {
  if (!isLocaleCode(locale)) {
    return
  }

  await loadLocaleMessages(locale)
  i18n.global.locale.value = locale

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LOCALE_KEY, locale)
    } catch (err) {
      // QuotaExceeded / 隐私模式 / 跨域 iframe; 写入失败不影响当前会话切换
      try {
        const { useAppStore } = await import('@/stores/app')
        const appStore = useAppStore()
        if ((err as { name?: string })?.name === 'QuotaExceededError') {
          appStore.showError?.(
            getLocale() === 'zh'
              ? '本地存储已满，无法持久化语言偏好'
              : 'Local storage is full; language preference will not persist'
          )
        }
      } catch {
        // store 不可用时静默
      }
    }
  }
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', locale)
  }

  // 同步更新浏览器页签标题，使其跟随语言切换
  const { resolveDocumentTitle } = await import('@/router/title')
  const { default: router } = await import('@/router')
  const { useAppStore } = await import('@/stores/app')
  const route = router.currentRoute.value
  const appStore = useAppStore()
  if (typeof document !== 'undefined') {
    document.title = resolveDocumentTitle(route.meta.title, appStore.siteName, route.meta.titleKey as string)
  }
}

export function getLocale(): LocaleCode {
  const current = i18n.global.locale.value
  return isLocaleCode(current) ? current : DEFAULT_LOCALE
}

export const availableLocales = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'zh', name: '中文', flag: '🇨🇳' }
] as const

export default i18n
