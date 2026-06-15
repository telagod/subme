import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { SelectRoot } from 'reka-ui'
import OpsOpenAITokenStatsCard from '../OpsOpenAITokenStatsCard.vue'

const mockGetOpenAITokenStats = vi.fn()

vi.mock('@/api/admin/ops', () => ({
  opsAPI: {
    getOpenAITokenStats: (...args: any[]) => mockGetOpenAITokenStats(...args),
  },
}))

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>()
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string, params?: Record<string, any>) => {
        if (key === 'admin.ops.openaiTokenStats.pageInfo' && params) {
          return `第 ${params.page}/${params.total} 页`
        }
        return key
      },
    }),
  }
})

// NOTE: 组件里的 <Select> 来自 @/components/ui/select，本质是 reka-ui 的
// SelectRoot（无自定义 name），无法通过 stubs:{ Select } 替换。因此这里不再 stub，
// 直接 findAllComponents(SelectRoot) 拿到真实的三个 Select（时间窗/模式/TopN|页大小），
// 对其 emit('update:modelValue') 来模拟用户在下拉里选值，这才是迁移后真实的数据流。
const EmptyStateStub = defineComponent({
  name: 'EmptyState',
  props: {
    title: { type: String, default: '' },
    description: { type: String, default: '' },
  },
  template: '<div class="empty-state">{{ title }}|{{ description }}</div>',
})

const sampleResponse = {
  time_range: '30d' as const,
  start_time: '2026-01-01T00:00:00Z',
  end_time: '2026-01-31T00:00:00Z',
  platform: 'openai',
  group_id: 7,
  items: [
    {
      model: 'gpt-4o-mini',
      request_count: 12,
      avg_tokens_per_sec: 22.5,
      avg_first_token_ms: 123.45,
      total_output_tokens: 1234,
      avg_duration_ms: 321,
      requests_with_first_token: 10,
    },
  ],
  total: 40,
  page: 1,
  page_size: 20,
  top_n: null,
}

describe('OpsOpenAITokenStatsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('默认加载并透传 platform/group 过滤，支持时间窗口切换', async () => {
    mockGetOpenAITokenStats.mockResolvedValue(sampleResponse)

    const wrapper = mount(OpsOpenAITokenStatsCard, {
      props: {
        platformFilter: 'openai',
        groupIdFilter: 7,
        refreshToken: 0,
      },
      global: {
        stubs: {
          EmptyState: EmptyStateStub,
        },
      },
    })

    await flushPromises()
    expect(mockGetOpenAITokenStats).toHaveBeenCalledWith(
      expect.objectContaining({
        time_range: '30d',
        platform: 'openai',
        group_id: 7,
        top_n: 20,
      })
    )

    const selects = wrapper.findAllComponents(SelectRoot)
    await selects[0].vm.$emit('update:modelValue', '1h')
    await flushPromises()

    expect(mockGetOpenAITokenStats).toHaveBeenCalledWith(
      expect.objectContaining({
        time_range: '1h',
        platform: 'openai',
        group_id: 7,
      })
    )
  })

  it('支持分页与 TopN 模式切换并按参数请求', async () => {
    mockGetOpenAITokenStats.mockImplementation(async (params: Record<string, any>) => ({
      ...sampleResponse,
      time_range: params.time_range ?? '30d',
      page: params.page ?? 1,
      page_size: params.page_size ?? 20,
      top_n: params.top_n ?? null,
      total: 40,
    }))

    const wrapper = mount(OpsOpenAITokenStatsCard, {
      props: {
        refreshToken: 0,
      },
      global: {
        stubs: {
          EmptyState: EmptyStateStub,
        },
      },
    })
    await flushPromises()

    let selects = wrapper.findAllComponents(SelectRoot)
    // selects[1] = 视图模式选择器（topn / pagination）
    await selects[1].vm.$emit('update:modelValue', 'pagination')
    await flushPromises()

    expect(mockGetOpenAITokenStats).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        page_size: 20,
      })
    )

    // 迁移后 Select 触发器本身也是 <button role="combobox">，裸索引已失效，
    // 改用文本定位"下一页"按钮。
    const nextPageBtn = wrapper.findAll('button').find(
      (b) => b.text() === 'admin.ops.openaiTokenStats.nextPage'
    )
    expect(nextPageBtn).toBeTruthy()
    await nextPageBtn!.trigger('click')
    await flushPromises()

    expect(mockGetOpenAITokenStats).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        page_size: 20,
      })
    )

    selects = wrapper.findAllComponents(SelectRoot)
    await selects[1].vm.$emit('update:modelValue', 'topn')
    await flushPromises()
    selects = wrapper.findAllComponents(SelectRoot)
    // selects[2] = TopN 选择器；SelectItem 的 value 为 String(opt.value)，
    // 故真实 v-model 收到字符串 '50'，组件内再 Number() 还原。
    await selects[2].vm.$emit('update:modelValue', '50')
    await flushPromises()

    expect(mockGetOpenAITokenStats).toHaveBeenCalledWith(
      expect.objectContaining({
        top_n: 50,
      })
    )
  })

  it('接口返回空数据时显示空态', async () => {
    mockGetOpenAITokenStats.mockResolvedValue({
      ...sampleResponse,
      items: [],
      total: 0,
    })

    const wrapper = mount(OpsOpenAITokenStatsCard, {
      props: { refreshToken: 0 },
      global: {
        stubs: {
          EmptyState: EmptyStateStub,
        },
      },
    })
    await flushPromises()

    expect(wrapper.find('.empty-state').exists()).toBe(true)
  })

  it('数据表使用固定高度滚动容器，避免纵向无限增长', async () => {
    mockGetOpenAITokenStats.mockResolvedValue(sampleResponse)

    const wrapper = mount(OpsOpenAITokenStatsCard, {
      props: { refreshToken: 0 },
      global: {
        stubs: {
          EmptyState: EmptyStateStub,
        },
      },
    })
    await flushPromises()

    // 迁移后滚动容器用内联 style 固定高度（max-height:420px;overflow:auto），
    // 而非 Tailwind 的 .max-h-[420px] 工具类，因此断言渲染出的 inline style。
    const scrollBox = wrapper
      .findAll('div')
      .find((d) => /max-height:\s*420px/.test(d.attributes('style') ?? ''))
    expect(scrollBox).toBeTruthy()
    expect(scrollBox!.attributes('style')).toMatch(/overflow:\s*auto/)
  })

  it('接口异常时显示错误提示', async () => {
    mockGetOpenAITokenStats.mockRejectedValue(new Error('加载失败'))

    const wrapper = mount(OpsOpenAITokenStatsCard, {
      props: { refreshToken: 0 },
      global: {
        stubs: {
          EmptyState: EmptyStateStub,
        },
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('加载失败')
  })
})
