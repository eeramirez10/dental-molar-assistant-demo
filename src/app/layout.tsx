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

const navItems = [
  { href: '#overview', label: 'Resumen', icon: '🏠' },
  { href: '#appointments', label: 'Citas', icon: '📅' },
  { href: '#booking', label: 'Nueva cita', icon: '➕' },
  { href: '#services', label: 'Servicios', icon: '🦷' },
];

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

              <nav className="topnav" aria-label="Navegación principal superior">
                {navItems.map((item) => (
                  <a key={item.href} href={item.href}>
                    {item.label}
                  </a>
                ))}
              </nav>
            </div>
          </header>

          <div className="app-frame">
            <aside className="sidebar" aria-label="Sidebar de navegación">
              <div className="sidebar__card">
                <p className="sidebar__eyebrow">Navegación</p>
                <nav className="sidebar__nav">
                  {navItems.map((item) => (
                    <a key={item.href} href={item.href} className="sidebar__link">
                      <span aria-hidden="true">{item.icon}</span>
                      <span>{item.label}</span>
                    </a>
                  ))}
                </nav>
              </div>

              <div className="sidebar__card sidebar__card--muted">
                <p className="sidebar__eyebrow">Estado</p>
                <p className="sidebar__text">Demo dental en Fase 2.1 con panel interactivo.</p>
              </div>
            </aside>

            <div className="app-content">{children}</div>
          </div>
        </div>
      </body>
    </html>
  );
}
