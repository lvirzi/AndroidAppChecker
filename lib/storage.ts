import { list, put, get } from '@vercel/blob';

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

async function fetchBlobJson(url: string): Promise<AppData | null> {
  // Use the SDK's get() — it handles auth (Bearer token via undici) correctly
  // for private stores. Native fetch() returns 403 on private blob URLs.
  const result = await get(url, { access: 'private' });
  if (!result) return null; // 404

  // Wrap the ReadableStream in a Response to read it as JSON
  const raw = (await new Response(result.stream).json()) as Partial<AppData>;
  return {
    schemaVersion: raw.schemaVersion ?? 1,
    apps: raw.apps ?? [],
    emailSettings: raw.emailSettings ?? { enabled: false, recipientEmail: '' },
  };
}

// ─── Per-user CRUD ────────────────────────────────────────────────────────────

export async function readUserData(userId: string): Promise<AppData> {
  const { blobs } = await list({ prefix: getUserPath(userId), limit: 1 });
  if (blobs.length === 0) return EMPTY();

  const data = await fetchBlobJson(blobs[0].url);
  if (data) return data;
  throw new Error(`Blob read failed for user ${userId}`);
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
