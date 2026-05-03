import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import { supabaseAdmin } from '../config/supabase'
import { env } from '../config/env'

function adminApp() {
  if (getApps().length > 0) return getApps()[0]
  return initializeApp({ credential: cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON)) })
}

export async function sendPush(
  userId: string,
  title: string,
  body: string,
  url?: string
): Promise<void> {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) return

  const { data: tokens } = await supabaseAdmin
    .from('push_tokens')
    .select('id, token, platform')
    .eq('user_id', userId)

  if (!tokens || tokens.length === 0) return

  const messaging = getMessaging(adminApp())
  const invalidIds: string[] = []

  await Promise.all(
    tokens.map(async ({ id, token }: { id: string; token: string; platform: string }) => {
      try {
        await messaging.send({
          token,
          notification: { title, body },
          ...(url ? { webpush: { fcmOptions: { link: url } }, data: { url } } : {}),
        })
      } catch (err: any) {
        if (
          err.code === 'messaging/registration-token-not-registered' ||
          err.code === 'messaging/invalid-registration-token'
        ) {
          invalidIds.push(id)
        } else {
          console.error('[push] FCM send error for token', id, err?.message)
        }
      }
    })
  )

  if (invalidIds.length > 0) {
    await supabaseAdmin.from('push_tokens').delete().in('id', invalidIds)
  }
}
