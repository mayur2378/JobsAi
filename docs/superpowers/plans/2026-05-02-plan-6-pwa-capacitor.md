# PWA + Capacitor Setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PWA support (manifest + service worker) to the Next.js app and configure Capacitor to wrap the deployed web app as an Android APK for Google Play.

**Architecture:** The Next.js app gains a `manifest.json` and `sw.js` in `public/`, enabling browser-based PWA install on Android Chrome. Capacitor is configured in `server.url` mode — the Android shell loads the live deployed URL in a WebView, so there is no static export and no code duplication. Plan 7 (push notifications) depends on the service worker and `android/` project created here.

**Tech Stack:** Next.js 14.2, `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`

---

### File Map

| File | Action | Purpose |
|------|--------|---------|
| `web/public/manifest.json` | Create | PWA manifest (name, icons, display mode) |
| `web/public/icons/icon-192.svg` | Create | PWA home screen icon (small) |
| `web/public/icons/icon-512.svg` | Create | PWA splash screen icon (large) |
| `web/public/sw.js` | Create | Service worker: caching + push event stub for Plan 7 |
| `web/components/pwa/ServiceWorkerRegistration.tsx` | Create | Client component that registers sw.js on mount |
| `web/app/layout.tsx` | Modify | Add manifest metadata + ServiceWorkerRegistration |
| `web/capacitor.config.ts` | Create | Capacitor config pointing at deployed URL |
| `web/package.json` | Modify | Add @capacitor/core, @capacitor/cli, @capacitor/android |
| `web/android/` | Create (generated) | Capacitor Android Gradle project |
| `.gitignore` | Modify | Exclude Android build artifacts |

---

### Task 1: Create PWA icons and manifest

**Files:**
- Create: `web/public/icons/icon-192.svg`
- Create: `web/public/icons/icon-512.svg`
- Create: `web/public/manifest.json`

- [ ] **Step 1: Create the icon directory**

```bash
mkdir -p web/public/icons
```

- [ ] **Step 2: Create the 192px icon**

Create `web/public/icons/icon-192.svg` with this exact content:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="192" height="192">
  <rect width="192" height="192" rx="40" fill="#0f0c1a"/>
  <rect x="16" y="16" width="160" height="160" rx="28" fill="none" stroke="#7c3aed" stroke-width="3"/>
  <text x="96" y="120" font-family="monospace" font-size="80" font-weight="bold" fill="#a78bfa" text-anchor="middle">JT</text>
</svg>
```

- [ ] **Step 3: Create the 512px icon**

Create `web/public/icons/icon-512.svg` with this exact content:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="100" fill="#0f0c1a"/>
  <rect x="40" y="40" width="432" height="432" rx="72" fill="none" stroke="#7c3aed" stroke-width="8"/>
  <text x="256" y="320" font-family="monospace" font-size="208" font-weight="bold" fill="#a78bfa" text-anchor="middle">JT</text>
</svg>
```

- [ ] **Step 4: Create manifest.json**

Create `web/public/manifest.json` with this exact content:

```json
{
  "name": "JobTrack AI",
  "short_name": "JobTrack",
  "description": "AI-powered job application tracker",
  "start_url": "/dashboard",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#0f0c1a",
  "background_color": "#0f0c1a",
  "icons": [
    {
      "src": "/icons/icon-192.svg",
      "sizes": "192x192",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512.svg",
      "sizes": "512x512",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}
```

- [ ] **Step 5: Verify files are in place**

```bash
ls web/public/manifest.json web/public/icons/icon-192.svg web/public/icons/icon-512.svg
```

Expected: all three files listed with no errors.

- [ ] **Step 6: Commit**

```bash
git add web/public/
git commit -m "feat: add PWA manifest and app icons"
```

---

### Task 2: Create the service worker

**Files:**
- Create: `web/public/sw.js`

The service worker caches static assets for offline resilience and stubs out the `push` event so Plan 7 can wire it up without modifying this file.

- [ ] **Step 1: Create web/public/sw.js**

```javascript
const CACHE_NAME = 'jobtrack-v1'
const STATIC_ASSETS = ['/icons/icon-192.svg', '/icons/icon-512.svg', '/manifest.json']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Cache-first for icons, fonts, and other static assets
  if (
    request.destination === 'image' ||
    request.destination === 'font'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    )
    return
  }

  // Network-first for navigation and API calls
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  )
})

// Push event — Plan 7 adds firebase-messaging-sw.js for FCM;
// this handler covers any generic push messages sent directly to this SW.
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
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
  const url = '/dashboard'
  event.waitUntil(clients.openWindow(url))
})
```

- [ ] **Step 2: Verify file exists**

```bash
ls web/public/sw.js
```

Expected: `sw.js` listed.

- [ ] **Step 3: Commit**

```bash
git add web/public/sw.js
git commit -m "feat: add PWA service worker"
```

---

### Task 3: Wire manifest and service worker into the Next.js app

**Files:**
- Create: `web/components/pwa/ServiceWorkerRegistration.tsx`
- Modify: `web/app/layout.tsx`

- [ ] **Step 1: Create ServiceWorkerRegistration component**

Create `web/components/pwa/ServiceWorkerRegistration.tsx`:

```tsx
'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.error('[SW] Registration failed:', err)
      })
    }
  }, [])

  return null
}
```

