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
import { getAppInfo, detectSource } from '@/lib/scraper';
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

  // CHECK_CONCURRENCY (server-only) takes precedence; falls back to the shared
  // NEXT_PUBLIC_CHECK_CONCURRENCY, then to 3.
  const concurrency = Math.max(
    1,
    parseInt(
      process.env.CHECK_CONCURRENCY ??
        process.env.NEXT_PUBLIC_CHECK_CONCURRENCY ??
        '3',
      10,
    ),
  );

  const newlyFound: UpdateInfo[] = [];
  const updatedApps: StoredApp[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < data.apps.length; i += concurrency) {
    const chunk = data.apps.slice(i, i + concurrency);

    const results = await Promise.allSettled(
      chunk.map((app) => {
        // Normalise legacy entries where packageId was saved as a full URL.
        // detectSource extracts the real ID; falls back to the stored value.
        const detected = detectSource(app.packageId);
        const type = detected?.type ?? app.sourceType ?? 'android';
        const id   = detected?.id   ?? app.packageId;
        return getAppInfo(type, id);
      }),
    );

    for (let j = 0; j < chunk.length; j++) {
      const app = chunk[j];
      const result = results[j];

      if (result.status === 'rejected') {
        console.error(`[cron] ${userId} / ${app.packageId}:`, result.reason);
        updatedApps.push(app); // keep existing data on error
        continue;
      }

      const info = result.value;
      const baseline = app.latestVersion ?? app.addedVersion;
      const updateAvailable = info.version !== baseline;
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
    }

    // Small pause between chunks to stay within rate limits
    if (i + concurrency < data.apps.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
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
  // CRON_SECRET is mandatory — a missing secret means the endpoint is public.
  // Set it in Vercel env vars; Vercel's scheduler sends it automatically.
  if (!cronSecret) {
    console.error('[cron] CRON_SECRET is not configured — endpoint blocked for safety');
    return NextResponse.json(
      { error: 'Cron secret not configured — add CRON_SECRET to environment variables' },
      { status: 503 },
    );
  }
  const auth_header = request.headers.get('authorization');
  if (auth_header !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
