/**
 * useApiKeyGroupFilterOptions
 *
 * Build the option list for the "Filter users by the group their API keys are
 * bound to" Select on /admin/users. Groups arrive from
 * `adminAPI.groups.getAllIncludingInactive()` so admins can still surface users
 * whose keys are pinned to a now-disabled group.
 *
 * Output shape is the same `SelectOption` consumed by `@/components/common/Select.vue`
 * (the local wrapper, not the reka-ui primitive). Sections are partitioned into
 * exclusive / public / subscription / disabled and prefixed by a disabled
 * header row. Empty sections render no header.
 *
 * Special values:
 *   - `null` (default sentinel for the wrapper) clears the filter ("All").
 *   - Negative integers (-1..-4) tag section-header rows so that the Vue
 *     `:key="${typeof v}:${String(v ?? '')}"` expression inside Select.vue
 *     produces distinct keys for each header (multiple nulls would collide).
 */
import type { AdminGroup } from '@/types'

export interface ApiKeyGroupFilterOption {
  value: number | null
  label: string
  /** Marks the row as a disabled section header (not selectable). */
  kind?: 'group-header'
  disabled?: boolean
  /**
   * Index signature so this shape is assignable to
   * `Array<Record<string, unknown>>` — the loose options shape
   * accepted by `@/components/common/Select.vue` alongside SelectOption[].
   */
  [key: string]: unknown
}

export interface ApiKeyGroupFilterLabels {
  all: string
  exclusive: string
  public: string
  subscription: string
  disabled: string
}

// Sentinel header ids — must stay negative (real group ids are positive) and
// pairwise distinct so the :key dedupe in Select.vue keeps every header.
const HEADER_EXCLUSIVE = -1
const HEADER_PUBLIC = -2
const HEADER_SUBSCRIPTION = -3
const HEADER_DISABLED = -4

export function buildApiKeyGroupFilterOptions(
  groups: AdminGroup[],
  labels: ApiKeyGroupFilterLabels
): ApiKeyGroupFilterOption[] {
  const exclusive: ApiKeyGroupFilterOption[] = []
  const publicGroups: ApiKeyGroupFilterOption[] = []
  const subscription: ApiKeyGroupFilterOption[] = []
  const disabledGroups: ApiKeyGroupFilterOption[] = []

  for (const grp of groups) {
    const item: ApiKeyGroupFilterOption = { value: grp.id, label: grp.name }
    if (grp.status !== 'active') {
      disabledGroups.push(item)
    } else if (grp.subscription_type === 'subscription') {
      subscription.push(item)
    } else if (grp.is_exclusive) {
      exclusive.push(item)
    } else {
      publicGroups.push(item)
    }
  }

  const options: ApiKeyGroupFilterOption[] = [{ value: null, label: labels.all }]

  const sections: Array<[string, number, ApiKeyGroupFilterOption[]]> = [
    [labels.exclusive, HEADER_EXCLUSIVE, exclusive],
    [labels.public, HEADER_PUBLIC, publicGroups],
    [labels.subscription, HEADER_SUBSCRIPTION, subscription],
    [labels.disabled, HEADER_DISABLED, disabledGroups],
  ]
  for (const [label, headerValue, items] of sections) {
    if (items.length === 0) continue
    options.push({ value: headerValue, label, kind: 'group-header', disabled: true })
    options.push(...items)
  }
  return options
}