- [ ] **Step 2: Read the current root layout**

Read `web/app/layout.tsx` — note the exact structure before editing. Current content is:

```tsx
import type { Metadata } from 'next'
import { Fira_Code, Fira_Sans } from 'next/font/google'
import './globals.css'

// ... font setup ...

export const metadata: Metadata = {
  title: 'JobTrack AI',
  description: 'AI-powered job search and application tracker',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`antialiased ${firaCode.variable} ${firaSans.variable}`}>
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Update web/app/layout.tsx**

Replace the entire file with:

```tsx
import type { Metadata, Viewport } from 'next'
import { Fira_Code, Fira_Sans } from 'next/font/google'
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration'
import './globals.css'

const firaCode = Fira_Code({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-fira-code',
  display: 'swap',
})

const firaSans = Fira_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-fira-sans',
  display: 'swap',
})

export const viewport: Viewport = {
  themeColor: '#0f0c1a',
}

export const metadata: Metadata = {
  title: 'JobTrack AI',
  description: 'AI-powered job search and application tracker',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'JobTrack AI',
    statusBarStyle: 'black-translucent',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`antialiased ${firaCode.variable} ${firaSans.variable}`}>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 4: Build to verify no TypeScript errors**

```bash
cd web && npm run build
```

Expected: build succeeds, no errors. `Viewport` is available in Next.js 14.2 — if you see "Module not found" for `Viewport`, your Next.js version may be older; fall back to removing the `Viewport` import and adding `export const viewport = { themeColor: '#0f0c1a' }` without the type annotation.

- [ ] **Step 5: Commit**

```bash
git add web/components/pwa/ServiceWorkerRegistration.tsx web/app/layout.tsx
git commit -m "feat: add manifest and service worker registration to root layout"
```

---

### Task 4: Install and configure Capacitor

**Files:**
- Create: `web/capacitor.config.ts`
- Modify: `web/package.json`

- [ ] **Step 1: Install Capacitor packages**

```bash
cd web && npm install @capacitor/core && npm install --save-dev @capacitor/cli
```

Expected: packages install without peer dependency errors.

- [ ] **Step 2: Create capacitor.config.ts**

Create `web/capacitor.config.ts`:

```typescript
import type { CapacitorConfig } from '@capacitor/cli'

const serverUrl =
  process.env.CAPACITOR_SERVER_URL ??
  (process.env.NODE_ENV === 'production'
    ? process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-deployed-app.vercel.app'
    : 'http://10.0.2.2:3000')

const config: CapacitorConfig = {
  appId: 'com.jobtrack.ai',
  appName: 'JobTrack AI',
  webDir: 'public',
  server: {
    url: serverUrl,
    cleartext: serverUrl.startsWith('http://'),
  },
}

export default config
```

Note: `10.0.2.2` is the Android emulator's localhost alias. When building for Google Play, set `NEXT_PUBLIC_APP_URL` to your production URL (e.g. `https://jobtrack-ai.vercel.app`) before running `cap sync`.

- [ ] **Step 3: Verify Capacitor CLI is available**

```bash
cd web && npx cap --version
```

Expected: prints Capacitor CLI version (e.g. `6.x.x`).

- [ ] **Step 4: Commit**

```bash
git add web/capacitor.config.ts web/package.json web/package-lock.json
git commit -m "feat: install Capacitor and add config"
```

---

### Task 5: Add the Android platform

**Files:**
- Create: `web/android/` (Capacitor-generated Gradle project)
- Create: `web/android/app/google-services.json.example`
- Modify: `.gitignore`

- [ ] **Step 1: Install @capacitor/android**

```bash
cd web && npm install @capacitor/android
```

- [ ] **Step 2: Add the Android platform**

```bash
cd web && npx cap add android
```

Expected: creates `web/android/` directory containing a Gradle project. Takes ~30 seconds.

- [ ] **Step 3: Update the root .gitignore to exclude Android build artifacts**

Open `.gitignore` in the project root and add these lines at the end:

```
# Capacitor Android build artifacts
web/android/app/build/
web/android/build/
web/android/.gradle/
web/android/local.properties
web/android/app/google-services.json
```

Note: The entire `web/android/` directory is tracked (Gradle project files are needed for CI/CD). Only build outputs and secrets are excluded.

- [ ] **Step 4: Create a placeholder for google-services.json**

Create `web/android/app/google-services.json.example`:

```json
{
  "_instructions": "Download google-services.json from Firebase Console → Project Settings → Your Android App (com.jobtrack.ai). Place it here as google-services.json. Do not commit the real file."
}
```

- [ ] **Step 5: Do an initial sync**

```bash
cd web && npx cap sync android
```

Expected: sync completes. You may see a warning about missing `google-services.json` — this is expected until Plan 7 sets up Firebase.

- [ ] **Step 6: Commit**

```bash
git add web/android/ web/android/app/google-services.json.example .gitignore
git commit -m "feat: add Capacitor Android platform"
```

---

### Manual verification

After Plan 6 is complete, verify PWA install works in Chrome:

1. Run `cd web && npm run dev`
2. Open `http://localhost:3000` in Chrome
3. Open DevTools → Application → Service Workers — confirm `sw.js` is registered
4. Open Application → Manifest — confirm `manifest.json` loads with correct icons
5. In Chrome on Android (or emulator), open the URL and check for "Add to Home Screen" banner
