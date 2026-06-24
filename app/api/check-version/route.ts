import { NextRequest, NextResponse } from 'next/server';
import { getAppInfo, extractPackageId } from '@/lib/scraper';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('packageId') ?? '';
  const packageId = extractPackageId(raw) ?? raw;

  if (!packageId) {
    return NextResponse.json({ error: 'Package ID is required' }, { status: 400 });
  }

  try {
    const info = await getAppInfo(packageId);
    return NextResponse.json(info);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);

    if (/404|not found|doesn't exist/i.test(msg)) {
      return NextResponse.json({ error: 'App not found on the Play Store' }, { status: 404 });
    }
    if (msg === 'VERSION_NOT_FOUND') {
      return NextResponse.json(
        { error: 'This app reports "Varies with device" — no single version available' },
        { status: 422 },
      );
    }
    console.error('[check-version]', msg);
    return NextResponse.json({ error: 'Failed to fetch app information' }, { status: 500 });
  }
}
