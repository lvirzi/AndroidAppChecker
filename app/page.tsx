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

function SourceTypeBadge({ type }: { type: 'android' | 'ios' | 'web' }) {
  if (type === 'ios')
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-slate-800 text-white">
        {/* Apple  */}
        <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 fill-current">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
        </svg>
        iOS
      </span>
    );
  if (type === 'web')
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-blue-600 text-white">
        <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 fill-none stroke-current stroke-2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
        Web
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-green-600 text-white">
      <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 fill-current">
        <path d="M17.523 15.341a5.96 5.96 0 0 0 .477-2.341 5.96 5.96 0 0 0-.477-2.341l2.87-1.657a9.95 9.95 0 0 1 0 7.996l-2.87-1.657ZM6.477 15.341 3.607 17a9.95 9.95 0 0 1 0-7.996l2.87 1.657A5.96 5.96 0 0 0 6 13a5.96 5.96 0 0 0 .477 2.341ZM12 18a5.98 5.98 0 0 0 3.182-.91l1.657 2.87A9.95 9.95 0 0 1 12 22a9.95 9.95 0 0 1-4.839-1.04l1.657-2.87A5.98 5.98 0 0 0 12 18ZM12 8a5.98 5.98 0 0 0-3.182.91L7.16 6.04A9.95 9.95 0 0 1 12 5a9.95 9.95 0 0 1 4.839 1.04l-1.657 2.87A5.98 5.98 0 0 0 12 8Zm0 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      </svg>
      Android
    </span>
  );
}

function StatusBadge({ app }: { app: TrackedApp }) {
  const isWeb = app.sourceType === 'web';

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
        <span>↑</span> {isWeb ? 'Content changed' : 'Update available'}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
      <span>✓</span> {isWeb ? 'No changes' : 'Up to date'}
    </span>
  );
}

// ─── Help modal ───────────────────────────────────────────────────────────────

// ─── Help modal translations ──────────────────────────────────────────────────

type Lang = 'it' | 'en';

