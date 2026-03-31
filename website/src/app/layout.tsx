import type { Metadata } from 'next';
import { Fraunces, Manrope } from 'next/font/google';
import './globals.css';
import SiteHeader from '@/components/SiteHeader';

const manrope = Manrope({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'Remi',
  description: 'Remi restores operational context across Slack, Jira, and email.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${fraunces.variable}`}>
      <body className="bg-remi-cream font-sans text-remi-ink antialiased">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
