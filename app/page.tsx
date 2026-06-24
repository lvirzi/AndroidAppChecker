'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { useSession, signIn, signOut } from 'next-auth/react';
import type { StoredApp, EmailSettings, AppData } from '@/lib/storage';
import type { UpdateInfo } from '@/lib/email';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrackedApp extends StoredApp {
  checking: boolean;
  error: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractPackageId(input: string): string | null {
  input = input.trim();
  if (/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(input)) return input;
  try {
    const url = new URL(input);
    if (url.hostname.includes('play.google.com')) return url.searchParams.get('id');
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

function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function toStored(app: TrackedApp): StoredApp {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { checking, error, ...stored } = app;
  return stored;
}

function toUI(app: StoredApp): TrackedApp {
  return { ...app, checking: false, error: null };
}

const DEFAULT_EMAIL: EmailSettings = { enabled: false, recipientEmail: '' };

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ app }: { app: TrackedApp }) {
  if (app.checking)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
        <span className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
        Checking…
      </span>
    );
  if (app.error)
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700"
        title={app.error}
      >
        <span>⚠</span> Error
      </span>
    );
  if (app.updateAvailable === null)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
        Not checked
      </span>
    );
  if (app.updateAvailable)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
        <span>↑</span> Update available
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
      <span>✓</span> Up to date
    </span>
  );
}

