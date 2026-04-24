import type { Metadata } from 'next';
import './globals.css';
import NavBar from '@/components/NavBar';

export const metadata: Metadata = {
  title: 'Remi — Work Queue',
  description: 'Operational coordination platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NavBar />
        <main style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 28px' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
