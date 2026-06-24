import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AppInfo {
  name: string;
  version: string;
  icon: string | null;
  developer: string | null;
  packageId: string;
}

async function fetchPlayStorePage(packageId: string): Promise<string> {
  const url = `https://play.google.com/store/apps/details?id=${packageId}&hl=en&gl=US`;
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    },
    next: { revalidate: 0 },
  });

  if (response.status === 404) throw new Error('APP_NOT_FOUND');
  if (!response.ok) throw new Error(`HTTP_${response.status}`);

  return response.text();
}

function parseAppInfo(html: string, packageId: string): AppInfo {
  let name: string | null = null;
  let version: string | null = null;
  let icon: string | null = null;
  let developer: string | null = null;

  // 1. Try JSON-LD (most reliable)
  const jsonLdMatches = html.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
  );
  for (const match of jsonLdMatches) {
    try {
      const data = JSON.parse(match[1]);
      if (data['@type'] === 'SoftwareApplication') {
        name = data.name ?? null;
        version = data.softwareVersion ?? null;
        icon = data.image ?? null;
        developer = data.author?.name ?? null;
        break;
      }
    } catch {
      // try next match
    }
  }

  // 2. Fallback: title tag
  if (!name) {
    const titleMatch = html.match(
      /<title>([^<]+?)(?: - Apps on Google Play)?<\/title>/i,
    );
    name = titleMatch ? titleMatch[1].trim() : null;
  }

  // 3. Fallback: og:title
  if (!name) {
    const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/);
    name = ogTitle ? ogTitle[1].trim() : null;
  }

  // 4. Fallback version patterns in page data
  if (!version) {
    const versionPatterns = [
      /"softwareVersion":"([^"]+)"/,
      /itemprop="softwareVersion"[^>]*>\s*([^\s<][^<]*?)\s*<\/span>/,
      /\bCurrent Version\b[\s\S]{0,200}?<span[^>]*>\s*([0-9][^\s<]+)\s*<\/span>/i,
    ];
    for (const pattern of versionPatterns) {
      const m = html.match(pattern);
      if (m) {
        version = m[1].trim();
        break;
      }
    }
  }

  // 5. Fallback icon from og:image
  if (!icon) {
    const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/);
    icon = ogImage ? ogImage[1] : null;
  }

  if (!name) name = packageId;
  if (!version) throw new Error('VERSION_NOT_FOUND');

  return { name, version, icon, developer, packageId };
}

function extractPackageId(input: string): string | null {
  input = input.trim();
  // Direct package ID: com.example.app
  if (/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(input)) {
    return input;
  }
  // Play Store URL
  try {
    const url = new URL(input);
    if (url.hostname.includes('play.google.com')) {
      return url.searchParams.get('id');
    }
  } catch {
    // not a valid URL
  }
  return null;
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('packageId') ?? '';
  const packageId = extractPackageId(raw) ?? raw;

  if (!packageId) {
    return NextResponse.json({ error: 'Package ID is required' }, { status: 400 });
  }

  try {
    const html = await fetchPlayStorePage(packageId);
    const info = parseAppInfo(html, packageId);
    return NextResponse.json(info);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    if (msg === 'APP_NOT_FOUND') {
      return NextResponse.json(
        { error: 'App not found on the Play Store' },
        { status: 404 },
      );
    }
    if (msg === 'VERSION_NOT_FOUND') {
      return NextResponse.json(
        { error: 'Could not extract version from the Play Store page' },
        { status: 422 },
      );
    }

    console.error('[check-version]', msg);
    return NextResponse.json(
      { error: 'Failed to fetch app information' },
      { status: 500 },
    );
  }
}
