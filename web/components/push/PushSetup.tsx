'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'

async function registerAndroid(): Promise<void> {
  const { PushNotifications } = await import('@capacitor/push-notifications')
  const { receive } = await PushNotifications.checkPermissions()
  if (receive !== 'granted') {
    const result = await PushNotifications.requestPermissions()
    if (result.receive !== 'granted') return
  }
  await PushNotifications.register()
  PushNotifications.addListener('registration', async ({ value: token }) => {
    await apiFetch('/notifications/register', {
      method: 'POST',
      body: JSON.stringify({ token, platform: 'android' }),
    }).catch(() => {})
  })
}

async function registerWeb(): Promise<void> {
  const { initializeApp, getApps } = await import('firebase/app')
  const { getMessaging, getToken } = await import('firebase/messaging')

  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  }

  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
  const messaging = getMessaging(app)

  const swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')

  const token = await getToken(messaging, {
    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: swRegistration,
  })

  if (token) {
    await apiFetch('/notifications/register', {
      method: 'POST',
      body: JSON.stringify({ token, platform: 'web' }),
    }).catch(() => {})
  }
}

export function PushSetup() {
  const [shown, setShown] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'default') setShown(true)
  }, [])

  async function enable() {
    setShown(false)
    if (Notification.permission !== 'granted') {
      const result = await Notification.requestPermission()
      if (result !== 'granted') return
    }
    try {
      const { Capacitor } = await import('@capacitor/core')
      if (Capacitor.isNativePlatform()) {
        await registerAndroid()
      } else {
        await registerWeb()
      }
    } catch (err) {
      console.error('[PushSetup] Registration error:', err)
    }
  }

  if (!shown || dismissed) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-50 rounded-xl px-4 py-3 flex items-center gap-3 text-sm font-mono shadow-xl"
      style={{ background: '#1a1425', border: '1px solid rgba(139,92,246,0.3)', color: '#e2e8f0', maxWidth: 320 }}
    >
      <span style={{ color: '#a78bfa', fontSize: 16 }}>🔔</span>
      <span className="flex-1" style={{ color: '#cbd5e1' }}>Enable job alerts?</span>
      <button
        onClick={enable}
        className="px-3 py-1 rounded-lg text-xs font-semibold shrink-0"
        style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: '#fff' }}
      >
        Allow
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="text-xs shrink-0"
        style={{ color: '#64748b' }}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}
