import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'QA_APP - Automated QA Agent',
  description: 'AI-powered QA testing agent using Model Context Protocol',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
