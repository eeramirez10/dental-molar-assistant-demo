import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import SidebarNav from '@/app/sidebar-nav';

import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Dental La Molar Assistant Demo',
  description: 'Panel demo para agenda dental con citas, disponibilidad y flujo interactivo.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <div className="app-shell">
          <header className="topbar">
            <div className="topbar__inner">
              <div className="brand-block">
                <div className="brand-mark">🦷</div>
                <div>
                  <p className="brand-eyebrow">Dental La Molar</p>
                  <strong className="brand-title">Admin Dashboard</strong>
                </div>
              </div>

            </div>
          </header>

          <div className="app-frame">
            <aside id="sidebarMenu" className="volt-sidebar" aria-label="Sidebar navigation">
              <div className="volt-sidebar__inner">
                <ul className="volt-nav">
                  <SidebarNav />
                </ul>
              </div>
            </aside>

            <div className="app-content">{children}</div>
          </div>
        </div>
      </body>
    </html>
  );
}
