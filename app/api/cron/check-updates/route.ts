import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { readData, writeData, isBlobConfigured, type StoredApp } from '@/lib/storage';
import { getAppInfo } from '@/lib/scraper';
import { buildEmailHTML, type UpdateInfo } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function GET(request: NextRequest) {
  // Verify the request comes from Vercel's cron scheduler
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  if (!isBlobConfigured()) {
    return NextResponse.json({ error: 'BLOB_READ_WRITE_TOKEN not configured' }, { status: 503 });
  }

  const data = await readData();

  if (data.apps.length === 0) {
    return NextResponse.json({ message: 'No apps to check', checked: 0, updates: 0 });
  }

  const newlyFound: UpdateInfo[] = [];
  const updatedApps: StoredApp[] = [];
  const now = new Date().toISOString();

  for (const app of data.apps) {
    try {
      const info = await getAppInfo(app.packageId);
      const updateAvailable = info.version !== app.addedVersion;
      // Only alert if the version is new AND we haven't already alerted for it
      const shouldAlert = updateAvailable && info.version !== app.lastAlertedVersion;

      updatedApps.push({
        ...app,
        latestVersion: info.version,
        lastChecked: now,
        updateAvailable,
        lastAlertedVersion: shouldAlert ? info.version : app.lastAlertedVersion,
      });

      if (shouldAlert) {
        newlyFound.push({
          name: app.name,
          packageId: app.packageId,
          icon: app.icon,
          oldVersion: app.addedVersion,
          newVersion: info.version,
        });
      }
    } catch (err) {
      console.error(`[cron] failed to check ${app.packageId}:`, err);
      // Keep existing data on error — don't overwrite with stale info
      updatedApps.push(app);
    }

    await sleep(400); // stay within Play Store rate limits
  }

  // Persist updated versions & check timestamps
  await writeData({ ...data, apps: updatedApps });

  // Send summary email if there are new updates and email alerts are on
  let emailSent = false;
  const { emailSettings } = data;

  if (newlyFound.length > 0 && emailSettings.enabled && emailSettings.recipientEmail) {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      const resend = new Resend(apiKey);
      const from = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
      const count = newlyFound.length;
      await resend.emails.send({
        from,
        to: emailSettings.recipientEmail,
        subject: `📱 ${count} Android app update${count > 1 ? 's' : ''} available`,
        html: buildEmailHTML(newlyFound),
      });
      emailSent = true;
    }
  }

  console.log(
    `[cron] checked ${data.apps.length} apps — ${newlyFound.length} new updates` +
      (emailSent ? ` — email sent to ${emailSettings.recipientEmail}` : ''),
  );

  return NextResponse.json({
    checked: data.apps.length,
    updates: newlyFound.length,
    emailSent,
    updatedApps: newlyFound.map((u) => u.packageId),
  });
}
