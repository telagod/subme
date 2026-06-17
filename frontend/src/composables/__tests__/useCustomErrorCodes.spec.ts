import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { showError, showInfo } = vi.hoisted(() => ({
  showError: vi.fn(),
  showInfo: vi.fn(),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))
vi.mock('@/stores/app', () => ({ useAppStore: () => ({ showError, showInfo }) }))

import { useCustomErrorCodes } from '../useCustomErrorCodes'

describe('useCustomErrorCodes', () => {
  let confirmSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    showError.mockClear()
    showInfo.mockClear()
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    confirmSpy.mockRestore()
  })

  it('starts empty and resets back to defaults', () => {
    const ce = useCustomErrorCodes()
    expect(ce.customErrorCodesEnabled.value).toBe(false)
    expect(ce.selectedErrorCodes.value).toEqual([])
    expect(ce.customErrorCodeInput.value).toBeNull()

    ce.customErrorCodesEnabled.value = true
    ce.selectedErrorCodes.value = [400, 500]
    ce.customErrorCodeInput.value = 503
    ce.reset()
    expect(ce.customErrorCodesEnabled.value).toBe(false)
    expect(ce.selectedErrorCodes.value).toEqual([])
    expect(ce.customErrorCodeInput.value).toBeNull()
  })

  it('loads from credentials', () => {
    const ce = useCustomErrorCodes()
    ce.loadFromCredentials({ custom_error_codes_enabled: true, custom_error_codes: [400, 503] })
    expect(ce.customErrorCodesEnabled.value).toBe(true)
    expect(ce.selectedErrorCodes.value).toEqual([400, 503])

    ce.loadFromCredentials({ custom_error_codes_enabled: false })
    expect(ce.customErrorCodesEnabled.value).toBe(false)
    expect(ce.selectedErrorCodes.value).toEqual([])

    ce.loadFromCredentials(null)
    expect(ce.customErrorCodesEnabled.value).toBe(false)
    expect(ce.selectedErrorCodes.value).toEqual([])
  })

  it('toggles non-warning codes without confirm', () => {
    const ce = useCustomErrorCodes()
    ce.toggleErrorCode(500)
    expect(ce.selectedErrorCodes.value).toEqual([500])
    expect(confirmSpy).not.toHaveBeenCalled()
    ce.toggleErrorCode(500)
    expect(ce.selectedErrorCodes.value).toEqual([])
  })

  it('requires confirm to add 429 / 529', () => {
    const ce = useCustomErrorCodes()
    confirmSpy.mockReturnValueOnce(false)
    ce.toggleErrorCode(429)
    expect(ce.selectedErrorCodes.value).toEqual([]) // declined

    ce.toggleErrorCode(429) // confirm true (default)
    expect(ce.selectedErrorCodes.value).toEqual([429])
  })

  it('adds a valid custom code and clears the input', () => {
    const ce = useCustomErrorCodes()
    ce.customErrorCodeInput.value = 418
    ce.addCustomErrorCode()
    expect(ce.selectedErrorCodes.value).toEqual([418])
    expect(ce.customErrorCodeInput.value).toBeNull()
  })

  it('rejects out-of-range codes via showError', () => {
    const ce = useCustomErrorCodes()
    ce.customErrorCodeInput.value = 50
    ce.addCustomErrorCode()
    expect(showError).toHaveBeenCalledTimes(1)
    expect(ce.selectedErrorCodes.value).toEqual([])
  })

  it('warns on duplicate via showInfo', () => {
    const ce = useCustomErrorCodes()
    ce.selectedErrorCodes.value = [400]
    ce.customErrorCodeInput.value = 400
    ce.addCustomErrorCode()
    expect(showInfo).toHaveBeenCalledTimes(1)
    expect(ce.selectedErrorCodes.value).toEqual([400])
  })

  it('removes a selected code', () => {
    const ce = useCustomErrorCodes()
    ce.selectedErrorCodes.value = [400, 500]
    ce.removeErrorCode(400)
    expect(ce.selectedErrorCodes.value).toEqual([500])
    ce.removeErrorCode(999) // absent — no-op
    expect(ce.selectedErrorCodes.value).toEqual([500])
  })

  it('applies to credentials with create/edit semantics', () => {
    const ce = useCustomErrorCodes()
    ce.customErrorCodesEnabled.value = true
    ce.selectedErrorCodes.value = [400, 503]
    const creds: Record<string, unknown> = {}
    ce.applyToCredentials(creds, 'create')
    expect(creds).toEqual({ custom_error_codes_enabled: true, custom_error_codes: [400, 503] })

    const off = useCustomErrorCodes()
    const editCreds: Record<string, unknown> = {
      custom_error_codes_enabled: true,
      custom_error_codes: [400],
      keep: 1,
    }
    off.applyToCredentials(editCreds, 'edit')
    expect(editCreds).toEqual({ keep: 1 }) // edit deletes stale fields

    const createCreds: Record<string, unknown> = { keep: 1 }
    off.applyToCredentials(createCreds, 'create')
    expect(createCreds).toEqual({ keep: 1 }) // create never deletes
  })
})
