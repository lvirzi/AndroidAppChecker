import { list, put, del } from '@vercel/blob';

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

/** UUID v4 pattern — identifies blobs saved under old random-UUID user paths. */
const UUID_PATH_RE =
  /android-app-checker\/users\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/data\.json$/i;

async function fetchBlobJson(url: string): Promise<AppData | null> {
  // Pre-signed URLs from list() already embed auth — no Authorization header needed.
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    console.error(`[storage] fetch failed: ${res.status} ${res.statusText}`);
    return null;
  }
  const raw = (await res.json()) as Partial<AppData>;
  return {
    schemaVersion: raw.schemaVersion ?? 1,
    apps: raw.apps ?? [],
    emailSettings: raw.emailSettings ?? { enabled: false, recipientEmail: '' },
  };
}

// ─── Per-user CRUD ────────────────────────────────────────────────────────────

export async function readUserData(userId: string): Promise<AppData> {
  // 1. Try the stable path (Google account ID)
  const { blobs } = await list({ prefix: getUserPath(userId), limit: 1 });
  if (blobs.length > 0) {
    const data = await fetchBlobJson(blobs[0].url);
    if (data) return data;
    throw new Error(`Blob read failed for user ${userId}`);
  }

  // 2. No data at stable path — look for orphaned UUID-format blobs.
  //    Auth.js v5 without a database used to generate a random UUID per
  //    sign-in, so stored data ends up at an unreachable path.
  //    If exactly ONE such blob exists it's safe to migrate it here.
  const { blobs: all } = await list({ prefix: 'android-app-checker/users/' });
  const uuidBlobs = all.filter((b) => UUID_PATH_RE.test(b.pathname));

  if (uuidBlobs.length === 1) {
    console.log(`[storage] migrating orphaned UUID blob → ${getUserPath(userId)}`);
    const data = await fetchBlobJson(uuidBlobs[0].url);
    if (data) {
      await writeUserData(userId, data);
      await del(uuidBlobs[0].url).catch(() => {});
      return data;
    }
  }

  return EMPTY();
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

export async function listAllUserIds(): Promise<string[]> {
  const { blobs } = await list({ prefix: 'android-app-checker/users/' });
  const ids = new Set<string>();
  for (const blob of blobs) {
    const match = blob.pathname.match(/users\/([^/]+)\/data\.json$/);
    if (match) ids.add(match[1]);
  }
  return [...ids];
}
