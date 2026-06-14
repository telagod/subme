import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

describe('UI primitive interactivity audit', () => {
  // ---- Button: 渲染 tag + 交互(Button div bug 的回归守卫) ----
  it('Button renders <button> by default (NOT div)', () => {
    const w = mount(Button, { slots: { default: 'X' } })
    expect(w.element.tagName).toBe('BUTTON')
  })
  it('Button type=submit attr passes through', () => {
    const w = mount(Button, { attrs: { type: 'submit' }, slots: { default: 'X' } })
    expect(w.find('button').attributes('type')).toBe('submit')
  })
  it('Button asChild renders slot child element', () => {
    const w = mount(Button, { props: { asChild: true }, slots: { default: '<a href="#">L</a>' } })
    expect(w.find('a').exists()).toBe(true)
  })

  // ---- Input ----
  it('Input v-model emits on input', async () => {
    const w = mount(Input, { props: { modelValue: '' } })
    await w.find('input').setValue('abc')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['abc'])
  })
  it('Input v-model.number coerces string to number', async () => {
    const w = mount(Input, { props: { modelValue: null, modelModifiers: { number: true } } })
    await w.find('input').setValue('42')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([42])
  })
  it('Input exposes focus()', () => {
    const w = mount(Input, { props: { modelValue: '' } })
    expect(typeof (w.vm as unknown as { focus: unknown }).focus).toBe('function')
  })

  // ---- Textarea ----
  it('Textarea v-model emits', async () => {
    const w = mount(Textarea, { props: { modelValue: '' } })
    await w.find('textarea').setValue('hi')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['hi'])
  })

  // ---- Switch: modelValue + checked 双契约 ----
  it('Switch renders <button> with switch role', () => {
    const w = mount(Switch, { props: { modelValue: false } })
    expect(w.find('button').exists()).toBe(true)
  })
  it('Switch :checked=true reflects checked state', () => {
    const w = mount(Switch, { props: { checked: true } })
    expect(w.find('button').attributes('data-state')).toBe('checked')
  })
  it('Switch :model-value=true reflects checked state', () => {
    const w = mount(Switch, { props: { modelValue: true } })
    expect(w.find('button').attributes('data-state')).toBe('checked')
  })

  // ---- Checkbox: modelValue + checked 双契约 ----
  it('Checkbox :checked=true reflects checked', () => {
    const w = mount(Checkbox, { props: { checked: true } })
    expect(w.find('button').attributes('data-state')).toBe('checked')
  })
  it('Checkbox :model-value=true reflects checked', () => {
    const w = mount(Checkbox, { props: { modelValue: true } })
    expect(w.find('button').attributes('data-state')).toBe('checked')
  })

  // ---- 静态渲染 ----
  it('Badge renders text', () => {
    const w = mount(Badge, { props: { variant: 'destructive' }, slots: { default: 'B' } })
    expect(w.text()).toBe('B')
  })
  it('Label renders <label>', () => {
    const w = mount(Label, { slots: { default: 'L' } })
    expect(w.find('label').exists()).toBe(true)
  })
  it('Separator renders bg-border', () => {
    const w = mount(Separator)
    expect(w.html()).toContain('bg-border')
  })
})
