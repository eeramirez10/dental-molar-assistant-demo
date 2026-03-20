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
  { href: '#overview', label: 'Dashboard', icon: '◔' },
  { href: '#appointments', label: 'Appointments', icon: '▦' },
  { href: '#booking', label: 'New Booking', icon: '＋' },
  { href: '#services', label: 'Services', icon: '✦' },
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
                  <strong className="brand-title">Admin Dashboard</strong>
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
            <aside id="sidebarMenu" className="volt-sidebar" aria-label="Sidebar navigation">
              <div className="volt-sidebar__inner">
                <ul className="volt-nav">
                  <li className="volt-nav__item volt-nav__brand">
                    <a href="#overview" className="volt-nav__link volt-nav__link--brand">
                      <span className="volt-sidebar__logo">🦷</span>
                      <span className="volt-sidebar__brand-text">Volt Overview</span>
                    </a>
                  </li>

                  {navItems.map((item, index) => (
                    <li key={item.href} className={`volt-nav__item ${index === 0 ? 'is-active' : ''}`}>
                      <a href={item.href} className="volt-nav__link">
                        <span className="volt-nav__icon" aria-hidden="true">
                          {item.icon}
                        </span>
                        <span className="volt-nav__text">{item.label}</span>
                      </a>
                    </li>
                  ))}

                  <li className="volt-nav__divider" />

                  <li className="volt-nav__item">
                    <a href="#services" className="volt-nav__link">
                      <span className="volt-nav__icon" aria-hidden="true">
                        ⌘
                      </span>
                      <span className="volt-nav__text">Documentation</span>
                      <span className="volt-badge">v1.4</span>
                    </a>
                  </li>

                  <li className="volt-nav__item">
                    <a href="#booking" className="volt-nav__link">
                      <span className="volt-nav__icon" aria-hidden="true">
                        ⚙
                      </span>
                      <span className="volt-nav__text">Settings</span>
                    </a>
                  </li>

                  <li className="volt-nav__item volt-nav__item--cta">
                    <a href="#booking" className="volt-upgrade-btn">
                      <span className="volt-nav__icon" aria-hidden="true">
                        ✨
                      </span>
                      <span>Upgrade to Pro</span>
                    </a>
                  </li>
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
