import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const path = body.path
  if (!path || typeof path !== 'string') {
    return new NextResponse(null, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse(null, { status: 401 })

  await supabase.from('page_views').insert({ user_id: user.id, path })
  return new NextResponse(null, { status: 204 })
}
