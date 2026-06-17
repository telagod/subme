import { afterEach, describe, expect, it } from 'vitest'

import { getPersistedPageSize } from '@/composables/usePersistedPageSize'

describe('usePersistedPageSize', () => {
  afterEach(() => {
    localStorage.clear()
    delete window.__APP_CONFIG__
  })

  it('honors the persisted page size from localStorage over the system default', () => {
    // 契约反转：f084d30d「恢复 localStorage 持久化」后，用户持久化的页大小优先于 system default
    window.__APP_CONFIG__ = {
      table_default_page_size: 100,
      table_page_size_options: [20, 50, 100]
    } as any
    localStorage.setItem('table-page-size', '50')

    expect(getPersistedPageSize()).toBe(50)
  })
})
