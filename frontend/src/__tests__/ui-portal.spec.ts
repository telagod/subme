import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k })
}))

import BaseDialog from '@/components/common/BaseDialog.vue'

describe('portal/stateful component interactivity', () => {
  it('Tabs emits update + switches on trigger interaction', async () => {
    const onUpdate = vi.fn()
    const w = mount(
      {
        components: { Tabs, TabsList, TabsTrigger, TabsContent },
        setup: () => ({ onUpdate }),
        template: `
          <Tabs default-value="a" @update:model-value="onUpdate">
            <TabsList>
              <TabsTrigger value="a">A</TabsTrigger>
              <TabsTrigger value="b">B</TabsTrigger>
            </TabsList>
            <TabsContent value="a">ContentA</TabsContent>
            <TabsContent value="b">ContentB</TabsContent>
          </Tabs>
        `,
      },
      { attachTo: document.body }
    )
    expect(w.text()).toContain('ContentA')
    const tabs = w.findAll('[role="tab"]')
    // reka-ui Tabs 通过 pointer/mousedown 切换,jsdom 需显式派发
    await tabs[1].trigger('mousedown')
    await tabs[1].trigger('click')
    await flushPromises()
    await nextTick()
    expect(onUpdate).toHaveBeenCalledWith('b')
  })

  it('Dialog renders content into body when open', async () => {
    mount(
      {
        components: { Dialog, DialogContent, DialogTitle },
        template: `<Dialog :open="true"><DialogContent><DialogTitle>T</DialogTitle>DialogBody</DialogContent></Dialog>`,
      },
      { attachTo: document.body }
    )
    await flushPromises()
    await nextTick()
    expect(document.body.innerHTML).toContain('DialogBody')
  })

  it('BaseDialog focuses body content, not the close-X button, on open', async () => {
    // Isolate from any prior teleport residue in document.body.
    document.body.innerHTML = ''

    const wrapper = mount(
      {
        components: { BaseDialog },
        template: `
          <BaseDialog :show="true" title="t">
            <input data-test="body-input" />
          </BaseDialog>
        `,
      },
      {
        attachTo: document.body,
        global: {
          stubs: {
            Icon: { template: '<span />' },
          },
        },
      }
    )

    await flushPromises()
    await nextTick()
    await nextTick()

    const input = document.querySelector<HTMLInputElement>('[data-test="body-input"]')
    const closeBtn = document.querySelector<HTMLElement>('[data-dialog-close]')

    expect(input).not.toBeNull()
    expect(closeBtn).not.toBeNull()
    expect(document.activeElement).toBe(input)
    expect(document.activeElement).not.toBe(closeBtn)

    wrapper.unmount()
  })
})
