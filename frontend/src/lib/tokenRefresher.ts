/**
 * Shared token-refresh single-flight coordinator.
 *
 * Both the axios 401 interceptor (api/client.ts) and the proactive scheduler
 * inside the auth store (stores/auth.ts) may want to refresh the access token.
 * Without coordination, a 401 burst + a proactive expiry tick can fire two
 * /auth/refresh calls back-to-back; the loser's response overwrites the
 * winner's tokens and races on localStorage.
 *
 * This module owns the single in-flight promise. Callers from either side
 * `await performRefresh()` and either:
 *   - reuse the in-flight refresh if one is already running, OR
 *   - kick off a new one and become the canonical writer.
 *
 * The module deliberately:
 *   - has zero dependency on the auth store (no circular dep), and
 *   - has zero dependency on apiClient (so the interceptor can import it
 *     without re-entering itself).
 *
 * It calls /auth/refresh with a bare `axios.post` so a 401 inside the refresh
 * path itself cannot recurse through the interceptor.
 */

import axios from 'axios'
import type { ApiResponse } from '@/types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'

const AUTH_TOKEN_KEY = 'auth_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const TOKEN_EXPIRES_AT_KEY = 'token_expires_at'

export interface RefreshResult {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

interface InFlight {
  promise: Promise<RefreshResult>
}

let inflight: InFlight | null = null

/**
 * Returns whether a refresh is currently in flight. Useful for code paths
 * that want to avoid queuing extra work behind an already-pending refresh.
 */
export function isRefreshInFlight(): boolean {
  return inflight !== null
}

/**
 * Perform the token refresh. If one is already in flight, returns the same
 * promise (single-flight). On success, callers must propagate the new token
 * to wherever they care (axios headers, store state, etc.).
 *
 * Persistence of the new tokens to localStorage IS done here, so consumers
 * never observe a partial state where the axios header has a new token but
 * localStorage still holds the old one.
 */
export function performRefresh(refreshToken: string): Promise<RefreshResult> {
  if (inflight) {
    return inflight.promise
  }

  const promise = (async () => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/auth/refresh`,
        { refresh_token: refreshToken },
        { headers: { 'Content-Type': 'application/json' } }
      )

      const body = response.data as ApiResponse<{
        access_token: string
        refresh_token: string
        expires_in: number
      }>

      if (!body || body.code !== 0 || !body.data) {
        throw new Error('Token refresh failed: malformed response')
      }

      const { access_token, refresh_token: nextRefreshToken, expires_in } = body.data

      // Persist immediately so subsequent reads of localStorage see the
      // canonical fresh tokens, regardless of which caller wakes first.
      try {
        localStorage.setItem(AUTH_TOKEN_KEY, access_token)
        localStorage.setItem(REFRESH_TOKEN_KEY, nextRefreshToken)
        localStorage.setItem(TOKEN_EXPIRES_AT_KEY, String(Date.now() + expires_in * 1000))
      } catch {
        // localStorage may throw in private mode / quota; non-fatal for the refresh itself.
      }

      return {
        accessToken: access_token,
        refreshToken: nextRefreshToken,
        expiresIn: expires_in,
      }
    } finally {
      inflight = null
    }
  })()

  inflight = { promise }
  return promise
}