const T = {
  it: {
    title: "Manuale d'uso",
    what: {
      h: "Cos'è questa applicazione",
      p: 'Questo strumento monitora tre tipi di elementi e avvisa via email quando rileva cambiamenti:',
      types: [
        ['Android', 'aggiornamenti di app dal Google Play Store'],
        ['iOS', "aggiornamenti di app dall'Apple App Store"],
        ['Web', 'variazioni al contenuto di qualsiasi pagina web'],
      ] as [string, string][],
      tail: 'Ogni utente ha una lista privata completamente separata dagli altri account.',
    },
    access: {
      h: 'Accesso',
      p1: "L'applicazione richiede il login con un account Google. Clicca su ",
      p2: " nella schermata iniziale. Ogni account Google ha dati completamente isolati dagli altri utenti.",
    },
    add: {
      h: 'Aggiungere un elemento',
      intro: 'Incolla uno dei seguenti formati nel campo — il tipo viene rilevato automaticamente:',
      rows: [
        ['Android', 'URL Play Store o Package ID', 'play.google.com/store/apps/details?id=com.app', 'com.app'],
        ['iOS', 'URL App Store', 'apps.apple.com/us/app/nome/id310633997', ''],
        ['Web', 'Qualsiasi URL HTTPS', 'https://esempio.com/pagina', ''],
      ] as [string, string, string, string][],
      step2: 'Clicca ',
      step2b: " — nome, icona e dati vengono recuperati automaticamente.",
    },
    check: {
      h: 'Verificare gli aggiornamenti',
      single: 'Check singolo',
      singleDesc: "— clicca il pulsante ↻ sulla riga di un elemento per verificare immediatamente.",
      all: 'Check all',
      allDesc: '— verifica tutti gli elementi in sequenza. Al termine, se ci sono novità e gli alert email sono attivi, viene inviata una email riepilogativa.',
      badgeApps: 'Badge per app (Android/iOS):',
      badgeWeb: 'Badge per siti web:',
      or: 'oppure',
    },
    cron: {
      h: 'Controllo automatico (Cron)',
      p1a: 'Il sistema esegue automaticamente un controllo ogni giorno alle ',
      p1b: ' per tutti gli utenti registrati. Se vengono trovate novità, viene inviata una email riepilogativa a ciascun utente che ha gli alert attivi.',
      p2a: 'Il pulsante ',
      p2b: " nell'header esegue immediatamente il controllo per l'utente corrente, senza aspettare l'orario schedulato. È utile per testare gli alert o forzare un aggiornamento immediato dei dati.",
      warn: "La stessa novità viene notificata via email una sola volta. Per le app viene confrontata la versione; per i siti web viene confrontato l'hash del contenuto.",
    },
    email: {
      h: 'Alert email',
      intro: "Clicca sull'icona 🔔 nell'header per aprire le impostazioni:",
      s1: 'Attiva il toggle ',
      s2: "Inserisci l'indirizzo email dove ricevere le notifiche",
      s3: 'Clicca ',
      s4: 'Usa ',
      s4b: ' per verificare che la configurazione funzioni',
      info: 'Gli alert richiedono la variabile d\'ambiente ',
      infob: ' configurata nel progetto Vercel. Registrati su ',
      infoc: ' per ottenere una chiave gratuita.',
    },
    privacy: {
      h: 'Privacy e dati',
      p: 'La lista degli elementi e le impostazioni di ogni utente sono salvati privatamente su ',
      pb: '. Nessun altro utente può vedere o modificare i tuoi dati. Per rimuovere i tuoi dati, elimina tutti gli elementi dalla lista.',
    },
    footer: 'Update Checker · Android · iOS · Web · invio email via Resend',
  },
  en: {
    title: 'User Manual',
    what: {
      h: 'About this application',
      p: 'This tool monitors three types of items and notifies you by email when changes are detected:',
      types: [
        ['Android', 'app updates from the Google Play Store'],
        ['iOS', 'app updates from the Apple App Store'],
        ['Web', 'content changes on any web page'],
      ] as [string, string][],
      tail: 'Each user has a private list completely separate from other accounts.',
    },
    access: {
      h: 'Sign in',
      p1: 'The application requires a Google account. Click ',
      p2: ' on the start screen. Each Google account has data completely isolated from other users.',
    },
    add: {
      h: 'Adding an item',
      intro: 'Paste one of the following formats — the type is detected automatically:',
      rows: [
        ['Android', 'Play Store URL or Package ID', 'play.google.com/store/apps/details?id=com.app', 'com.app'],
        ['iOS', 'App Store URL', 'apps.apple.com/us/app/name/id310633997', ''],
        ['Web', 'Any HTTPS URL', 'https://example.com/page', ''],
      ] as [string, string, string, string][],
      step2: 'Click ',
      step2b: ' — name, icon and data are retrieved automatically.',
    },
    check: {
      h: 'Checking for updates',
      single: 'Single check',
      singleDesc: '— click the ↻ button on an item row to check immediately.',
      all: 'Check all',
      allDesc: '— checks all items in sequence. When done, if there are new findings and email alerts are enabled, a summary email is sent.',
      badgeApps: 'Badge for apps (Android/iOS):',
      badgeWeb: 'Badge for websites:',
      or: 'or',
    },
    cron: {
      h: 'Automatic check (Cron)',
      p1a: 'The system automatically runs a check every day at ',
      p1b: ' for all registered users. If new findings are detected, a summary email is sent to each user with alerts enabled.',
      p2a: 'The ',
      p2b: ' button in the header immediately runs the check for the current user, without waiting for the scheduled time. Useful for testing alerts or forcing an immediate data refresh.',
      warn: 'The same finding is only notified once by email. For apps the version is compared; for websites the content hash is compared.',
    },
    email: {
      h: 'Email alerts',
      intro: 'Click the 🔔 icon in the header to open the settings:',
      s1: 'Enable the toggle ',
      s2: 'Enter the email address to receive notifications',
      s3: 'Click ',
      s4: 'Use ',
      s4b: ' to verify the configuration works',
      info: 'Alerts require the ',
      infob: ' environment variable configured in the Vercel project. Sign up at ',
      infoc: ' for a free key.',
    },
    privacy: {
      h: 'Privacy & data',
      p: "Each user's items and settings are saved privately on ",
      pb: '. No other user can view or modify your data. To remove your data, delete all items from the list.',
    },
    footer: 'Update Checker · Android · iOS · Web · email via Resend',
  },
} as const;

