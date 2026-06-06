import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import DataTable from '../DataTable.vue'

// jsdom 不自带 matchMedia；置 matches=false 让 DataTable 走卡片/移动视图分支
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
})

// 简化 i18n：t 直接回 key，避免拉起完整 i18n 实例
vi.mock('vue-i18n', async () => {
  const actual = await vi.importActual<typeof import('vue-i18n')>('vue-i18n')
  return {
    ...actual,
    useI18n: () => ({ t: (key: string) => key }),
  }
})

describe('DataTable card-view virtualization', () => {
  // jsdom 下 window.matchMedia('(min-width: 768px)').matches 默认为 false，
  // 因此 DataTable 走「卡片/移动视图」——正是此前全量 v-for 渲染、大数据卡死的分支。
  // 这条用例钉死该分支必须虚拟化：渲染的卡片数远小于总行数，防止有人改回全量渲染。
  it('only renders a small window of cards for a large dataset', async () => {
    const data = Array.from({ length: 300 }, (_, i) => ({ id: i + 1, name: `row-${i + 1}` }))
    const columns = [{ key: 'name', label: 'Name' }]

    const wrapper = mount(DataTable, {
      props: { data, columns, rowKey: 'id' },
      global: { stubs: { Icon: true } },
    })

    await nextTick()
    await nextTick()

    const rendered = wrapper.findAll('[data-index]')
    expect(rendered.length).toBeGreaterThan(0)
    // 虚拟化生效：渲染卡片数必须显著小于总行数。
    // 注：jsdom 无真实布局/滚动，可见窗口不如真机紧凑；此处作为「防退回全量渲染」的回归哨兵 ——
    // 一旦有人把卡片分支改回全量 v-for，渲染数会逼近 300 而触发失败。
    expect(rendered.length).toBeLessThan(200)
  })
})
