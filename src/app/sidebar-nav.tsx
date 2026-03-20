'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Resumen', icon: '◔' },
  { href: '/appointments', label: 'Citas', icon: '▦' },
  { href: '/booking', label: 'Nueva cita', icon: '＋' },
  { href: '/services', label: 'Servicios', icon: '✦' },
];

export default function SidebarNav() {
  const pathname = usePathname();

  return (
    <>
      <li className="volt-nav__item volt-nav__brand">
        <Link href="/" className="volt-nav__link volt-nav__link--brand">
          <span className="volt-sidebar__logo">🦷</span>
          <span className="volt-sidebar__brand-text">Dental La Molar</span>
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
    </>
  );
}
