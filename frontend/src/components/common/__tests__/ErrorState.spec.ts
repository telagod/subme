import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import ErrorState from '@/components/common/ErrorState.vue'

// The runtime-only i18n build used in tests returns the key when no message
// compiler is bundled. That's fine for ErrorState's *prop-driven* paths
// (title/description), but means we should not rely on the default i18n
// fallbacks inside these assertions. Each test supplies its own copy via props.
function makeI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    fallbackWarn: false,
    missingWarn: false,
    messages: { en: {} },
  })
}

describe('ErrorState', () => {
  it('renders the provided title and description', () => {
    const wrapper = mount(ErrorState, {
      props: { title: 'Load failed', description: 'Try again later.' },
      global: { plugins: [makeI18n()] },
    })
    expect(wrapper.text()).toContain('Load failed')
    expect(wrapper.text()).toContain('Try again later.')
    // No retry button when onRetry is not supplied
    expect(wrapper.findAll('button').length).toBe(0)
  })

  it('renders a retry button when onRetry is provided and emits the click', async () => {
    const onRetry = vi.fn()
    const wrapper = mount(ErrorState, {
      props: { title: 'Boom', onRetry, retryLabel: 'Try again' },
      global: { plugins: [makeI18n()] },
    })

    const button = wrapper.find('button')
    expect(button.exists()).toBe(true)
    expect(button.text()).toContain('Try again')

    await button.trigger('click')
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('disables retry while loading is true and swallows clicks', async () => {
    const onRetry = vi.fn()
    const wrapper = mount(ErrorState, {
      props: { title: 'Boom', onRetry, loading: true, retryLabel: 'Try again' },
      global: { plugins: [makeI18n()] },
    })

    const button = wrapper.get('button')
    expect((button.element as HTMLButtonElement).disabled).toBe(true)

    await button.trigger('click')
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('applies the compact variant container class', () => {
    const wrapper = mount(ErrorState, {
      props: {
        variant: 'compact',
        title: 'Compact error',
        onRetry: () => {},
        retryLabel: 'Retry',
      },
      global: { plugins: [makeI18n()] },
    })
    expect(wrapper.text()).toContain('Compact error')
    // Compact variant should still expose a retry button when onRetry is given
    expect(wrapper.find('button').exists()).toBe(true)
    // Compact root uses a border + bg utility chain we can assert on indirectly
    expect(wrapper.html()).toContain('border-destructive')
  })

  it('renders the action slot in place of the default retry button', () => {
    const wrapper = mount(ErrorState, {
      props: { title: 'Boom' },
      slots: {
        action: '<button data-testid="custom-retry">Custom</button>',
      },
      global: { plugins: [makeI18n()] },
    })
    expect(wrapper.find('[data-testid="custom-retry"]').exists()).toBe(true)
  })
})
