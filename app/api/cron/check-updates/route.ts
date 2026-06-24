import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { auth } from '@/auth';
import {
  readUserData,
  writeUserData,
  listAllUserIds,
  isBlobConfigured,
  type StoredApp,
} from '@/lib/storage';
import { getAppInfo } from '@/lib/scraper';
import { buildEmailHTML, type UpdateInfo } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// ─── Shared check logic ───────────────────────────────────────────────────────

interface CronResult {
  checked: number;
  updates: number;
  emailSent: boolean;
  updatedApps: string[];
}

async function checkUserApps(userId: string): Promise<CronResult> {
  const data = await readUserData(userId);

  if (data.apps.length === 0) {
    return { checked: 0, updates: 0, emailSent: false, updatedApps: [] };
  }

  const newlyFound: UpdateInfo[] = [];
  const updatedApps: StoredApp[] = [];
  const now = new Date().toISOString();

  for (const app of data.apps) {
    try {
      const info = await getAppInfo(app.sourceType ?? 'android', app.packageId);
      const updateAvailable = info.version !== app.addedVersion;
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
          sourceType: app.sourceType ?? 'android',
        });
      }
    } catch (err) {
      console.error(`[cron] ${userId} / ${app.packageId}:`, err);
      updatedApps.push(app);
    }

    // Throttle requests to Play Store
    await new Promise((r) => setTimeout(r, 400));
  }

  await writeUserData(userId, { ...data, apps: updatedApps });

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
        subject: `🔔 ${count} update${count > 1 ? 's' : ''} detected`,
        html: buildEmailHTML(newlyFound),
      });
      emailSent = true;
    }
  }

  return {
    checked: data.apps.length,
    updates: newlyFound.length,
    emailSent,
    updatedApps: newlyFound.map((u) => u.packageId),
  };
}

// ─── GET — scheduled cron (all users) ────────────────────────────────────────

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth_header = request.headers.get('authorization');
    if (auth_header !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  if (!isBlobConfigured()) {
    return NextResponse.json({ error: 'BLOB_READ_WRITE_TOKEN not configured' }, { status: 503 });
  }

  const userIds = await listAllUserIds();

  if (userIds.length === 0) {
    return NextResponse.json({ message: 'No users registered yet', users: 0 });
  }

  const results: Record<string, CronResult> = {};

  for (const userId of userIds) {
    results[userId] = await checkUserApps(userId);
    console.log(
      `[cron] user ${userId}: checked ${results[userId].checked}, ` +
        `updates ${results[userId].updates}, email ${results[userId].emailSent}`,
    );
  }

  return NextResponse.json({
    users: userIds.length,
    results,
  });
}

// ─── POST — manual trigger (authenticated, current user only) ─────────────────

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isBlobConfigured()) {
    return NextResponse.json({ error: 'BLOB_READ_WRITE_TOKEN not configured' }, { status: 503 });
  }

  const result = await checkUserApps(session.user.id);
  return NextResponse.json(result);
}
