import type { Metadata, Viewport } from 'next';
import './globals.css';
import Providers from '@/components/Providers';

export const metadata: Metadata = {
  title: 'Update Checker',
  description: 'Monitor Android, iOS and web updates — get email alerts when changes are detected',
};

// Forces the browser to use the real device width instead of a virtual
// desktop viewport — prevents Chrome mobile from defaulting to desktop mode.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
