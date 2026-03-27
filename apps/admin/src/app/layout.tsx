import type { Metadata } from 'next';
import './globals.css';
import NavBar from '@/components/NavBar';

export const metadata: Metadata = {
  title: 'Remi Admin',
  description: 'Remi operational admin dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NavBar />
        <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 28px' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
