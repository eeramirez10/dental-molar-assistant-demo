import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import SidebarNav from '@/app/sidebar-nav';
import Topbar from '@/app/topbar';

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
          <div className="app-frame">
            <aside id="sidebarMenu" className="volt-sidebar" aria-label="Navegación lateral">
              <div className="volt-sidebar__inner">
                <ul className="volt-nav">
                  <SidebarNav />
                </ul>
              </div>
            </aside>

            <div className="app-content">
              <Topbar />
              {children}
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
