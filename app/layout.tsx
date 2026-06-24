import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Android App Update Checker',
  description: 'Monitor Android app updates from the Google Play Store',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it">
      <body className="bg-slate-50 min-h-screen">{children}</body>
    </html>
  );
}