// ─── Help modal ───────────────────────────────────────────────────────────────

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 fill-none stroke-white stroke-2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <h2 className="text-base font-bold text-slate-800">Manuale d&apos;uso</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current stroke-2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-6 py-5 space-y-6 text-sm text-slate-700">

          <section>
            <h3 className="font-semibold text-slate-900 mb-1.5">Cos&apos;è questa applicazione</h3>
            <p className="text-slate-600 leading-relaxed">
              <strong>Android App Update Checker</strong> monitora le app Android sul Google Play Store e
              avvisa via email quando sono disponibili nuove versioni. Ogni utente ha una lista privata
              di app e impostazioni completamente separate dagli altri account.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-slate-900 mb-1.5">Accesso</h3>
            <p className="text-slate-600 leading-relaxed">
              L&apos;applicazione richiede il login con un account Google. Clicca su{' '}
              <span className="font-medium">Sign in with Google</span> nella schermata iniziale.
              Ogni account Google ha dati completamente isolati dagli altri utenti.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-slate-900 mb-2">Aggiungere un&apos;app</h3>
            <ol className="space-y-1.5 text-slate-600 list-decimal list-inside leading-relaxed">
              <li>
                Copia l&apos;URL della pagina Play Store dell&apos;app
                <span className="ml-1 font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                  play.google.com/store/apps/details?id=com.esempio
                </span>
                <br />
                oppure il Package ID diretto
                <span className="ml-1 font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                  com.esempio
                </span>
              </li>
              <li>Incollalo nel campo <span className="font-medium">Add an app</span> e clicca il pulsante verde.</li>
              <li>L&apos;app recupera automaticamente nome, icona, sviluppatore e versione corrente dal Play Store.</li>
            </ol>
          </section>

          <section>
            <h3 className="font-semibold text-slate-900 mb-2">Verificare gli aggiornamenti</h3>
            <div className="space-y-2 text-slate-600 leading-relaxed">
              <p>
                <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15" /></svg>
                  Check singolo
                </span>{' '}
                — clicca il pulsante ↻ sulla riga di un&apos;app per verificare immediatamente se c&apos;è una nuova versione.
              </p>
              <p>
                <span className="font-medium text-slate-700">Check all</span>{' '}
                — verifica tutte le app in sequenza. Al termine, se ci sono aggiornamenti e gli alert email sono attivi, viene inviata una email riepilogativa.
              </p>
              <p>
                Lo stato viene indicato con un badge colorato:{' '}
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">✓ Up to date</span>
                {' '}oppure{' '}
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">↑ Update available</span>
              </p>
            </div>
          </section>

          <section>
            <h3 className="font-semibold text-slate-900 mb-2">Controllo automatico (Cron)</h3>
            <div className="space-y-2 text-slate-600 leading-relaxed">
              <p>
                Il sistema esegue automaticamente un controllo ogni giorno alle{' '}
                <strong>08:00 UTC</strong> per tutti gli utenti registrati. Se vengono trovate nuove
                versioni, viene inviata una email riepilogativa a ciascun utente che ha gli alert attivi.
              </p>
              <p>
                Il pulsante <span className="font-medium text-slate-700">Run cron now</span> nell&apos;header
                esegue immediatamente il controllo per l&apos;utente corrente, senza aspettare l&apos;orario
                schedulato. È utile per testare gli alert o forzare un aggiornamento immediato dei dati.
              </p>
              <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                <span className="shrink-0">⚠</span>
                <span>
                  Lo stesso aggiornamento viene notificato via email una sola volta: una volta inviato
                  l&apos;alert per la versione X, non viene ripetuto finché non esce la versione Y.
                </span>
              </div>
            </div>
          </section>

          <section>
            <h3 className="font-semibold text-slate-900 mb-2">Alert email</h3>
            <div className="space-y-2 text-slate-600 leading-relaxed">
              <p>Clicca sull&apos;icona 🔔 nell&apos;header per aprire le impostazioni:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Attiva il toggle <span className="font-medium">Send email alerts when updates are detected</span></li>
                <li>Inserisci l&apos;indirizzo email dove ricevere le notifiche</li>
                <li>Clicca <span className="font-medium">Save</span></li>
                <li>Usa <span className="font-medium">Send test email</span> per verificare che la configurazione funzioni</li>
              </ol>
              <div className="flex gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                <span className="shrink-0">ℹ</span>
                <span>
                  Gli alert richiedono la variabile d&apos;ambiente{' '}
                  <code className="font-mono bg-blue-100 px-1 rounded">RESEND_API_KEY</code>{' '}
                  configurata nel progetto Vercel. Registrati su{' '}
                  <strong>resend.com</strong> per ottenere una chiave gratuita.
                </span>
              </div>
            </div>
          </section>

          <section>
            <h3 className="font-semibold text-slate-900 mb-1.5">Privacy e dati</h3>
            <p className="text-slate-600 leading-relaxed">
              La lista delle app e le impostazioni di ogni utente sono salvate privatamente su{' '}
              <strong>Vercel Blob</strong>. Nessun altro utente può vedere o modificare i tuoi dati.
              Per rimuovere i tuoi dati, elimina tutte le app dalla lista.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-slate-900 mb-2">Variabili d&apos;ambiente richieste</h3>
            <div className="space-y-1">
              {[
                ['GOOGLE_CLIENT_ID', 'Client ID OAuth da Google Cloud Console'],
                ['GOOGLE_CLIENT_SECRET', 'Client Secret OAuth da Google Cloud Console'],
                ['AUTH_SECRET', 'Stringa random per firmare i JWT (openssl rand -base64 32)'],
                ['BLOB_READ_WRITE_TOKEN', 'Impostato automaticamente da Vercel Blob'],
                ['RESEND_API_KEY', 'Chiave API Resend per gli alert email (opzionale)'],
                ['RESEND_FROM_EMAIL', 'Indirizzo mittente personalizzato (opzionale)'],
                ['CRON_SECRET', 'Protezione endpoint cron da accessi non autorizzati (opzionale)'],
              ].map(([key, desc]) => (
                <div key={key} className="flex flex-col sm:flex-row sm:items-baseline gap-x-3 py-1 border-b border-slate-100 last:border-0">
                  <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-800 shrink-0">{key}</code>
                  <span className="text-xs text-slate-500">{desc}</span>
                </div>
              ))}
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 rounded-b-2xl shrink-0">
          <p className="text-xs text-slate-400 text-center">
            Android App Update Checker · dati da Google Play Store · invio email via Resend
          </p>
        </div>

      </div>
    </div>
  );
}

// ─── Login screen ─────────────────────────────────────────────────────────────

