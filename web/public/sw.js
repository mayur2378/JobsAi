const CACHE_NAME = 'jobtrack-v1'
const STATIC_ASSETS = ['/icons/icon-192.svg', '/icons/icon-512.svg', '/manifest.json']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (!request.url.startsWith('http')) return

  // Never intercept cross-origin requests (API, Supabase, Firebase, etc.)
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Cache-first for icons, fonts, and other static assets
  if (request.destination === 'image' || request.destination === 'font') {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    )
    return
  }

  // Network-first for navigation; fall back to cache only if a match exists
  event.respondWith(
    fetch(request).catch(() =>
      caches.match(request).then((r) => r ?? new Response('', { status: 503, statusText: 'Offline' }))
    )
  )
})

// Push event — Plan 7 adds firebase-messaging-sw.js for FCM;
// this handler covers any generic push messages sent directly to this SW.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data?.json() ?? {} } catch (_) {}
  const title = data.title ?? 'JobTrack AI'
  const options = {
    body: data.body ?? '',
    icon: '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow('/dashboard'))
})
