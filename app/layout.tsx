import type { Metadata } from 'next';
import './globals.css';
import Providers from '@/components/Providers';

export const metadata: Metadata = {
  title: 'Update Checker',
  description: 'Monitor Android, iOS and web updates — get email alerts when changes are detected',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="bg-slate-50 min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
