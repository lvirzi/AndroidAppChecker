# Update Checker — CLAUDE.md

Project guide for AI assistants. Read this before making changes.

---

## Codebase Statistics

| Metric | Value |
|---|---|
| Source files | 15 |
| **Total lines of code** | **2 260** |
| `.ts` files | 9 |
| `.tsx` files | 3 |
| Production dependencies | 7 |
| Dev dependencies | 8 |
| Installed packages (node_modules) | 370 |
| API route handlers | 5 |
| Git commits | 46 |

**File breakdown (largest first):**

| File | Lines | Purpose |
|---|---|---|
| `app/page.tsx` | 1 395 | Full UI: login, app shell, bilingual manual, mobile/desktop layouts |
| `app/api/cron/check-updates/route.ts` | 192 | Cron scheduler + manual trigger |
| `lib/scraper.ts` | 178 | Android/iOS/web scraping + SSRF protection |
| `lib/email.ts` | 133 | Type-aware HTML email template |
| `lib/storage.ts` | 100 | Vercel Blob CRUD |
| `app/api/send-alert/route.ts` | 64 | Email send endpoint |
| `app/api/data/route.ts` | 52 | User data GET/POST |
| `app/api/check-version/route.ts` | 49 | Version/hash fetch |
| `app/layout.tsx` | 43 | Root layout + viewport fix script |
| `auth.ts` | 32 | Auth.js v5 config |

**`page.tsx` internals:** 18 functions/components, 24 React hooks, 214 translation strings (IT + EN).

---

## Overview

**Update Checker** is a multi-user web application that monitors:
- **Android apps** — version updates from the Google Play Store
- **iOS apps** — version updates from the Apple App Store
- **Web URLs** — content changes (SHA-256 hash comparison)

Users log in with Google, maintain their own private list of tracked items, and receive email alerts when changes are detected. A scheduled cron job checks all users' items daily at 08:00 CEST (06:00 UTC).

Live at: `https://check.virzi.it`  
Repository: `https://github.com/lvirzi/AndroidAppChecker`

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js App Router | ^15.3.4 |
| Language | TypeScript | ^5 |
| Styling | Tailwind CSS | ^4 |
| Auth | Auth.js v5 (next-auth@beta) | ^5.0.0-beta.31 |
| Storage | Vercel Blob (private store) | ^2.4.1 |
| Email | Resend | ^6.14.0 |
| Android scraper | google-play-scraper | ^10.1.3 |
| iOS data | iTunes Lookup API (no SDK needed) | — |
| Runtime | Node.js on Vercel Fluid Compute | — |

---

## Repository Structure

```
/
├── app/
│   ├── layout.tsx                    Root layout: SessionProvider, viewport meta
│   ├── page.tsx                      Entire client UI (login screen + app shell)
│   ├── globals.css                   Tailwind v4 + pointer:coarse mobile classes
│   ├── icon.svg                      Android robot favicon (auto-discovered by Next.js)
│   └── api/
│       ├── auth/[...nextauth]/       Auth.js route handlers (GET + POST)
│       ├── check-version/            Scrape version/hash for one item
│       ├── data/                     GET/POST user data to Vercel Blob
│       ├── send-alert/               Send email via Resend (auth required)
│       └── cron/
│           └── check-updates/        GET = scheduled cron (CRON_SECRET required)
│                                     POST = manual trigger (session required)
├── auth.ts                           Auth.js v5 config: Google provider, JWT, stable userId
├── lib/
│   ├── storage.ts                    Vercel Blob helpers: readUserData / writeUserData
│   ├── scraper.ts                    getAppInfo() for android/ios/web + detectSource()
│   └── email.ts                      buildEmailHTML() — type-aware HTML email template
├── components/
│   └── Providers.tsx                 SessionProvider wrapper (must be 'use client')
└── vercel.json                       Cron schedule: "0 6 * * *" (08:00 CEST)
```

---

## Architecture

### Authentication

Auth.js v5 with Google OAuth and JWT sessions (no database).

