import { createClient } from './supabase/client'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

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

// Server-side authenticated fetch — only callable from Server Components.
// Uses the SSR Supabase client to get the session token.
export async function serverFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { createClient } = await import('./supabase/server')
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1${path}`,
    {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      cache: 'no-store',
    }
  )

  const json = await res.json().catch(() => ({} as Record<string, unknown>))
  if (!res.ok) throw new Error((json.error as string | undefined) ?? `HTTP ${res.status}`)
  return json.data as T
}