function LoginScreen() {
  const [loading, setLoading] = useState(false);
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-6 text-center">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-green-500 flex items-center justify-center shadow">
              <svg viewBox="0 0 24 24" className="w-9 h-9 fill-white">
                <path d="M17.523 15.341a5.96 5.96 0 0 0 .477-2.341 5.96 5.96 0 0 0-.477-2.341l2.87-1.657a9.95 9.95 0 0 1 0 7.996l-2.87-1.657ZM6.477 15.341 3.607 17a9.95 9.95 0 0 1 0-7.996l2.87 1.657A5.96 5.96 0 0 0 6 13a5.96 5.96 0 0 0 .477 2.341ZM12 18a5.98 5.98 0 0 0 3.182-.91l1.657 2.87A9.95 9.95 0 0 1 12 22a9.95 9.95 0 0 1-4.839-1.04l1.657-2.87A5.98 5.98 0 0 0 12 18ZM12 8a5.98 5.98 0 0 0-3.182.91L7.16 6.04A9.95 9.95 0 0 1 12 5a9.95 9.95 0 0 1 4.839 1.04l-1.657 2.87A5.98 5.98 0 0 0 12 8Zm0 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
              </svg>
            </div>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Android App Update Checker</h1>
            <p className="text-sm text-slate-500 mt-1">
              Track Play Store updates and get email alerts — automatically.
            </p>
          </div>
          <button
            onClick={async () => {
              setLoading(true);
              await signIn('google');
            }}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-700 shadow-sm transition disabled:opacity-60"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            ) : (
              /* Google "G" logo */
              <svg viewBox="0 0 24 24" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            Sign in with Google
          </button>
          <p className="text-xs text-slate-400">
            Each user has their own private app list and alert settings.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main app ─────────────────────────────────────────────────────────────────

export default function Home() {
  const { data: session, status: authStatus } = useSession();

  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <span className="w-8 h-8 border-[3px] border-slate-300 border-t-green-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  return <AppShell />;
}

// ─── AppShell (authenticated) ─────────────────────────────────────────────────

function AppShell() {
  const { data: session } = useSession();

  // ── State ──
  const [apps, setApps] = useState<TrackedApp[]>([]);
  const [emailSettings, setEmailSettings] = useState<EmailSettings>(DEFAULT_EMAIL);
  const [dataStatus, setDataStatus] = useState<'loading' | 'ready' | 'unconfigured' | 'error'>('loading');

  const [showSettings, setShowSettings] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [enabledDraft, setEnabledDraft] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);

  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [checkingAll, setCheckingAll] = useState(false);
  const [runningCron, setRunningCron] = useState(false);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Refs for stable access in async callbacks
  const appsRef = useRef<TrackedApp[]>([]);
  const emailRef = useRef<EmailSettings>(DEFAULT_EMAIL);

  function updateApps(v: TrackedApp[]) {
    appsRef.current = v;
    setApps(v);
  }
  function updateEmail(v: EmailSettings) {
    emailRef.current = v;
    setEmailSettings(v);
  }

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  }, []);

  // ── Server persistence ──
  async function saveToServer(newApps: TrackedApp[], newEmail: EmailSettings) {
    const payload: AppData = {
      schemaVersion: 1,
      apps: newApps.map(toStored),
      emailSettings: newEmail,
    };
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error(b.error ?? 'Save failed');
    }
  }

  function save(newApps: TrackedApp[], newEmail?: EmailSettings) {
    saveToServer(newApps, newEmail ?? emailRef.current).catch((err: Error) =>
      showToast('error', `Save failed: ${err.message}`),
    );
  }

  // ── Initial load ──
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/data');
        if (res.status === 503) { setDataStatus('unconfigured'); return; }
        if (res.status === 401) { setDataStatus('error'); return; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: AppData = await res.json();
        const uiApps = data.apps.map(toUI);
        updateApps(uiApps);
        updateEmail(data.emailSettings ?? DEFAULT_EMAIL);
        setEmailDraft(data.emailSettings?.recipientEmail ?? '');
        setEnabledDraft(data.emailSettings?.enabled ?? false);
        setDataStatus('ready');
      } catch (err) {
        console.error('[load]', err);
        setDataStatus('error');
      }
    })();
  }, []);

  // ── Email settings ──
  function saveEmailConfig() {
    if (enabledDraft && !isValidEmail(emailDraft.trim())) {
      showToast('error', 'Enter a valid email address before enabling alerts');
      return;
    }
    const settings: EmailSettings = { enabled: enabledDraft, recipientEmail: emailDraft.trim() };
    updateEmail(settings);
    save(appsRef.current, settings);
    showToast('success', 'Email settings saved');
  }

  async function sendTestEmail() {
    const recipient = emailDraft.trim();
    if (!isValidEmail(recipient)) { showToast('error', 'Enter a valid email address first'); return; }
    setTestingEmail(true);
    try {
      const res = await fetch('/api/send-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientEmail: recipient, test: true }),
      });
      const b = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast('success', 'Test email sent — check your inbox');
      } else {
        showToast('error', b.error ?? 'Failed');
      }
    } catch {
      showToast('error', 'Network error');
    } finally {
      setTestingEmail(false);
    }
  }

  async function sendUpdateEmail(updates: UpdateInfo[]) {
    const s = emailRef.current;
    if (!s.enabled || !s.recipientEmail || updates.length === 0) return;
    try {
      await fetch('/api/send-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientEmail: s.recipientEmail, updates }),
      });
    } catch { /* best-effort */ }
  }

  // ── Add app ──
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    const packageId = extractPackageId(input);
    if (!packageId) { setAddError('Enter a valid Play Store URL or package ID'); return; }
    if (appsRef.current.some((a) => a.packageId === packageId)) { setAddError('Already in the list'); return; }
    setAdding(true);
    try {
      const res = await fetch(`/api/check-version?packageId=${encodeURIComponent(packageId)}`);
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? `HTTP ${res.status}`); }
      const info = await res.json();
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
        lastAlertedVersion: null,
        checking: false,
        error: null,
      };
      const newApps = [...appsRef.current, newApp];
      updateApps(newApps);
      save(newApps);
      setInput('');
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setAdding(false);
    }
  }

  // ── Check one app ──
  async function checkOne(id: string, silent = false): Promise<UpdateInfo | null> {
    const app = appsRef.current.find((a) => a.id === id);
    if (!app) return null;
    updateApps(appsRef.current.map((a) => (a.id === id ? { ...a, checking: true, error: null } : a)));
    try {
      const res = await fetch(`/api/check-version?packageId=${encodeURIComponent(app.packageId)}`);
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? `HTTP ${res.status}`); }
      const info = await res.json();
      const updateAvailable = info.version !== app.addedVersion;
      const updatedApp: TrackedApp = {
        ...app,
        checking: false,
        latestVersion: info.version,
        lastChecked: new Date().toISOString(),
        updateAvailable,
        lastAlertedVersion: updateAvailable ? info.version : app.lastAlertedVersion,
        error: null,
      };
      const newApps = appsRef.current.map((a) => (a.id === id ? updatedApp : a));
      updateApps(newApps);
      save(newApps);
      if (!updateAvailable) return null;
      const updateInfo: UpdateInfo = { name: app.name, packageId: app.packageId, icon: app.icon, oldVersion: app.addedVersion, newVersion: info.version };
      if (!silent) {
        await sendUpdateEmail([updateInfo]);
        const s = emailRef.current;
        if (s.enabled && s.recipientEmail) showToast('success', `Update for ${app.name} — alert sent`);
      }
      return updateInfo;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      updateApps(appsRef.current.map((a) => (a.id === id ? { ...a, checking: false, error: msg } : a)));
      return null;
    }
  }

  // ── Check all ──
  async function checkAll() {
    if (appsRef.current.length === 0 || checkingAll) return;
    setCheckingAll(true);
    const found: UpdateInfo[] = [];
    for (const app of appsRef.current) {
      const u = await checkOne(app.id, true);
      if (u) found.push(u);
      await new Promise((r) => setTimeout(r, 300));
    }
    if (found.length > 0) {
      await sendUpdateEmail(found);
      const s = emailRef.current;
      if (s.enabled && s.recipientEmail)
        showToast('success', `${found.length} update${found.length > 1 ? 's' : ''} found — summary email sent`);
    }
    setCheckingAll(false);
  }

  // ── Run cron manually ──
  async function runCronNow() {
    setRunningCron(true);
    try {
      const res = await fetch('/api/cron/check-updates', { method: 'POST' });
      const result = await res.json();
      if (!res.ok) { showToast('error', result.error ?? 'Cron failed'); return; }

      // Reload the latest data from server so UI reflects cron's updates
      const dataRes = await fetch('/api/data');
      if (dataRes.ok) {
        const data: AppData = await dataRes.json();
        updateApps(data.apps.map(toUI));
        updateEmail(data.emailSettings ?? DEFAULT_EMAIL);
      }

      const { checked, updates, emailSent } = result as { checked: number; updates: number; emailSent: boolean };
      const msg = updates === 0
        ? `All ${checked} apps are up to date`
        : `${updates} update${updates > 1 ? 's' : ''} found` + (emailSent ? ' — email sent' : '');
      showToast(updates > 0 ? 'success' : 'success', msg);
    } catch {
      showToast('error', 'Failed to run cron');
    } finally {
      setRunningCron(false);
    }
  }

  // ── Remove ──
  function removeApp(id: string) {
    const newApps = appsRef.current.filter((a) => a.id !== id);
    updateApps(newApps);
    save(newApps);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render guards
  // ─────────────────────────────────────────────────────────────────────────────

  if (dataStatus === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <span className="w-8 h-8 border-[3px] border-slate-300 border-t-green-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (dataStatus === 'unconfigured') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-4">
          <h1 className="text-lg font-bold text-slate-800">Storage not configured</h1>
          <p className="text-sm text-slate-600">
            Add a <strong>Vercel Blob</strong> store to your project — Vercel will automatically set{' '}
            <code className="bg-slate-100 px-1 rounded font-mono text-xs">BLOB_READ_WRITE_TOKEN</code>.
          </p>
        </div>
      </div>
    );
  }

  if (dataStatus === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-slate-800 text-white text-sm rounded-lg">
          Retry
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────────────────────────────────────

  const hasUpdates = apps.some((a) => a.updateAvailable);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Manual modal */}
      {showManual && <HelpModal onClose={() => setShowManual(false)} />}

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          <span>{toast.type === 'success' ? '✓' : '⚠'}</span>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          {/* Logo */}
          <div className="w-9 h-9 rounded-xl bg-green-500 flex items-center justify-center shadow-sm shrink-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
              <path d="M17.523 15.341a5.96 5.96 0 0 0 .477-2.341 5.96 5.96 0 0 0-.477-2.341l2.87-1.657a9.95 9.95 0 0 1 0 7.996l-2.87-1.657ZM6.477 15.341 3.607 17a9.95 9.95 0 0 1 0-7.996l2.87 1.657A5.96 5.96 0 0 0 6 13a5.96 5.96 0 0 0 .477 2.341ZM12 18a5.98 5.98 0 0 0 3.182-.91l1.657 2.87A9.95 9.95 0 0 1 12 22a9.95 9.95 0 0 1-4.839-1.04l1.657-2.87A5.98 5.98 0 0 0 12 18ZM12 8a5.98 5.98 0 0 0-3.182.91L7.16 6.04A9.95 9.95 0 0 1 12 5a9.95 9.95 0 0 1 4.839 1.04l-1.657 2.87A5.98 5.98 0 0 0 12 8Zm0 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-800 leading-tight">Android App Update Checker</h1>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {hasUpdates && (
              <span className="hidden sm:inline px-2.5 py-1 bg-amber-100 text-amber-800 text-xs font-semibold rounded-full border border-amber-200">
                {apps.filter((a) => a.updateAvailable).length} update{apps.filter((a) => a.updateAvailable).length !== 1 ? 's' : ''}
              </span>
            )}

            {/* Run cron now */}
            <button
              onClick={runCronNow}
              disabled={runningCron || checkingAll || apps.some((a) => a.checking)}
              title="Run scheduled check now"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-lg transition"
            >
              {runningCron ? (
                <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-none stroke-current stroke-2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1 0 12.728 0M12 3v9" />
                </svg>
              )}
              {runningCron ? 'Running…' : 'Run cron now'}
            </button>

            {/* Bell / settings */}
            <button
              onClick={() => setShowSettings((v) => !v)}
              title="Email alert settings"
              className={`p-2 rounded-lg transition-colors ${showSettings ? 'bg-slate-800 text-white' : emailSettings.enabled ? 'bg-green-50 text-green-700 border border-green-200' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current stroke-2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
              </svg>
            </button>

            {/* Manual */}
            <button
              onClick={() => setShowManual(true)}
              title="Manuale d'uso"
              className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current stroke-2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
            </button>

            {/* User avatar + logout */}
            <div className="flex items-center gap-2 pl-1 border-l border-slate-200 ml-1">
              {session?.user?.image && (
                <Image
                  src={session.user.image}
                  alt={session.user.name ?? 'User'}
                  width={32}
                  height={32}
                  className="rounded-full"
                  unoptimized
                />
              )}
              <button
                onClick={() => signOut()}
                className="text-xs text-slate-500 hover:text-slate-700 transition hidden sm:block"
                title="Sign out"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="border-t border-slate-200 bg-slate-50">
            <div className="max-w-5xl mx-auto px-4 py-5 space-y-4">
              <h2 className="text-sm font-semibold text-slate-700">Email Alert Settings</h2>

              <label className="flex items-center gap-3 cursor-pointer w-fit">
                <div className="relative">
                  <input type="checkbox" className="sr-only" checked={enabledDraft} onChange={(e) => setEnabledDraft(e.target.checked)} />
                  <div className={`w-10 h-6 rounded-full transition-colors ${enabledDraft ? 'bg-green-500' : 'bg-slate-300'}`} />
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabledDraft ? 'translate-x-5' : 'translate-x-1'}`} />
                </div>
                <span className="text-sm text-slate-700 font-medium">Send email alerts when updates are detected</span>
              </label>

              <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
                <div className="flex-1 max-w-sm">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Recipient email</label>
                  <input
                    type="email"
                    value={emailDraft}
                    onChange={(e) => setEmailDraft(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent transition"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={saveEmailConfig} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition">Save</button>
                  <button onClick={sendTestEmail} disabled={testingEmail} className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg border border-slate-300 transition disabled:opacity-60 flex items-center gap-1.5">
                    {testingEmail ? <><span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />Sending…</> : 'Send test email'}
                  </button>
                </div>
              </div>

              <div className="flex gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 max-w-lg">
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-blue-500 stroke-2 shrink-0 mt-0.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                </svg>
                <span>
                  Cron runs daily at 08:00 UTC for all users. Requires{' '}
                  <code className="font-mono bg-blue-100 px-1 rounded">RESEND_API_KEY</code>. Use{' '}
                  <strong>Run cron now</strong> to trigger a check immediately.
                </span>
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Mobile: run cron + check all row */}
        <div className="sm:hidden flex gap-2">
          <button
            onClick={runCronNow}
            disabled={runningCron || checkingAll || apps.some((a) => a.checking)}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-lg transition"
          >
            {runningCron ? <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" /> : <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-none stroke-current stroke-2"><path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1 0 12.728 0M12 3v9" /></svg>}
            {runningCron ? 'Running…' : 'Run cron now'}
          </button>
        </div>

        {/* Add form */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Add an app</h2>
          <form onSubmit={handleAdd} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => { setInput(e.target.value); setAddError(null); }}
              placeholder="Play Store URL or package ID (e.g. com.whatsapp)"
              disabled={adding}
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent disabled:opacity-60 transition"
            />
            <button type="submit" disabled={adding || !input.trim()} className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white text-sm font-medium rounded-lg transition flex items-center gap-2 whitespace-nowrap">
              {adding ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Adding…</> : <><svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-white stroke-2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>Add app</>}
            </button>
          </form>
          {addError && <p className="mt-2 text-xs text-red-600 flex items-center gap-1"><span>⚠</span> {addError}</p>}
        </div>

        {/* App list */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-700">Tracked apps</h2>
              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full font-medium">{apps.length}</span>
            </div>
            {apps.length > 0 && (
              <button onClick={checkAll} disabled={checkingAll || apps.some((a) => a.checking)} className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 disabled:bg-slate-400 text-white rounded-lg transition flex items-center gap-1.5">
                {checkingAll ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Checking all…</> : <><svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-none stroke-white stroke-2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15" /></svg>Check all</>}
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
              <p className="text-xs text-slate-400 mt-1">Paste a Play Store URL above to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 w-10" />
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500">App</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 hidden md:table-cell">Package ID</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 hidden sm:table-cell">Added on</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500">Version</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {apps.map((app) => (
                    <tr key={app.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        {app.icon ? (
                          <Image src={app.icon} alt={app.name} width={36} height={36} className="rounded-lg object-cover" unoptimized />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-slate-200 flex items-center justify-center">
                            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-slate-400"><path d="M17.523 15.341a5.96 5.96 0 0 0 .477-2.341 5.96 5.96 0 0 0-.477-2.341l2.87-1.657a9.95 9.95 0 0 1 0 7.996l-2.87-1.657ZM6.477 15.341 3.607 17a9.95 9.95 0 0 1 0-7.996l2.87 1.657A5.96 5.96 0 0 0 6 13a5.96 5.96 0 0 0 .477 2.341ZM12 18a5.98 5.98 0 0 0 3.182-.91l1.657 2.87A9.95 9.95 0 0 1 12 22a9.95 9.95 0 0 1-4.839-1.04l1.657-2.87A5.98 5.98 0 0 0 12 18ZM12 8a5.98 5.98 0 0 0-3.182.91L7.16 6.04A9.95 9.95 0 0 1 12 5a9.95 9.95 0 0 1 4.839 1.04l-1.657 2.87A5.98 5.98 0 0 0 12 8Zm0 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /></svg>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{app.name}</div>
                        {app.developer && <div className="text-xs text-slate-400">{app.developer}</div>}
                        {app.lastChecked && <div className="text-xs text-slate-400 mt-0.5 hidden sm:block">Checked {formatDate(app.lastChecked)}</div>}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <a href={`https://play.google.com/store/apps/details?id=${app.packageId}`} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-500 hover:text-green-600 font-mono underline-offset-2 hover:underline transition-colors">{app.packageId}</a>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <div className="text-slate-600">{formatDate(app.dateAdded)}</div>
                        <div className="text-xs text-slate-400">v{app.addedVersion}</div>
                      </td>
                      <td className="px-4 py-3">
                        {app.latestVersion ? (
                          <div>
                            <div className="font-mono text-slate-800 font-medium">{app.latestVersion}</div>
                            {app.updateAvailable && <div className="text-xs text-slate-400 line-through">{app.addedVersion}</div>}
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono">{app.addedVersion}</span>
                        )}
                      </td>
                      <td className="px-4 py-3"><StatusBadge app={app} /></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => checkOne(app.id)} disabled={app.checking || checkingAll || runningCron} title="Check for update" className="p-1.5 rounded-lg text-slate-400 hover:text-green-600 hover:bg-green-50 disabled:opacity-40 transition-colors">
                            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15" /></svg>
                          </button>
                          <button onClick={() => removeApp(app.id)} disabled={app.checking} title="Remove app" className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors">
                            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
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
          Signed in as <span className="text-slate-600">{session?.user?.email}</span> · Data synced to Vercel Blob · Cron daily at 08:00 UTC
          {emailSettings.enabled && emailSettings.recipientEmail && (
            <> · <span className="text-green-600">Alerts → {emailSettings.recipientEmail}</span></>
          )}
        </p>
      </main>
    </div>
  );
}
