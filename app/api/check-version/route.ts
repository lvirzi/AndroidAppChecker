import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extractPackageId(input: string): string | null {
  input = input.trim();
  if (/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(input)) {
    return input;
  }
  try {
    const url = new URL(input);
    if (url.hostname.includes('play.google.com')) {
      return url.searchParams.get('id');
    }
  } catch {
    // not a url
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
    const { default: gplay } = await import('google-play-scraper');

    const info = await gplay.app({
      appId: packageId,
      lang: 'en',
      country: 'us',
    });

    const version =
      info.version && info.version !== 'Varies with device'
        ? info.version
        : null;

    if (!version) {
      return NextResponse.json(
        {
          error:
            'This app reports "Varies with device" — no single version number is available on the Play Store.',
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      name: info.title,
      version,
      icon: info.icon ?? null,
      developer: info.developer ?? null,
      packageId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    if (/404|not found|doesn't exist/i.test(msg)) {
      return NextResponse.json(
        { error: 'App not found on the Play Store' },
        { status: 404 },
      );
    }

    console.error('[check-version]', msg);
    return NextResponse.json(
      { error: 'Failed to fetch app information from the Play Store' },
      { status: 500 },
    );
  }
}
