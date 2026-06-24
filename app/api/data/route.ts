import { NextRequest, NextResponse } from 'next/server';
import { readData, writeData, isBlobConfigured, type AppData } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NOT_CONFIGURED = {
  error: 'Storage not configured — add BLOB_READ_WRITE_TOKEN to your Vercel environment variables',
};

export async function GET() {
  if (!isBlobConfigured()) {
    return NextResponse.json(NOT_CONFIGURED, { status: 503 });
  }
  try {
    const data = await readData();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[data GET]', err);
    return NextResponse.json({ error: 'Failed to read data' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isBlobConfigured()) {
    return NextResponse.json(NOT_CONFIGURED, { status: 503 });
  }
  let body: AppData;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  try {
    await writeData(body);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[data POST]', err);
    return NextResponse.json({ error: 'Failed to save data' }, { status: 500 });
  }
}
