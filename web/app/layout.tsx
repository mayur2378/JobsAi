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
