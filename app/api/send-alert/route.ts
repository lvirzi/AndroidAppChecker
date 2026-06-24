import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { buildEmailHTML, type UpdateInfo } from '@/lib/email';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let body: { recipientEmail?: string; updates?: UpdateInfo[]; test?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { recipientEmail, updates = [], test = false } = body;

  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return NextResponse.json({ error: 'Invalid recipient email' }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Email service not configured — add RESEND_API_KEY to your environment variables' },
      { status: 503 },
    );
  }

  const effectiveUpdates: UpdateInfo[] = test
    ? [{ name: 'Test App', packageId: 'com.test.app', icon: null, oldVersion: '1.0.0', newVersion: '1.1.0', sourceType: 'android' as const }]
    : updates;

  if (!test && effectiveUpdates.length === 0) {
    return NextResponse.json({ error: 'No updates to report' }, { status: 400 });
  }

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
  const subject = test
    ? '✅ Test — Android App Update Checker'
    : `📱 ${effectiveUpdates.length} Android app update${effectiveUpdates.length > 1 ? 's' : ''} available`;

  try {
    const { error } = await resend.emails.send({
      from,
      to: recipientEmail,
      subject,
      html: buildEmailHTML(effectiveUpdates),
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[send-alert]', err);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
