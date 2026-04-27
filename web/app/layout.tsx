import type { Metadata } from 'next'
import { Fira_Code, Fira_Sans } from 'next/font/google'
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
