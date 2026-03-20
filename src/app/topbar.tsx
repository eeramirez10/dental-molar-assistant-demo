'use client';

import { useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';

const pageLabels: Record<string, string> = {
  '/': 'Resumen',
  '/appointments': 'Citas',
  '/booking': 'Nueva cita',
  '/services': 'Servicios',
  '/conversations': 'Conversaciones',
};

export default function Topbar() {
  const pathname = usePathname();
  const [query, setQuery] = useState('');

  const title = useMemo(() => pageLabels[pathname] ?? 'Panel', [pathname]);

  return (
    <div className="topbar-volt">
      <div className="topbar-volt__search">
        <span className="topbar-volt__search-icon">⌕</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Buscar en ${title.toLowerCase()}`}
          aria-label="Buscar"
        />
      </div>

      <div className="topbar-volt__actions">
        <button className="topbar-volt__icon-btn" type="button" aria-label="Notificaciones">
          🔔
        </button>
        <div className="topbar-volt__profile">
          <div className="topbar-volt__avatar">DL</div>
          <div>
            <div className="topbar-volt__name">Dental La Molar</div>
            <div className="topbar-volt__role">{title}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
