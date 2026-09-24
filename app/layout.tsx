import './globals.css'
import './cute.css' // 🍡 cute mode — remove this line to go back to the plain look
import type { Metadata, Viewport } from 'next'
import Nav from './_components/Nav'
import BottomNav from './_components/BottomNav'
import ConnStatus from './_components/ConnStatus'
import SyncAll from './_components/SyncAll'
import { getPendingCount } from '@/lib/records'
import { lockMode } from '@/lib/session'

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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" />
      </head>
      <body>
        <div className="app">
          {/* Desktop sidebar — hidden on phones (BottomNav takes over ≤768px). */}
          <aside className="side">
            <div className="brand"><img className="logo" src="/icons/icon-192.png" alt="" width={24} height={24} style={{ borderRadius: 6, verticalAlign: '-6px' }} /> Okmaya</div>
            {/* 단청 — the temple-eave colour band, in the five cardinal colours. */}
            <div className="dancheong" aria-hidden="true" />
            <Nav pendingCount={pending} />
            <p className="hint">One <code>records</code> table behind every tab. Your robots live in <code>agents/</code>.</p>
            {lockMode() !== 'open' ? <p className="hint"><a href="/api/auth/logout">Sign out</a></p> : null}
          </aside>
          <main className="main">
            {/* The secondary logo — 옥마야 in brush hangul with the OKMAYA badge.
                Top right of every page, opposite the sidebar wordmark. Decorative,
                so it carries an empty alt: a screen reader already announced the
                brand in the sidebar, and hearing it twice helps nobody. */}
            <div className="topmark">
              <img src="/icons/okmaya-secondary.png" alt="" width={230} height={66} />
            </div>
            <ConnStatus />
            <SyncAll />
            {children}
          </main>
        </div>
        {/* 🐱 Abang, the mascot — decorative, says a little hello by time of day. */}
        <div className="mascot" aria-hidden="true">
          <span className="bubble">{greeting()}</span>
          <span className="cat">🐱</span>
        </div>
        {/* Phone bottom bar — hidden on desktop. */}
        <BottomNav />
      </body>
    </html>
  )
}

// Malaysia time, so "Selamat pagi" at 8am KL, not at 8am UTC.
function greeting(): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kuala_Lumpur' }).format(new Date()))
  if (h < 12) return 'Selamat pagi! 안녕~ Let’s sell lots today ✨'
  if (h < 17) return 'Makan dah? 🍜 Keep going, you’re doing great!'
  if (h < 21) return 'Good evening! 🌙 Check what sold today~'
  return 'Rest well ya 💤 Abang will watch the shop!'
}
