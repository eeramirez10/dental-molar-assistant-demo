import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

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
                  <strong className="brand-title">Assistant Demo</strong>
                </div>
              </div>

              <nav className="topnav" aria-label="Navegación principal">
                <a href="#overview">Resumen</a>
                <a href="#appointments">Citas</a>
                <a href="#booking">Nueva cita</a>
                <a href="#services">Servicios</a>
              </nav>
            </div>
          </header>

          {children}
        </div>
      </body>
    </html>
  );
}