function HelpModal({ onClose }: { onClose: () => void }) {
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('help-lang') as Lang) ?? 'it';
    }
    return 'it';
  });

  function switchLang(l: Lang) {
    setLang(l);
    localStorage.setItem('help-lang', l);
  }

  const t = T[lang];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-white stroke-2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <h2 className="text-base font-bold text-slate-800">{t.title}</h2>
          </div>

          <div className="flex items-center gap-2">
            {/* Language toggle */}
            <div className="flex items-center bg-slate-100 rounded-lg p-1">
              {(['it', 'en'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => switchLang(l)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                    lang === l
                      ? 'bg-white text-slate-800 shadow-sm'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current stroke-2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-6 py-5 space-y-6 text-sm text-slate-700">

          {/* What */}
          <section>
            <h3 className="font-semibold text-slate-900 mb-2">{t.what.h}</h3>
            <p className="text-slate-600 leading-relaxed mb-2">{t.what.p}</p>
            <div className="space-y-1.5">
              {t.what.types.map(([label, desc]) => (
                <div key={label} className="flex items-center gap-2">
                  <SourceTypeBadge type={label.toLowerCase() as 'android' | 'ios' | 'web'} />
                  <span className="text-slate-600 text-xs">{desc}</span>
                </div>
              ))}
            </div>
            <p className="text-slate-500 text-xs mt-2">{t.what.tail}</p>
          </section>

          {/* Access */}
          <section>
            <h3 className="font-semibold text-slate-900 mb-1.5">{t.access.h}</h3>
            <p className="text-slate-600 leading-relaxed">
              {t.access.p1}<span className="font-medium">Sign in with Google</span>{t.access.p2}
            </p>
          </section>

          {/* Add item */}
          <section>
            <h3 className="font-semibold text-slate-900 mb-2">{t.add.h}</h3>
            <p className="text-slate-600 mb-2">{t.add.intro}</p>
            <div className="rounded-lg border border-slate-200 overflow-hidden mb-3">
              {t.add.rows.map(([type, desc, example, alt]) => (
                <div key={type} className="flex items-start gap-3 px-3 py-2.5 border-b border-slate-100 last:border-0">
                  <div className="shrink-0 mt-0.5">
                    <SourceTypeBadge type={type.toLowerCase() as 'android' | 'ios' | 'web'} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-slate-500 mb-0.5">{desc}</div>
                    <code className="text-xs font-mono text-slate-700 break-all">{example}</code>
                    {alt && (
                      <><span className="text-slate-400 mx-1 text-xs">·</span>
                      <code className="text-xs font-mono text-slate-700">{alt}</code></>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-slate-600 text-xs">
              {t.add.step2}<span className="font-medium">Add an app</span>{t.add.step2b}
            </p>
          </section>

          {/* Check updates */}
          <section>
            <h3 className="font-semibold text-slate-900 mb-2">{t.check.h}</h3>
            <div className="space-y-2 text-slate-600 leading-relaxed">
              <p>
                <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current stroke-2 shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15" />
                  </svg>
                  {t.check.single}
                </span>{' '}{t.check.singleDesc}
              </p>
              <p>
                <span className="font-medium text-slate-700">Check all</span>{' '}{t.check.allDesc}
              </p>
              <div className="space-y-1.5 pt-1">
                <p className="text-xs text-slate-500 font-medium">{t.check.badgeApps}</p>
                <p>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">✓ Up to date</span>
                  {' '}{t.check.or}{' '}
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">↑ Update available</span>
                </p>
                <p className="text-xs text-slate-500 font-medium mt-1">{t.check.badgeWeb}</p>
                <p>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">✓ No changes</span>
                  {' '}{t.check.or}{' '}
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">↑ Content changed</span>
                </p>
              </div>
            </div>
          </section>

          {/* Cron */}
          <section>
            <h3 className="font-semibold text-slate-900 mb-2">{t.cron.h}</h3>
            <div className="space-y-2 text-slate-600 leading-relaxed">
              <p>{t.cron.p1a}<strong>08:00 UTC</strong>{t.cron.p1b}</p>
              <p>{t.cron.p2a}<span className="font-medium text-slate-700">Run cron now</span>{t.cron.p2b}</p>
              <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                <span className="shrink-0">⚠</span>
                <span>{t.cron.warn}</span>
              </div>
            </div>
          </section>

          {/* Email alerts */}
          <section>
            <h3 className="font-semibold text-slate-900 mb-2">{t.email.h}</h3>
            <div className="space-y-2 text-slate-600 leading-relaxed">
              <p>{t.email.intro}</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>{t.email.s1}<span className="font-medium">Send email alerts when updates are detected</span></li>
                <li>{t.email.s2}</li>
                <li>{t.email.s3}<span className="font-medium">Save</span></li>
                <li>{t.email.s4}<span className="font-medium">Send test email</span>{t.email.s4b}</li>
              </ol>
              <div className="flex gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                <span className="shrink-0">ℹ</span>
                <span>
                  {t.email.info}
                  <code className="font-mono bg-blue-100 px-1 rounded">RESEND_API_KEY</code>
                  {t.email.infob}<strong>resend.com</strong>{t.email.infoc}
                </span>
              </div>
            </div>
          </section>

          {/* Privacy */}
          <section>
            <h3 className="font-semibold text-slate-900 mb-1.5">{t.privacy.h}</h3>
            <p className="text-slate-600 leading-relaxed">
              {t.privacy.p}<strong>Vercel Blob</strong>{t.privacy.pb}
            </p>
          </section>


        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 rounded-b-2xl shrink-0">
          <p className="text-xs text-slate-400 text-center">{t.footer}</p>
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
            <h1 className="text-xl font-bold text-slate-800">Update Checker</h1>
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

  // Detect input type client-side for dynamic button label (no crypto needed)
  function detectInputType(raw: string): 'app' | 'url' | null {
    const v = raw.trim();
    if (!v) return null;
    if (v.includes('play.google.com') || v.includes('apps.apple.com') || v.includes('itunes.apple.com')) return 'app';
    if (/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(v)) return 'app';
    try { const u = new URL(v); if (u.protocol === 'http:' || u.protocol === 'https:') return 'url'; } catch { /* not a url */ }
    return null;
  }
  const inputType = detectInputType(input);
  const addBtnLabel = inputType === 'app' ? 'Add App' : inputType === 'url' ? 'Add URL' : 'Add';
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
    const raw = input.trim();
    if (!raw) { setAddError('Enter a valid URL or identifier'); return; }
    if (appsRef.current.some((a) => a.packageId === raw)) { setAddError('Already in the list'); return; }
    setAdding(true);
    try {
      const res = await fetch(`/api/check-version?packageId=${encodeURIComponent(raw)}`);
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? `HTTP ${res.status}`); }
      const info = await res.json() as { name: string; version: string; icon: string | null; developer: string | null; sourceType: 'android' | 'ios' | 'web' };
      const newApp: TrackedApp = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        sourceType: info.sourceType,
        packageId: raw,
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
            <h1 className="text-lg font-bold text-slate-800 leading-tight">Update Checker</h1>
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
              placeholder="Play Store URL, App Store URL, Android package ID, or any https:// URL"
              disabled={adding}
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent disabled:opacity-60 transition"
            />
            <button type="submit" disabled={adding || !input.trim()} className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white text-sm font-medium rounded-lg transition flex items-center gap-2 whitespace-nowrap">
              {adding ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Adding…</> : <><svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-white stroke-2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>{addBtnLabel}</>}
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
                    <th className="px-2 py-3 text-xs font-semibold text-slate-500 w-[72px]" />
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 min-w-[220px]">Name</th>
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
                      {/* Icon + type badge */}
                      <td className="px-2 pt-2 pb-4">
                        <div className="relative inline-block">
                          {app.icon ? (
                            <Image
                              src={app.icon}
                              alt={app.name}
                              width={56}
                              height={56}
                              className="rounded-xl object-cover w-14 h-14"
                              unoptimized
                            />
                          ) : (
                            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                              app.sourceType === 'ios' ? 'bg-slate-800' :
                              app.sourceType === 'web' ? 'bg-blue-600' :
                              'bg-slate-200'
                            }`}>
                              {app.sourceType === 'ios' ? (
                                <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white">
                                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                                </svg>
                              ) : app.sourceType === 'web' ? (
                                <svg viewBox="0 0 24 24" className="w-7 h-7 fill-none stroke-white stroke-1">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
                                </svg>
                              ) : (
                                <svg viewBox="0 0 24 24" className="w-7 h-7 fill-slate-400">
                                  <path d="M17.523 15.341a5.96 5.96 0 0 0 .477-2.341 5.96 5.96 0 0 0-.477-2.341l2.87-1.657a9.95 9.95 0 0 1 0 7.996l-2.87-1.657ZM6.477 15.341 3.607 17a9.95 9.95 0 0 1 0-7.996l2.87 1.657A5.96 5.96 0 0 0 6 13a5.96 5.96 0 0 0 .477 2.341ZM12 18a5.98 5.98 0 0 0 3.182-.91l1.657 2.87A9.95 9.95 0 0 1 12 22a9.95 9.95 0 0 1-4.839-1.04l1.657-2.87A5.98 5.98 0 0 0 12 18ZM12 8a5.98 5.98 0 0 0-3.182.91L7.16 6.04A9.95 9.95 0 0 1 12 5a9.95 9.95 0 0 1 4.839 1.04l-1.657 2.87A5.98 5.98 0 0 0 12 8Zm0 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                                </svg>
                              )}
                            </div>
                          )}
                          {/* Source type badge — sticks out from the bottom-right corner */}
                          <div className="absolute -bottom-2 -right-1 z-10">
                            <SourceTypeBadge type={app.sourceType} />
                          </div>
                        </div>
                      </td>

                      {/* Name / developer */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{app.name}</div>
                        {app.developer && <div className="text-xs text-slate-400">{app.developer}</div>}
                        {app.lastChecked && (
                          <div className="text-xs text-slate-400 mt-0.5 hidden sm:block">
                            Checked {formatDate(app.lastChecked)}
                          </div>
                        )}
                      </td>

                      {/* Package ID / URL */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        {app.sourceType === 'web' ? (
                          <a href={app.packageId} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-slate-500 hover:text-blue-600 underline-offset-2 hover:underline transition-colors break-all max-w-[200px] block">
                            {app.packageId}
                          </a>
                        ) : (
                          <a
                            href={
                              app.sourceType === 'ios'
                                ? `https://apps.apple.com/app/id${app.packageId}`
                                : `https://play.google.com/store/apps/details?id=${app.packageId}`
                            }
                            target="_blank" rel="noopener noreferrer"
                            className="text-xs text-slate-500 hover:text-green-600 font-mono underline-offset-2 hover:underline transition-colors">
                            {app.packageId}
                          </a>
                        )}
                      </td>

                      {/* Date added */}
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <div className="text-slate-600">{formatDate(app.dateAdded)}</div>
                        {app.sourceType !== 'web' && (
                          <div className="text-xs text-slate-400">v{app.addedVersion}</div>
                        )}
                      </td>

                      {/* Version / hash */}
                      <td className="px-4 py-3">
                        {app.sourceType === 'web' ? (
                          <span className="font-mono text-xs text-slate-400">
                            {app.latestVersion ? app.latestVersion.slice(0, 8) : app.addedVersion.slice(0, 8)}
                          </span>
                        ) : app.latestVersion ? (
                          <div>
                            <div className="font-mono text-slate-800 font-medium">{app.latestVersion}</div>
                            {app.updateAvailable && (
                              <div className="text-xs text-slate-400 line-through">{app.addedVersion}</div>
                            )}
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
