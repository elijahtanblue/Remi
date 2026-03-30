'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/integrations', label: 'Integrations' },
  { href: '/workspaces', label: 'Workspaces' },
  { href: '/summaries', label: 'Summaries' },
  { href: '/dead-letters', label: 'Dead Letters' },
  { href: '/audit-log', label: 'Audit Log' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/memory', label: 'Memory' },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        background: 'var(--remi-navy)',
        borderBottom: '2px solid var(--remi-navy-deep)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <div
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '0 28px',
          display: 'flex',
          alignItems: 'center',
          height: '52px',
          gap: '8px',
        }}
      >
        {/* Brand lockup */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', marginRight: '28px', flexShrink: 0 }}>
          <span style={{ fontSize: '17px', fontWeight: 700, color: '#ffffff', fontFamily: 'var(--remi-serif)', letterSpacing: '-0.01em' }}>
            Remi
          </span>
          <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.48)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 500 }}>
            Admin
          </span>
        </div>

        {/* Nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flex: 1, overflowX: 'auto' }}>
          {links.map(({ href, label }) => {
            const isActive =
              href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                style={{
                  padding: '6px 12px',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? '#ffffff' : 'rgba(255,255,255,0.62)',
                  textDecoration: 'none',
                  borderRadius: '6px',
                  background: isActive ? 'rgba(255,255,255,0.14)' : 'transparent',
                  transition: 'background 0.12s, color 0.12s',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </Link>
            );
          })}
        </div>

        {/* Badge */}
        <span
          style={{
            fontSize: '11px',
            background: 'rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.62)',
            padding: '2px 10px',
            borderRadius: '12px',
            fontWeight: 500,
            flexShrink: 0,
            border: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          Internal
        </span>
      </div>
    </nav>
  );
}