**Critical**: `auth.ts` overrides `token.sub` with `account.providerAccountId`
(Google's stable numeric ID) in the `jwt` callback. Without this, Auth.js v5
generates a random UUID per sign-in, making stored data unreachable on the
next login.

```typescript
// auth.ts — must NOT be removed
jwt({ token, account }) {
  if (account?.providerAccountId) token.sub = account.providerAccountId;
  return token;
}
```

### Storage

Each user's data is stored as a single private JSON file in Vercel Blob:

```
android-app-checker/users/{googleAccountId}/data.json
```

Schema (`AppData`):
```typescript
{
  schemaVersion: 1,
  apps: StoredApp[],
  emailSettings: { enabled: boolean; recipientEmail: string }
}
```

`StoredApp` key fields:
- `sourceType`: `'android' | 'ios' | 'web'`
- `packageId`: extracted ID (not the raw URL — see "Common Pitfalls")
- `addedVersion`: version/hash at time of addition (immutable)
- `latestVersion`: last checked version/hash (updated on every check)
- `updateAvailable`: `latestVersion !== (latestVersion ?? addedVersion)`
- `lastAlertedVersion`: last version/hash for which an email was sent (dedup)

### Input Detection

`detectSource(input)` in `lib/scraper.ts` auto-classifies user input:

| Input | Detected type |
|---|---|
| `https://play.google.com/store/apps/details?id=com.xxx` | android |
| `com.example.app` | android |
| `https://apps.apple.com/us/app/name/id123456789` | ios |
| Any `https://` URL | web |

**Stored `packageId`** is always the _extracted_ ID, never the raw URL:
- Android: `com.example.app`
- iOS: `123456789`
- Web: full URL (the URL itself is the identifier)

### Update Detection Logic

```typescript
const baseline = app.latestVersion ?? app.addedVersion;
const updateAvailable = info.version !== baseline;
```

Using `latestVersion` as the baseline means: after a check, re-checking the
same version shows "Up to date" instead of repeating "Update available".

### Cron Job

`GET /api/cron/check-updates` — called by Vercel scheduler, requires `CRON_SECRET`.  
`POST /api/cron/check-updates` — manual trigger from UI, requires session auth.

The cron uses `detectSource(app.packageId)` before calling `getAppInfo()` to
normalize any legacy entries that might have a full URL stored as `packageId`.

### Mobile Layout

Two separate views exist in `page.tsx`:
- **Mobile cards** (`hidden touch-show`): icon + name in row 1; "Added: date" + status + actions in row 2
- **Desktop table** (`touch-hide`): full table with all columns

The `touch-show` / `touch-hide` CSS classes are defined in `globals.css` using
`@media (pointer: coarse)`. This works even when Chrome Android has
"Request desktop site" enabled (unlike `max-width` breakpoints which read the
inflated CSS viewport).

#### Viewport fix after OAuth redirect

After a Google OAuth redirect, Chrome may carry a "desktop" viewport context
into the next page load (inflating `window.innerWidth` to ~980 px on a phone).
`pointer: coarse` then evaluates to false, CSS cards stay hidden.

The fix is an **inline `<script>` in `layout.tsx`** (executed before React,
before CSS, before any pixel is painted):

```javascript
// Fires immediately on every page load
if (performance.navigation.type === 1) return; // already a reload — stop
if (navigator.maxTouchPoints > 0             // touch device
    && Math.min(screen.width, screen.height) < 640   // phone screen
    && window.innerWidth > 700)              // viewport is inflated
  location.reload();
```

`performance.navigation.type === 1` (TYPE_RELOAD) is the anti-loop guard:
the reload itself sets this to `1`, so the script skips on the second load.

**Do NOT replace this with a `useEffect`** — React effects fire too late
(after hydration), and `window.location.reload()` called from an effect may
not exit Chrome's desktop context the same way a native reload does.

---

## API Routes

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | — | Auth.js handlers |
| `/api/check-version` | GET | session | Fetch version for one item |
| `/api/data` | GET/POST | session | Read/write user data blob |
| `/api/send-alert` | POST | session | Send email via Resend |
| `/api/cron/check-updates` | GET | CRON_SECRET | Scheduled check (all users) |
| `/api/cron/check-updates` | POST | session | Manual check (current user) |

---

## Environment Variables

All must be set in Vercel project settings.

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_CLIENT_ID` | ✅ | OAuth client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | ✅ | OAuth client secret |
| `AUTH_SECRET` | ✅ | Random string for JWT signing (`openssl rand -base64 32`) |
| `BLOB_READ_WRITE_TOKEN` | ✅ | Set automatically when Blob store is linked to the project |
| `CRON_SECRET` | ✅ | Protects `/api/cron/check-updates` GET endpoint; Vercel scheduler sends it automatically |
| `RESEND_API_KEY` | ✅ (for email) | Resend API key for email alerts |
| `RESEND_FROM_EMAIL` | ☐ | Custom sender address (defaults to `onboarding@resend.dev`) |
| `NEXT_PUBLIC_CHECK_CONCURRENCY` | ☐ | Parallel checks in UI check-all (default: 3; requires redeploy) |
| `CHECK_CONCURRENCY` | ☐ | Override concurrency for cron only (default: `NEXT_PUBLIC_CHECK_CONCURRENCY` or 3) |

**Google Cloud Console setup**:  
Authorized redirect URI must be: `https://check.virzi.it/api/auth/callback/google`

---

## Key Behaviors

### Concurrency
Check-all (UI and cron) processes items in parallel chunks of size `NEXT_PUBLIC_CHECK_CONCURRENCY` (default 3). State is updated atomically after each chunk with a direct reference to `appsRef.current` — NOT via `setApps(prev => ...)` updater pattern, which can cause a race with React's batching and accidentally save empty data to Blob.

### Email deduplication
`lastAlertedVersion` prevents the cron from sending the same alert twice. An alert is sent only when `updateAvailable && info.version !== app.lastAlertedVersion`. After sending, `lastAlertedVersion` is updated.

### SSRF protection
`assertSafeUrl()` in `lib/scraper.ts` validates web URLs before fetching: blocks private/internal IP ranges (127.x, 10.x, 172.16-31.x, 192.168.x, 169.254.x), non-HTTP protocols, and IPv6 loopback/link-local.

### "Varies with device"
`displayVersion(v)` in `page.tsx` replaces any string matching `/varies/i` with `MULTIPLE` in the UI. The scraper already throws `VERSION_NOT_FOUND` for "Varies with device" so new entries are blocked, but this handles any legacy data.

---

## Common Pitfalls

1. **`packageId` must be the extracted ID, not the raw URL.**  
   `handleAdd` uses `info.packageId` (returned by the API after `detectSource`)
   not `raw` input. Storing a raw URL breaks the cron (which calls `getAppInfo`
   directly without `detectSource`).

2. **`CRON_SECRET` is mandatory.** If not set, the endpoint returns 503.
   Without it the daily check never runs.

3. **Blob store must be "private".** The code uses `access: 'private'` in
   `put()`. Reading uses `@vercel/blob`'s `get()` (not native `fetch()` —
   native fetch returns 403 on private blob URLs).

4. **Auth.js v5 `token.sub` without the jwt callback** generates a new UUID
   per sign-in. Always keep the `providerAccountId` override in `auth.ts`.

5. **`setApps(prev => ...)` in async loops** can cause stale closure saves.
   In `checkAll`, always compute the new state from `appsRef.current` and call
   `setApps(computedValue)` directly, then `save(computedValue)`.
