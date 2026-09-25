import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth/AuthContext';

/**
 * Deux espaces pour deux publics : « Direction » répond à « est-ce que tout va bien ? »,
 * « Technique » donne de quoi diagnostiquer et corriger.
 */
const SECTIONS = [
  {
    title: 'Direction',
    items: [
      { to: '/', label: "Vue d'ensemble", end: true },
      { to: '/rapport', label: 'Rapport hebdomadaire' },
    ],
  },
  {
    title: 'Technique',
    items: [
      { to: '/technique/equipements', label: 'Équipements' },
      { to: '/technique/evenements', label: 'Événements' },
      { to: '/technique/a-identifier', label: 'Machines à identifier' },
      { to: '/technique/scans', label: 'Scans' },
      { to: '/technique/reglages', label: 'Réglages' },
    ],
  },
];

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">NetWatch</div>

        {SECTIONS.map((section) => (
          <nav key={section.title}>
            <span className="nav-title">{section.title}</span>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        ))}

        <div className="sidebar-footer">
          <span className="muted">{user?.displayName}</span>
          <button type="button" className="btn btn-small" onClick={() => void logout()}>
            Se déconnecter
          </button>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
