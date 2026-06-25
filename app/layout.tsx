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

// Inline script: runs before React, before CSS, before any paint.
// Detects Chrome "Desktop site" viewport inflation on touch devices and
// reloads once. Uses performance.navigation.type to avoid infinite loops
// (type===1 means this IS already a reload → skip check).
const viewportFixScript = `(function(){try{
  var nav=performance.navigation;
  var isReload=nav?nav.type===1:((performance.getEntriesByType('navigation')[0]||{}).type==='reload');
  if(isReload)return;
  if(navigator.maxTouchPoints>0&&Math.min(screen.width,screen.height)<640&&window.innerWidth>700)
    location.reload();
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <head>
        {/* biome-ignore lint: intentional inline script for mobile viewport fix */}
        <script dangerouslySetInnerHTML={{ __html: viewportFixScript }} />
      </head>
      <body className="bg-slate-50 min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
