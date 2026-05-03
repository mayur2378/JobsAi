import { createClient } from './supabase/client'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

// Warn at startup if a non-HTTPS URL is used outside of localhost — data is transmitted in plaintext
if (
  typeof window !== 'undefined' &&
  API_URL.startsWith('http://') &&
  !API_URL.includes('localhost') &&
  !API_URL.includes('127.0.0.1')
) {
  console.warn('[api] WARNING: NEXT_PUBLIC_API_URL is using HTTP on a non-localhost host. All data including auth tokens will be transmitted in plaintext. Set NEXT_PUBLIC_API_URL to an HTTPS URL in production.')
}

async function getToken(): Promise<string | null> {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

export class ApiAuthError extends Error {
  constructor() {
    super('Not authenticated')
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken()
  if (!token) throw new ApiAuthError()
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${API_URL}/api/v1${path}`, { ...options, headers })
  const json = await res.json().catch(() => ({} as Record<string, unknown>))
  if (!res.ok) throw new Error((json.error as string | undefined) ?? `HTTP ${res.status}`)
  if (res.status === 204) return undefined as T
  return json.data as T
}

