import './globals.css'
import type { Metadata, Viewport } from 'next'
import Nav from './_components/Nav'
import BottomNav from './_components/BottomNav'
import ConnStatus from './_components/ConnStatus'
import { getPendingCount } from '@/lib/records'

export const metadata: Metadata = {
  title: 'Okmaya',
  description: 'Your Money Robot — one AI HQ for the whole business.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Okmaya', statusBarStyle: 'default' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
}

// theme-color drives the phone status-bar tint when installed to the home screen.
export const viewport: Viewport = {
  themeColor: '#FAF7F2',
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pending = await getPendingCount()
  return (
    <html lang="en">
      <body>
        <div className="app">
          {/* Desktop sidebar — hidden on phones (BottomNav takes over ≤768px). */}
          <aside className="side">
            <div className="brand"><img className="logo" src="/icons/icon-192.png" alt="" width={24} height={24} style={{ borderRadius: 6, verticalAlign: '-6px' }} /> Okmaya</div>
            <Nav pendingCount={pending} />
            <p className="hint">One <code>records</code> table behind every tab. Your robots live in <code>agents/</code>.</p>
          </aside>
          <main className="main"><ConnStatus />{children}</main>
        </div>
        {/* Phone bottom bar — hidden on desktop. */}
        <BottomNav />
      </body>
    </html>
  )
}
