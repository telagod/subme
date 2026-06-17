import { beforeEach, describe, expect, it, vi } from 'vitest'

const { showError } = vi.hoisted(() => ({ showError: vi.fn() }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('@/stores/app', () => ({ useAppStore: () => ({ showError }) }))

import { useTempUnschedRules } from '../useTempUnschedRules'

const validRule = () => ({ error_code: 529, keywords: 'overloaded, busy', duration_minutes: 60, description: 'x' })

describe('useTempUnschedRules', () => {
  beforeEach(() => {
    showError.mockClear()
  })

  it('exposes three presets with expected error codes', () => {
    const tu = useTempUnschedRules('test')
    const codes = tu.tempUnschedPresets.value.map((p) => p.rule.error_code)
    expect(codes).toEqual([529, 429, 503])
  })

  it('adds preset (cloned) or a blank default rule', () => {
    const tu = useTempUnschedRules('test')
    const preset = validRule()
    tu.addTempUnschedRule(preset)
    expect(tu.tempUnschedRules.value[0]).toEqual(preset)
    expect(tu.tempUnschedRules.value[0]).not.toBe(preset) // cloned

    tu.addTempUnschedRule()
    expect(tu.tempUnschedRules.value[1]).toEqual({
      error_code: null,
      keywords: '',
      duration_minutes: 30,
      description: ''
    })
  })

  it('removes and reorders rules', () => {
    const tu = useTempUnschedRules('test')
    tu.tempUnschedRules.value = [
      { error_code: 1, keywords: 'a', duration_minutes: 1, description: '' },
      { error_code: 2, keywords: 'b', duration_minutes: 1, description: '' },
      { error_code: 3, keywords: 'c', duration_minutes: 1, description: '' }
    ] as never

    tu.moveTempUnschedRule(0, 1)
    expect(tu.tempUnschedRules.value.map((r) => r.error_code)).toEqual([2, 1, 3])
    tu.moveTempUnschedRule(0, -1) // out of bounds — no-op
    expect(tu.tempUnschedRules.value.map((r) => r.error_code)).toEqual([2, 1, 3])

    tu.removeTempUnschedRule(1)
    expect(tu.tempUnschedRules.value.map((r) => r.error_code)).toEqual([2, 3])
  })

  it('builds payload and drops invalid rules', () => {
    const tu = useTempUnschedRules('test')
    const built = tu.buildTempUnschedRules([
      { error_code: 529, keywords: 'overloaded, busy', duration_minutes: 60.9, description: ' trim me ' },
      { error_code: 99, keywords: 'x', duration_minutes: 10, description: '' }, // code out of range
      { error_code: 500, keywords: 'y', duration_minutes: 0, description: '' }, // duration <= 0
      { error_code: 503, keywords: '   ', duration_minutes: 5, description: '' } // empty keywords
    ])
    expect(built).toEqual([
      { error_code: 529, keywords: ['overloaded', 'busy'], duration_minutes: 60, description: 'trim me' }
    ])
  })

  it('apply: disabled deletes fields and returns true', () => {
    const tu = useTempUnschedRules('test')
    const creds: Record<string, unknown> = {
      temp_unschedulable_enabled: true,
      temp_unschedulable_rules: [{}],
      keep: 1
    }
    expect(tu.applyToCredentials(creds)).toBe(true)
    expect(creds).toEqual({ keep: 1 })
  })

  it('apply: enabled with valid rules writes fields and returns true', () => {
    const tu = useTempUnschedRules('test')
    tu.tempUnschedEnabled.value = true
    tu.tempUnschedRules.value = [validRule()]
    const creds: Record<string, unknown> = {}
    expect(tu.applyToCredentials(creds)).toBe(true)
    expect(creds.temp_unschedulable_enabled).toBe(true)
    expect(creds.temp_unschedulable_rules).toEqual([
      { error_code: 529, keywords: ['overloaded', 'busy'], duration_minutes: 60, description: 'x' }
    ])
    expect(showError).not.toHaveBeenCalled()
  })

  it('apply: enabled but no valid rules shows error and returns false', () => {
    const tu = useTempUnschedRules('test')
    tu.tempUnschedEnabled.value = true
    tu.tempUnschedRules.value = [{ error_code: 99, keywords: '', duration_minutes: 0, description: '' }]
    const creds: Record<string, unknown> = {}
    expect(tu.applyToCredentials(creds)).toBe(false)
    expect(showError).toHaveBeenCalledTimes(1)
    expect('temp_unschedulable_enabled' in creds).toBe(false)
  })

  it('resets to defaults', () => {
    const tu = useTempUnschedRules('test')
    tu.tempUnschedEnabled.value = true
    tu.tempUnschedRules.value = [validRule()]
    tu.reset()
    expect(tu.tempUnschedEnabled.value).toBe(false)
    expect(tu.tempUnschedRules.value).toEqual([])
  })

  it('loads from credentials, normalizing keywords and numbers', () => {
    const tu = useTempUnschedRules('test')
    tu.loadFromCredentials({
      temp_unschedulable_enabled: true,
      temp_unschedulable_rules: [
        { error_code: 529, keywords: ['overloaded', 'busy'], duration_minutes: 60, description: 'd' },
        { error_code: 'bad', keywords: 'a, b', duration_minutes: -3, description: 123 }
      ]
    })
    expect(tu.tempUnschedEnabled.value).toBe(true)
    expect(tu.tempUnschedRules.value).toEqual([
      { error_code: 529, keywords: 'overloaded, busy', duration_minutes: 60, description: 'd' },
      { error_code: null, keywords: 'a, b', duration_minutes: null, description: '' }
    ])

    tu.loadFromCredentials({ temp_unschedulable_enabled: false })
    expect(tu.tempUnschedEnabled.value).toBe(false)
    expect(tu.tempUnschedRules.value).toEqual([])
  })
})
