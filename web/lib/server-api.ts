import { createClient } from './supabase/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export async function serverFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  const res = await fetch(
    `${API_URL}/api/v1${path}`,
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
