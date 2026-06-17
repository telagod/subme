import { extractApiErrorMessage } from './apiError'

/**
 * Auth-flow error message builder. Thin wrapper around the canonical
 * `extractApiErrorMessage` so auth and non-auth surfaces share the same
 * extraction hierarchy (E11 — single source of truth).
 */
export function buildAuthErrorMessage(
  error: unknown,
  options: {
    fallback: string
  }
): string {
  return extractApiErrorMessage(error, options.fallback)
}
