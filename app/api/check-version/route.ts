import { NextRequest, NextResponse } from 'next/server';
import { getAppInfo, detectSource } from '@/lib/scraper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const raw = (request.nextUrl.searchParams.get('packageId') ?? '').trim();
  const detected = detectSource(raw);

  if (!detected) {
    return NextResponse.json(
      {
        error:
          'Invalid input. Accepted formats: Play Store URL or Android package ID (com.example.app), Apple App Store URL (apps.apple.com/…/id…), or any HTTP/HTTPS URL for web monitoring.',
      },
      { status: 400 },
    );
  }

  try {
    const info = await getAppInfo(detected.type, detected.id);
    return NextResponse.json(info);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    if (/APP_NOT_FOUND|404|not found|doesn't exist/i.test(msg)) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }
    if (msg === 'VERSION_NOT_FOUND') {
      return NextResponse.json(
        { error: 'This app reports "Varies with device" — no single version available' },
        { status: 422 },
      );
    }
    if (/^HTTP_/.test(msg)) {
      return NextResponse.json(
        { error: `Remote server returned ${msg.replace('HTTP_', '')}` },
        { status: 422 },
      );
    }

    console.error('[check-version]', msg);
    return NextResponse.json({ error: 'Failed to fetch information' }, { status: 500 });
  }
}
