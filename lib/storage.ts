import { list, put } from '@vercel/blob';

const DATA_PATH = 'android-app-checker/data.json';

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
  /** Last version for which we sent an alert — prevents duplicate cron emails */
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

const EMPTY: AppData = {
  schemaVersion: 1,
  apps: [],
  emailSettings: { enabled: false, recipientEmail: '' },
};

export function isBlobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export async function readData(): Promise<AppData> {
  const { blobs } = await list({ prefix: DATA_PATH, limit: 1 });
  if (blobs.length === 0) return structuredClone(EMPTY);

  const res = await fetch(blobs[0].url, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!res.ok) return structuredClone(EMPTY);

  const raw = (await res.json()) as Partial<AppData>;
  return {
    schemaVersion: raw.schemaVersion ?? 1,
    apps: raw.apps ?? [],
    emailSettings: raw.emailSettings ?? { enabled: false, recipientEmail: '' },
  };
}

export async function writeData(data: AppData): Promise<void> {
  await put(DATA_PATH, JSON.stringify(data), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}
