'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';

interface TrackedApp {
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
  checking: boolean;
  error: string | null;
}

const STORAGE_KEY = 'android-app-checker-apps';

function loadApps(): TrackedApp[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as TrackedApp[]).map((a) => ({
      ...a,
      checking: false,
    }));
  } catch {
    return [];
  }
}

function saveApps(apps: TrackedApp[]) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const toSave = apps.map(({ checking, ...rest }) => rest);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}

function extractPackageId(input: string): string | null {
  input = input.trim();
  if (/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(input)) {
    return input;
  }
  try {
    const url = new URL(input);
    if (url.hostname.includes('play.google.com')) {
      return url.searchParams.get('id');
    }
  } catch {
    // not a url
  }
  return null;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function StatusBadge({ app }: { app: TrackedApp }) {
  if (app.checking) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
        <span className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
        Checking…
      </span>
    );
  }
  if (app.error) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700"
        title={app.error}
      >
        <span>⚠</span> Error
      </span>
    );
  }
  if (app.updateAvailable === null) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
        Not checked
      </span>
    );
  }
  if (app.updateAvailable) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
        <span>↑</span> Update available
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
      <span>✓</span> Up to date
    </span>
  );
}

export default function Home() {
  const [apps, setApps] = useState<TrackedApp[]>([]);
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [checkingAll, setCheckingAll] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setApps(loadApps());
    setMounted(true);
  }, []);

  const persistApps = useCallback((updated: TrackedApp[]) => {
    setApps(updated);
    saveApps(updated);
  }, []);

  async function fetchAppInfo(packageId: string) {
    const res = await fetch(`/api/check-version?packageId=${encodeURIComponent(packageId)}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    return res.json() as Promise<{
      name: string;
      version: string;
      icon: string | null;
      developer: string | null;
      packageId: string;
    }>;
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    const packageId = extractPackageId(input);
    if (!packageId) {
      setAddError('Enter a valid Play Store URL or package ID (e.g. com.example.app)');
      return;
    }
    if (apps.some((a) => a.packageId === packageId)) {
      setAddError('This app is already in the list');
      return;
    }
    setAdding(true);
    try {
      const info = await fetchAppInfo(packageId);
      const newApp: TrackedApp = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        packageId,
        name: info.name,
        icon: info.icon,
        developer: info.developer,
        addedVersion: info.version,
        dateAdded: new Date().toISOString(),
        lastChecked: new Date().toISOString(),
        latestVersion: info.version,
        updateAvailable: false,
        checking: false,
        error: null,
      };
      persistApps([...apps, newApp]);
      setInput('');
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setAdding(false);
    }
  }

  async function checkOne(id: string) {
    const app = apps.find((a) => a.id === id);
    if (!app) return;

    setApps((prev) =>
      prev.map((a) => (a.id === id ? { ...a, checking: true, error: null } : a)),
    );

    try {
      const info = await fetchAppInfo(app.packageId);
      setApps((prev) => {
        const updated = prev.map((a) =>
          a.id === id
            ? {
                ...a,
                checking: false,
                latestVersion: info.version,
                lastChecked: new Date().toISOString(),
                updateAvailable: info.version !== a.addedVersion,
                error: null,
              }
            : a,
        );
        saveApps(updated);
        return updated;
      });
    } catch (err: unknown) {
      setApps((prev) => {
        const updated = prev.map((a) =>
          a.id === id
            ? {
                ...a,
                checking: false,
                error: err instanceof Error ? err.message : 'Unknown error',
              }
            : a,
        );
        saveApps(updated);
        return updated;
      });
    }
  }

  async function checkAll() {
    if (apps.length === 0 || checkingAll) return;
    setCheckingAll(true);
    for (const app of apps) {
      await checkOne(app.id);
      await new Promise((r) => setTimeout(r, 300));
    }
    setCheckingAll(false);
  }

  function removeApp(id: string) {
    persistApps(apps.filter((a) => a.id !== id));
  }

  const hasUpdates = apps.some((a) => a.updateAvailable);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center shadow-sm">
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white">
              <path d="M17.523 15.341a5.96 5.96 0 0 0 .477-2.341 5.96 5.96 0 0 0-.477-2.341l2.87-1.657a9.95 9.95 0 0 1 0 7.996l-2.87-1.657ZM6.477 15.341 3.607 17a9.95 9.95 0 0 1 0-7.996l2.87 1.657A5.96 5.96 0 0 0 6 13a5.96 5.96 0 0 0 .477 2.341ZM12 18a5.98 5.98 0 0 0 3.182-.91l1.657 2.87A9.95 9.95 0 0 1 12 22a9.95 9.95 0 0 1-4.839-1.04l1.657-2.87A5.98 5.98 0 0 0 12 18ZM12 8a5.98 5.98 0 0 0-3.182.91L7.16 6.04A9.95 9.95 0 0 1 12 5a9.95 9.95 0 0 1 4.839 1.04l-1.657 2.87A5.98 5.98 0 0 0 12 8Zm0 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 leading-tight">
              Android App Update Checker
            </h1>
            <p className="text-sm text-slate-500">
              Monitor Google Play Store updates
            </p>
          </div>
          {hasUpdates && (
            <span className="ml-auto px-3 py-1 bg-amber-100 text-amber-800 text-xs font-semibold rounded-full border border-amber-200">
              {apps.filter((a) => a.updateAvailable).length} update
              {apps.filter((a) => a.updateAvailable).length !== 1 ? 's' : ''} available
            </span>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Add form */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Add an app</h2>
          <form onSubmit={handleAdd} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setAddError(null);
              }}
              placeholder="Play Store URL or package ID (e.g. com.whatsapp)"
              disabled={adding}
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent disabled:opacity-60 transition"
            />
            <button
              type="submit"
              disabled={adding || !input.trim()}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white text-sm font-medium rounded-lg transition flex items-center gap-2 whitespace-nowrap"
            >
              {adding ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Adding…
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-white stroke-2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add app
                </>
              )}
            </button>
          </form>
          {addError && (
            <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
              <span>⚠</span> {addError}
            </p>
          )}
        </div>

        {/* App list */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-700">
                Tracked apps
              </h2>
              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full font-medium">
                {apps.length}
              </span>
            </div>
            {apps.length > 0 && (
              <button
                onClick={checkAll}
                disabled={checkingAll || apps.some((a) => a.checking)}
                className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 disabled:bg-slate-400 text-white rounded-lg transition flex items-center gap-1.5"
              >
                {checkingAll ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Checking all…
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-none stroke-white stroke-2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15" />
                    </svg>
                    Check all updates
                  </>
                )}
              </button>
            )}
          </div>

          {apps.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-6 h-6 fill-none stroke-slate-400 stroke-1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0H3" />
                </svg>
              </div>
              <p className="text-sm text-slate-500">No apps tracked yet.</p>
              <p className="text-xs text-slate-400 mt-1">
                Paste a Play Store URL above to get started.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-10" />
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500">App</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 hidden md:table-cell">
                      Package ID
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 hidden sm:table-cell">
                      Added on
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500">Version</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {apps.map((app) => (
                    <tr key={app.id} className="hover:bg-slate-50 transition-colors">
                      {/* Icon */}
                      <td className="px-4 py-3">
                        {app.icon ? (
                          <Image
                            src={app.icon}
                            alt={app.name}
                            width={36}
                            height={36}
                            className="rounded-lg object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-slate-200 flex items-center justify-center">
                            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-slate-400">
                              <path d="M17.523 15.341a5.96 5.96 0 0 0 .477-2.341 5.96 5.96 0 0 0-.477-2.341l2.87-1.657a9.95 9.95 0 0 1 0 7.996l-2.87-1.657ZM6.477 15.341 3.607 17a9.95 9.95 0 0 1 0-7.996l2.87 1.657A5.96 5.96 0 0 0 6 13a5.96 5.96 0 0 0 .477 2.341ZM12 18a5.98 5.98 0 0 0 3.182-.91l1.657 2.87A9.95 9.95 0 0 1 12 22a9.95 9.95 0 0 1-4.839-1.04l1.657-2.87A5.98 5.98 0 0 0 12 18ZM12 8a5.98 5.98 0 0 0-3.182.91L7.16 6.04A9.95 9.95 0 0 1 12 5a9.95 9.95 0 0 1 4.839 1.04l-1.657 2.87A5.98 5.98 0 0 0 12 8Zm0 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                            </svg>
                          </div>
                        )}
                      </td>

                      {/* Name */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{app.name}</div>
                        {app.developer && (
                          <div className="text-xs text-slate-400">{app.developer}</div>
                        )}
                        {app.lastChecked && (
                          <div className="text-xs text-slate-400 mt-0.5 hidden sm:block">
                            Checked {formatDate(app.lastChecked)}
                          </div>
                        )}
                      </td>

                      {/* Package ID */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        <a
                          href={`https://play.google.com/store/apps/details?id=${app.packageId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-slate-500 hover:text-green-600 font-mono underline-offset-2 hover:underline transition-colors"
                        >
                          {app.packageId}
                        </a>
                      </td>

                      {/* Date added */}
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <div className="text-slate-600">{formatDate(app.dateAdded)}</div>
                        <div className="text-xs text-slate-400">v{app.addedVersion}</div>
                      </td>

                      {/* Version */}
                      <td className="px-4 py-3">
                        {app.latestVersion ? (
                          <div>
                            <div className="font-mono text-slate-800 font-medium">
                              {app.latestVersion}
                            </div>
                            {app.updateAvailable && app.addedVersion !== app.latestVersion && (
                              <div className="text-xs text-slate-400 line-through">
                                {app.addedVersion}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono">{app.addedVersion}</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusBadge app={app} />
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => checkOne(app.id)}
                            disabled={app.checking || checkingAll}
                            title="Check for update"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-green-600 hover:bg-green-50 disabled:opacity-40 transition-colors"
                          >
                            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15" />
                            </svg>
                          </button>
                          <button
                            onClick={() => removeApp(app.id)}
                            disabled={app.checking}
                            title="Remove app"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
                          >
                            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400">
          Data is stored locally in your browser. App info is fetched from the Google Play Store.
        </p>
      </main>
    </div>
  );
}
