import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

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
})
