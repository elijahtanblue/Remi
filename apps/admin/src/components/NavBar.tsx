'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/integrations', label: 'Integrations' },
  { href: '/workspaces', label: 'Workspaces' },
  { href: '/errors', label: 'Errors' },
  { href: '/analytics', label: 'Analytics' },
];

function isActivePath(pathname: string, href: string) {
  if (href === '/') {
    return pathname === '/';
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="top-nav">
      <div className="top-nav__inner">
        {/* Brand lockup */}
        <div className="top-nav__brand">
          <Image
            src="/brand/remi%20square%20light%20-%20no%20text.png"
            alt="Remi"
            width={40}
            height={40}
            className="top-nav__brand-mark"
          />
          <div className="top-nav__brand-text">
            <span className="top-nav__brand-wordmark">
              Remi
            </span>
            <span className="top-nav__brand-label">
              Admin
            </span>
          </div>
        </div>

        {/* Nav links */}
        <div className="top-nav__links">
          {links.map(({ href, label }) => {
            const isActive = isActivePath(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={`top-nav__link${isActive ? ' is-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
