'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMotionValueEvent, useScroll } from 'framer-motion';

export default function SiteHeader() {
  const pathname = usePathname();
  const { scrollY } = useScroll();
  const [lightMode, setLightMode] = useState(pathname !== '/');
  const [threshold, setThreshold] = useState(0);

  useEffect(() => {
    const syncThreshold = () => {
      const nextThreshold = window.innerHeight * 0.8;
      setThreshold(nextThreshold);

      if (pathname !== '/') {
        setLightMode(true);
      } else {
        setLightMode(window.scrollY > nextThreshold);
      }
    };

    syncThreshold();
    window.addEventListener('resize', syncThreshold);
    return () => window.removeEventListener('resize', syncThreshold);
  }, [pathname]);

  useMotionValueEvent(scrollY, 'change', (latest) => {
    if (pathname !== '/') {
      setLightMode(true);
      return;
    }

    setLightMode(latest > threshold);
  });

  return (
    <header
      className={[
        'fixed inset-x-0 top-0 z-50 transition-all duration-500',
        lightMode
          ? 'border-b border-remi-blue/10 bg-remi-cream/88 text-remi-blue shadow-[0_18px_45px_rgba(25,45,69,0.08)] backdrop-blur-xl'
          : 'bg-transparent text-white',
      ].join(' ')}
    >
      <div className="mx-auto flex h-20 w-full max-w-[1280px] items-center justify-between px-5 sm:px-7 lg:px-10">
        <Link href="/" className="relative flex items-center">
          <Image
            src={lightMode ? '/brand/remi-dark-wordmark.png' : '/brand/remi-light-wordmark.png'}
            alt="Remi"
            width={164}
            height={42}
            priority
            className="h-auto w-[122px] sm:w-[146px] lg:w-[164px]"
          />
        </Link>

        <nav className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/#how-it-works"
            className={[
              'rounded-full px-4 py-2 text-sm font-medium transition hover:-translate-y-0.5',
              lightMode
                ? 'text-remi-blue hover:bg-remi-blue/6'
                : 'text-white/80 hover:bg-white/10 hover:text-white',
            ].join(' ')}
          >
            See how it works
          </Link>
          <Link
            href="/contact"
            className={[
              'rounded-full border px-4 py-2 text-sm font-semibold transition hover:-translate-y-0.5',
              lightMode
                ? 'border-remi-blue/15 bg-remi-blue text-white shadow-panel hover:bg-remi-dark'
                : 'border-white/16 bg-white/12 text-white backdrop-blur-md hover:bg-white/20',
            ].join(' ')}
          >
            Request a demo
          </Link>
        </nav>
      </div>
    </header>
  );
}
