import { createClient } from '@/lib/supabase/server'
import { ProfilePageClient } from '@/components/profile/ProfilePageClient'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single()

  return <ProfilePageClient profile={profile} userEmail={user!.email!} />
}
