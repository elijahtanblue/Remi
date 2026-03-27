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
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        background: '#1a1d23',
        borderBottom: '1px solid #2d3139',
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
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginRight: '24px', flexShrink: 0 }}>
          <span style={{ fontSize: '17px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em' }}>
            Remi
          </span>
          <span style={{ fontSize: '11px', color: '#6e7681', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Admin
          </span>
        </div>

        {/* Nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flex: 1 }}>
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
                  color: isActive ? '#ffffff' : '#8b949e',
                  textDecoration: 'none',
                  borderRadius: '6px',
                  background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                  transition: 'background 0.1s, color 0.1s',
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
            background: 'rgba(212, 237, 218, 0.15)',
            color: '#4caf87',
            padding: '2px 10px',
            borderRadius: '12px',
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          Internal
        </span>
      </div>
    </nav>
  );
}
