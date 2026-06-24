import { createHash } from 'crypto';
import type { SourceType } from './storage';

export interface AppInfo {
  name: string;
  version: string;
  icon: string | null;
  developer: string | null;
  packageId: string;
  sourceType: SourceType;
}

export interface DetectedSource {
  type: SourceType;
  id: string;
}

// ─── Source detection ─────────────────────────────────────────────────────────

export function detectSource(input: string): DetectedSource | null {
  input = input.trim();

  // Play Store URL
  if (input.includes('play.google.com')) {
    try {
      const url = new URL(input);
      const id = url.searchParams.get('id');
      if (id) return { type: 'android', id };
    } catch { /* not a valid URL */ }
  }

  // Android package ID  e.g. com.example.app (no dots in a pure domain won't match)
  if (/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(input)) {
    return { type: 'android', id: input };
  }

  // Apple App Store URL  e.g. https://apps.apple.com/us/app/name/id310633997
  if (input.includes('apps.apple.com') || input.includes('itunes.apple.com')) {
    const match = input.match(/\/id(\d+)/);
    if (match) return { type: 'ios', id: match[1] };
  }

  // Any other HTTP/HTTPS URL → web change detection
  try {
    const url = new URL(input);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return { type: 'web', id: input };
    }
  } catch { /* not a valid URL */ }

  return null;
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

export async function getAppInfo(type: SourceType, id: string): Promise<AppInfo> {
  switch (type) {
    case 'android': return getAndroidInfo(id);
    case 'ios':     return getIosInfo(id);
    case 'web':     return getWebInfo(id);
  }
}

// Android — via google-play-scraper
async function getAndroidInfo(packageId: string): Promise<AppInfo> {
  const { default: gplay } = await import('google-play-scraper');
  const info = await gplay.app({ appId: packageId, lang: 'en', country: 'us' });
  const version = info.version && info.version !== 'Varies with device' ? info.version : null;
  if (!version) throw new Error('VERSION_NOT_FOUND');
  return {
    name: info.title,
    version,
    icon: info.icon ?? null,
    developer: info.developer ?? null,
    packageId,
    sourceType: 'android',
  };
}

// iOS — iTunes Search API (no auth needed, no scraping)
async function getIosInfo(appId: string): Promise<AppInfo> {
  const res = await fetch(
    `https://itunes.apple.com/lookup?id=${encodeURIComponent(appId)}&country=us`,
    { cache: 'no-store' },
  );
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  const data = (await res.json()) as {
    results?: Array<{
      trackName: string;
      version: string;
      artworkUrl512?: string;
      artworkUrl100?: string;
      artistName?: string;
    }>;
  };
  if (!data.results?.length) throw new Error('APP_NOT_FOUND');
  const app = data.results[0];
  return {
    name: app.trackName,
    version: app.version,
    icon: app.artworkUrl512 ?? app.artworkUrl100 ?? null,
    developer: app.artistName ?? null,
    packageId: appId,
    sourceType: 'ios',
  };
}

// Web — content hash (scripts/styles stripped for stability)
function hashContent(html: string): string {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha256').update(cleaned).digest('hex').slice(0, 12);
}

async function getWebInfo(url: string): Promise<AppInfo> {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  const html = await res.text();
  const hash = hashContent(html);

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const hostname = new URL(url).hostname;
  const name = titleMatch ? titleMatch[1].trim().slice(0, 100) : hostname;

  return {
    name,
    version: hash,
    icon: null,
    developer: hostname,
    packageId: url,
    sourceType: 'web',
  };
}
