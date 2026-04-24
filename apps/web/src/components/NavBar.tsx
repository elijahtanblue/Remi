'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/queue',     label: 'Queue' },
  { href: '/approvals', label: 'Approvals' },
  { href: '/settings',  label: 'Settings' },
];

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav style={styles.nav}>
      <div style={styles.inner}>
        <span style={styles.brand}>Remi</span>
        <div style={styles.links}>
          {links.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                style={{ ...styles.link, ...(active ? styles.linkActive : {}) }}
              >
                {label}
              </Link>
            );
          })}
        </div>
        <form action="/auth/logout" method="POST">
          <button type="submit" style={styles.logout}>Sign out</button>
        </form>
      </div>
    </nav>
  );
}

const styles: Record<string, React.CSSProperties> = {
  nav: {
    background: 'var(--remi-surface)',
    borderBottom: '1px solid var(--remi-border)',
    position: 'sticky',
    top: 0,
    zIndex: 100,
  },
  inner: {
    maxWidth: 1280,
    margin: '0 auto',
    padding: '0 28px',
    height: 52,
    display: 'flex',
    alignItems: 'center',
    gap: 32,
  },
  brand: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--remi-navy)',
    letterSpacing: '-0.3px',
    marginRight: 8,
  },
  links: {
    display: 'flex',
    gap: 4,
    flex: 1,
  },
  link: {
    padding: '5px 12px',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--remi-muted)',
    textDecoration: 'none',
    transition: 'background 0.1s, color 0.1s',
  },
  linkActive: {
    background: 'var(--remi-blue-faint)',
    color: 'var(--remi-blue)',
  },
  logout: {
    background: 'none',
    border: 'none',
    fontSize: 13,
    color: 'var(--remi-muted)',
    cursor: 'pointer',
    padding: '5px 8px',
    borderRadius: 6,
  },
};
