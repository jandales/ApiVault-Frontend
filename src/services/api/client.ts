/**
 * Access token lives in module memory only (never localStorage). The refresh token is an
 * HttpOnly cookie the script cannot read; /auth/refresh restores the session after a reload.
 */
const BASE = import.meta.env.VITE_API_URL ?? ''

let accessToken: string | null = null
let refreshing: Promise<boolean> | null = null

export const setAccessToken = (t: string | null) => {
  accessToken = t
}

export class ApiError extends Error {
  status: number
  details: string[]
  constructor(status: number, message: string, details: string[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

export interface AuthResponse {
  accessToken: string
  expiresAt: string
  user: { id: string; email: string; emailConfirmed: boolean }
}

async function rawFetch(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  return fetch(`${BASE}/api/v1${path}`, { ...init, headers, credentials: 'include' })
}

/** Single-flight refresh so parallel 401s do not trigger rotation-reuse detection. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${BASE}/api/v1/auth/refresh`, { method: 'POST', credentials: 'include' })
      if (!res.ok) {
        accessToken = null
        return false
      }
      accessToken = ((await res.json()) as AuthResponse).accessToken
      return true
    } catch {
      return false
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

export async function api<T = void>(path: string, init: RequestInit = {}, canRetry = true): Promise<T> {
  let res = await rawFetch(path, init)
  if (res.status === 401 && canRetry && !path.startsWith('/auth/') && (await refreshSession())) {
    res = await rawFetch(path, init)
  }
  if (!res.ok) {
    let title = `Request failed (${res.status})`
    let details: string[] = []
    try {
      const p = (await res.json()) as { title?: string; errors?: string[] }
      title = p.title ?? title
      details = p.errors ?? []
    } catch {
      /* no body */
    }
    throw new ApiError(res.status, title, details)
  }
  if (res.status === 204 || res.status === 202) return undefined as T
  return (await res.json()) as T
}

export const post = <T = void>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
