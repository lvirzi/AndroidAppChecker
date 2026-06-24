import { list, put } from '@vercel/blob';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StoredApp {
  id: string;
  packageId: string;
  name: string;
  icon: string | null;
  developer: string | null;
  addedVersion: string;
  dateAdded: string;
  lastChecked: string | null;
  latestVersion: string | null;
  updateAvailable: boolean | null;
  /** Last version for which a cron/manual alert was sent — prevents duplicate emails */
  lastAlertedVersion: string | null;
}

export interface EmailSettings {
  enabled: boolean;
  recipientEmail: string;
}

export interface AppData {
  schemaVersion: number;
  apps: StoredApp[];
  emailSettings: EmailSettings;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isBlobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/** Sanitise userId so it's safe to use as a path component. */
function sanitiseId(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getUserPath(userId: string): string {
  return `android-app-checker/users/${sanitiseId(userId)}/data.json`;
}

const EMPTY = (): AppData => ({
  schemaVersion: 1,
  apps: [],
  emailSettings: { enabled: false, recipientEmail: '' },
});

// ─── Per-user CRUD ────────────────────────────────────────────────────────────

export async function readUserData(userId: string): Promise<AppData> {
  const { blobs } = await list({ prefix: getUserPath(userId), limit: 1 });
  if (blobs.length === 0) return EMPTY();

  // For private stores, list() returns pre-signed URLs that already embed the
  // auth token as query parameters. Adding an Authorization header on top of a
  // pre-signed URL triggers an R2 "only one auth mechanism" error (400/403).
  const res = await fetch(blobs[0].url, { cache: 'no-store' });

  if (!res.ok) {
    // Surface the error so it shows up in Vercel logs and in the UI
    throw new Error(`Blob read failed: ${res.status} ${res.statusText}`);
  }

  const raw = (await res.json()) as Partial<AppData>;
  return {
    schemaVersion: raw.schemaVersion ?? 1,
    apps: raw.apps ?? [],
    emailSettings: raw.emailSettings ?? { enabled: false, recipientEmail: '' },
  };
}

export async function writeUserData(userId: string, data: AppData): Promise<void> {
  await put(getUserPath(userId), JSON.stringify(data), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

// ─── Cron helpers ─────────────────────────────────────────────────────────────

/** Returns all user IDs that have stored data. Used by the cron job. */
export async function listAllUserIds(): Promise<string[]> {
  const { blobs } = await list({ prefix: 'android-app-checker/users/' });
  const ids = new Set<string>();
  for (const blob of blobs) {
    const match = blob.pathname.match(/users\/([^/]+)\/data\.json$/);
    if (match) ids.add(match[1]);
  }
  return [...ids];
}
