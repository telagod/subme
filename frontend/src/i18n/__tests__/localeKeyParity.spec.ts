import { describe, expect, it } from 'vitest'

import en from '../locales/en'
import zh from '../locales/zh'

// R5 follow-up: lock in zero divergence between en/zh leaf key counts.
//
// commit 268d6571 (v0.2.0-subme.17) drove en.ts and zh.ts to 6595 keys each
// after cleaning 314 orphans. Without a parity guard, individual feature
// commits can re-introduce orphans (keys present in one locale only) — that
// regresses the runtime fallback story (zh users seeing raw key paths) and
// the orphan-cleanup work has to be redone manually.
//
// We assert:
//   1. The two trees have the same leaf count (structural parity).
//   2. There are no keys present in EN but missing in ZH, and vice versa.

function flattenKeys(obj: unknown, prefix = ''): string[] {
  if (obj === null || obj === undefined) return []
  if (typeof obj !== 'object') return [prefix]
  if (Array.isArray(obj)) {
    return obj.flatMap((item, idx) => flattenKeys(item, prefix ? `${prefix}.${idx}` : String(idx)))
  }
  const out: string[] = []
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const nextPrefix = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...flattenKeys(v, nextPrefix))
    } else {
      out.push(nextPrefix)
    }
  }
  return out
}

describe('i18n locale parity (en ↔ zh)', () => {
  const enKeys = flattenKeys(en).sort()
  const zhKeys = flattenKeys(zh).sort()

  it('en and zh have equal leaf key counts', () => {
    expect(enKeys.length).toBe(zhKeys.length)
  })

  it('en and zh have identical key sets (no orphans either way)', () => {
    const enSet = new Set(enKeys)
    const zhSet = new Set(zhKeys)
    const onlyInEn = enKeys.filter((k) => !zhSet.has(k))
    const onlyInZh = zhKeys.filter((k) => !enSet.has(k))
    expect(onlyInEn, `keys only in en: ${onlyInEn.slice(0, 10).join(', ')}`).toEqual([])
    expect(onlyInZh, `keys only in zh: ${onlyInZh.slice(0, 10).join(', ')}`).toEqual([])
  })
})
