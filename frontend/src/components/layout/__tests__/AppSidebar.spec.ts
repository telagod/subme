import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const componentPath = resolve(dirname(fileURLToPath(import.meta.url)), '../AppSidebar.vue')
const componentSource = readFileSync(componentPath, 'utf8')

describe('AppSidebar custom SVG styles', () => {
  it('does not override uploaded SVG fill or stroke colors', () => {
    expect(componentSource).toContain('.sidebar-svg-icon {')
    expect(componentSource).toContain('color: currentColor;')
    expect(componentSource).toContain('display: block;')
    expect(componentSource).not.toContain('stroke: currentColor;')
    expect(componentSource).not.toContain('fill: none;')
  })
})

describe('AppSidebar header styles', () => {
  // After the shadcn migration the sidebar header/brand styling lives in the
  // component's scoped <style> (Tailwind utilities inline on the markup, plus a
  // few `.sidebar-*` rules), not in the global style.css — style.css no longer
  // contains any `.sidebar-*` rule. The invariant under test is unchanged: the
  // header container (`.sidebar-header-anim`) and the brand wrapper
  // (`.sidebar-brand`) must NOT set `overflow: hidden`, otherwise the version
  // badge dropdown would be clipped. The collapsed variants intentionally hide
  // overflow and are excluded here.
  it('does not clip the version badge dropdown', () => {
    const sidebarHeaderBlockMatch = componentSource.match(/\.sidebar-header-anim\s*\{[\s\S]*?\n\}/)
    const sidebarBrandBlockMatch = componentSource.match(/\.sidebar-brand\s*\{[\s\S]*?\n\}/)

    expect(sidebarHeaderBlockMatch).not.toBeNull()
    expect(sidebarBrandBlockMatch).not.toBeNull()
    expect(sidebarHeaderBlockMatch?.[0]).not.toContain('overflow: hidden;')
    expect(sidebarBrandBlockMatch?.[0]).not.toContain('overflow: hidden;')
  })
})
