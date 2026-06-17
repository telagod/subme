import { describe, it, expect } from 'vitest'
import {
  usePoolModeConfig,
  parsePoolModeRetryStatusCodes,
  formatPoolModeRetryStatusCodes,
  normalizePoolModeRetryCount,
  DEFAULT_POOL_MODE_RETRY_COUNT,
  MAX_POOL_MODE_RETRY_COUNT,
} from '../usePoolModeConfig'

describe('parsePoolModeRetryStatusCodes', () => {
  it('returns [] for empty / blank input', () => {
    expect(parsePoolModeRetryStatusCodes('')).toEqual([])
    expect(parsePoolModeRetryStatusCodes('   ')).toEqual([])
  })

  it('parses comma- and space-separated codes', () => {
    expect(parsePoolModeRetryStatusCodes('401,403,429')).toEqual([401, 403, 429])
    expect(parsePoolModeRetryStatusCodes('429 403 401')).toEqual([401, 403, 429])
  })

  it('dedupes and sorts ascending', () => {
    expect(parsePoolModeRetryStatusCodes('429, 401, 429, 403')).toEqual([401, 403, 429])
  })

  it('drops out-of-range and non-integer tokens', () => {
    expect(parsePoolModeRetryStatusCodes('99, 600, 401, abc, 4.5')).toEqual([401])
  })
})

describe('formatPoolModeRetryStatusCodes', () => {
  it('returns "" for non-array', () => {
    expect(formatPoolModeRetryStatusCodes(undefined)).toBe('')
    expect(formatPoolModeRetryStatusCodes('401')).toBe('')
  })

  it('formats, dedupes, sorts and joins with ", "', () => {
    expect(formatPoolModeRetryStatusCodes([429, 401, 403, 429])).toBe('401, 403, 429')
  })

  it('accepts numeric strings, drops out-of-range', () => {
    expect(formatPoolModeRetryStatusCodes(['401', '600', '403'])).toBe('401, 403')
  })
})

describe('normalizePoolModeRetryCount', () => {
  it('falls back to default for non-finite', () => {
    expect(normalizePoolModeRetryCount(NaN)).toBe(DEFAULT_POOL_MODE_RETRY_COUNT)
    expect(normalizePoolModeRetryCount(Infinity)).toBe(DEFAULT_POOL_MODE_RETRY_COUNT)
  })

  it('clamps to [0, MAX] and truncates', () => {
    expect(normalizePoolModeRetryCount(-5)).toBe(0)
    expect(normalizePoolModeRetryCount(99)).toBe(MAX_POOL_MODE_RETRY_COUNT)
    expect(normalizePoolModeRetryCount(3.9)).toBe(3)
  })
})

describe('usePoolModeConfig state', () => {
  it('starts at defaults and resets back to them', () => {
    const pm = usePoolModeConfig()
    expect(pm.poolModeEnabled.value).toBe(false)
    expect(pm.poolModeRetryCount.value).toBe(DEFAULT_POOL_MODE_RETRY_COUNT)
    expect(pm.poolModeRetryStatusCodesInput.value).toBe('')

    pm.poolModeEnabled.value = true
    pm.poolModeRetryCount.value = 7
    pm.poolModeRetryStatusCodesInput.value = '401'
    pm.reset()
    expect(pm.poolModeEnabled.value).toBe(false)
    expect(pm.poolModeRetryCount.value).toBe(DEFAULT_POOL_MODE_RETRY_COUNT)
    expect(pm.poolModeRetryStatusCodesInput.value).toBe('')
  })

  it('loads from credentials and normalizes retry count', () => {
    const pm = usePoolModeConfig()
    pm.loadFromCredentials({
      pool_mode: true,
      pool_mode_retry_count: 99,
      pool_mode_retry_status_codes: [429, 401],
    })
    expect(pm.poolModeEnabled.value).toBe(true)
    expect(pm.poolModeRetryCount.value).toBe(MAX_POOL_MODE_RETRY_COUNT)
    expect(pm.poolModeRetryStatusCodesInput.value).toBe('401, 429')
  })

  it('load tolerates null/undefined credentials', () => {
    const pm = usePoolModeConfig()
    pm.loadFromCredentials(null)
    expect(pm.poolModeEnabled.value).toBe(false)
    expect(pm.poolModeRetryStatusCodesInput.value).toBe('')
  })
})

describe('usePoolModeConfig applyToCredentials', () => {
  it("create mode: writes fields when enabled, leaves object untouched when disabled", () => {
    const pm = usePoolModeConfig()
    pm.poolModeEnabled.value = true
    pm.poolModeRetryCount.value = 5
    pm.poolModeRetryStatusCodesInput.value = '401, 403'
    const creds: Record<string, unknown> = {}
    pm.applyToCredentials(creds, 'create')
    expect(creds).toEqual({
      pool_mode: true,
      pool_mode_retry_count: 5,
      pool_mode_retry_status_codes: [401, 403],
    })

    const off = usePoolModeConfig()
    const creds2: Record<string, unknown> = { existing: 1 }
    off.applyToCredentials(creds2, 'create')
    expect(creds2).toEqual({ existing: 1 }) // create never deletes
  })

  it('create mode: omits status codes when input parses empty', () => {
    const pm = usePoolModeConfig()
    pm.poolModeEnabled.value = true
    pm.poolModeRetryStatusCodesInput.value = '   '
    const creds: Record<string, unknown> = {}
    pm.applyToCredentials(creds, 'create')
    expect(creds.pool_mode).toBe(true)
    expect('pool_mode_retry_status_codes' in creds).toBe(false)
  })

  it('edit mode: deletes all pool fields when disabled', () => {
    const pm = usePoolModeConfig()
    pm.poolModeEnabled.value = false
    const creds: Record<string, unknown> = {
      pool_mode: true,
      pool_mode_retry_count: 5,
      pool_mode_retry_status_codes: [401],
      keep_me: 'yes',
    }
    pm.applyToCredentials(creds, 'edit')
    expect(creds).toEqual({ keep_me: 'yes' })
  })

  it('edit mode: deletes stale status codes when input empties', () => {
    const pm = usePoolModeConfig()
    pm.poolModeEnabled.value = true
    pm.poolModeRetryCount.value = 4
    pm.poolModeRetryStatusCodesInput.value = ''
    const creds: Record<string, unknown> = { pool_mode_retry_status_codes: [401, 403] }
    pm.applyToCredentials(creds, 'edit')
    expect(creds.pool_mode).toBe(true)
    expect(creds.pool_mode_retry_count).toBe(4)
    expect('pool_mode_retry_status_codes' in creds).toBe(false)
  })
})
