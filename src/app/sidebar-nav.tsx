'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Dashboard', icon: '◔' },
  { href: '/appointments', label: 'Appointments', icon: '▦' },
  { href: '/booking', label: 'New Booking', icon: '＋' },
  { href: '/services', label: 'Services', icon: '✦' },
];

export default function SidebarNav() {
  const pathname = usePathname();

  return (
    <>
      <li className="volt-nav__item volt-nav__brand">
        <Link href="/" className="volt-nav__link volt-nav__link--brand">
          <span className="volt-sidebar__logo">🦷</span>
          <span className="volt-sidebar__brand-text">Volt Overview</span>
        </Link>
      </li>

      {navItems.map((item) => (
        <li key={item.href} className={`volt-nav__item ${pathname === item.href ? 'is-active' : ''}`}>
          <Link href={item.href} className="volt-nav__link">
            <span className="volt-nav__icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="volt-nav__text">{item.label}</span>
          </Link>
        </li>
      ))}

      <li className="volt-nav__divider" />

      <li className="volt-nav__item">
        <Link href="/services" className="volt-nav__link">
          <span className="volt-nav__icon" aria-hidden="true">
            ⌘
          </span>
          <span className="volt-nav__text">Documentation</span>
          <span className="volt-badge">v1.4</span>
        </Link>
      </li>

      <li className="volt-nav__item">
        <Link href="/booking" className="volt-nav__link">
          <span className="volt-nav__icon" aria-hidden="true">
            ⚙
          </span>
          <span className="volt-nav__text">Settings</span>
        </Link>
      </li>

      <li className="volt-nav__item volt-nav__item--cta">
        <Link href="/booking" className="volt-upgrade-btn">
          <span className="volt-nav__icon" aria-hidden="true">
            ✨
          </span>
          <span>Upgrade to Pro</span>
        </Link>
      </li>
    </>
  );
}
