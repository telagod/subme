import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'

// R4 follow-up: ensure AccountStatsModal surfaces an inline ErrorState (with
// retry) when adminAPI.accounts.getStats rejects, and that clicking retry
// re-invokes the loader. Mocks live at the module boundary so the modal's
// own loadStats flow is exercised end-to-end.

const { getStatsMock } = vi.hoisted(() => ({
  getStatsMock: vi.fn()
}))

vi.mock('@/api/admin', () => ({
  adminAPI: {
    accounts: {
      getStats: getStatsMock
    }
  }
}))

vi.mock('vue-i18n', async () => {
  const actual = await vi.importActual<typeof import('vue-i18n')>('vue-i18n')
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string) => key
    })
  }
})

// Chart.js dependencies are expensive to mount in jsdom — stub the chart
// containers since this test only exercises the error path.
vi.mock('vue-chartjs', () => ({
  Line: defineComponent({ name: 'LineStub', template: '<div data-stub="line" />' })
}))

vi.mock('@/components/charts/ModelDistributionChart.vue', () => ({
  default: defineComponent({ name: 'ModelDistributionChartStub', template: '<div />' })
}))

vi.mock('@/components/charts/EndpointDistributionChart.vue', () => ({
  default: defineComponent({ name: 'EndpointDistributionChartStub', template: '<div />' })
}))

const BaseDialogStub = defineComponent({
  name: 'BaseDialog',
  props: { show: { type: Boolean, default: false } },
  template: '<div v-if="show"><slot /><slot name="footer" /></div>'
})

const IconStub = defineComponent({ name: 'Icon', template: '<span />' })

import AccountStatsModal from '../AccountStatsModal.vue'
import type { Account } from '@/types'

// Tests only exercise the error path so a partial Account fixture suffices;
// expose a typed factory to keep the cast local and intentional.
const buildAccountFixture = (overrides: Partial<Account> = {}): Account =>
  ({ id: 42, name: 'acc', status: 'active', ...overrides } as Account)

describe('AccountStatsModal — ErrorState integration', () => {
  beforeEach(() => {
    getStatsMock.mockReset()
  })

  it('renders ErrorState with retry when getStats rejects', async () => {
    getStatsMock.mockRejectedValue(new Error('boom'))

    const wrapper = mount(AccountStatsModal, {
      props: {
        show: false,
        account: buildAccountFixture()
      },
      global: {
        stubs: {
          BaseDialog: BaseDialogStub,
          Icon: IconStub
        }
      }
    })

    // Modal lazy-loads on show toggle (watch without immediate). Flip to open
    // to trigger loadStats().
    await wrapper.setProps({ show: true })
    await flushPromises()
    await nextTick()

    expect(getStatsMock).toHaveBeenCalledWith(42, 30)

    // ErrorState renders a retry button driven by onRetry=loadStats.
    const buttons = wrapper.findAll('button')
    const retryBtn = buttons.find((b) => b.attributes('disabled') === undefined && b.text().length > 0)
    expect(retryBtn).toBeTruthy()

    // Keep the mock rejecting so we don't pull the rest of the stats template
    // (chart-heavy) into the render path. We only need to verify the retry
    // wire-up reinvokes the loader; success-path rendering has its own coverage.
    await retryBtn!.trigger('click')
    await flushPromises()

    expect(getStatsMock).toHaveBeenCalledTimes(2)
  })
})
