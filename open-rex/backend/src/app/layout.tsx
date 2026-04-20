import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Open Rex',
  description: 'Dealership customer-database reactivation agent',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="max-w-6xl mx-auto px-6 py-8">
          <header className="mb-8 flex items-center justify-between">
            <h1 className="text-2xl font-semibold">Open Rex</h1>
            <nav className="flex gap-6 text-sm">
              <a href="/" className="hover:underline">Dashboard</a>
              <a href="/customers" className="hover:underline">Customers</a>
              <a href="/drafts" className="hover:underline">Drafts</a>
            </nav>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
