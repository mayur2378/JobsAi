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
