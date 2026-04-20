import './globals.css';
import type { ReactNode } from 'react';
import Sidebar from './Sidebar';

export const metadata = {
  title: 'Open Rex',
  description: 'Dealership customer-database reactivation agent',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 min-w-0 min-h-screen">{children}</main>
        </div>
      </body>
    </html>
  );
}
