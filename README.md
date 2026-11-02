# قضاء الصلوات — Prayer Make-up Tracker

> **Generation status:** Source implementation is prepared, but dependency installation is blocked by unavailable npm network access. The lockfile, complete automated test run, and production build are still pending. See [VERIFICATION.md](VERIFICATION.md) before deploying.

A private, Arabic-first Vue 3 PWA for recording **completed** make-up prayers. Designed for one person on an Android phone. Full RTL, touch-friendly controls, local IndexedDB storage, portable JSON backups, and offline application assets. No backend, account, external API, remote font, analytics, starting debt, balance, daily target, or percentage.

## Local setup

Use the latest stable **Node.js LTS** and npm. Then:

```sh
npm ci
npm run dev
```

Open the printed URL at `/prayer-tracker/`. The service worker is deliberately enabled only in production builds. For the actual offline-capable build:

```sh
npm test
npm run build
npm run preview
```

Open `http://127.0.0.1:4173/prayer-tracker/`. A service worker requires HTTPS, or localhost for development. Opening `index.html` as a local file does not work.

## Deploy to GitHub Pages

All paths are already configured for the public repository name **prayer-tracker**. No source changes, secrets, or personal access token are needed.

1. Create a **public GitHub repository named `prayer-tracker`**.
2. Push the generated project to the **`main`** branch. Include hidden files (`.github/`, `.gitignore`) and **`package-lock.json`**. Do not upload `node_modules/` or `artifacts/`.
3. Open GitHub repository **Settings → Pages**.
4. Select **GitHub Actions** as the deployment source.
5. Wait for the deployment workflow to succeed. If the first run happened before step 4, run it again from the Actions tab using **Run workflow**.
6. Open **`https://USERNAME.github.io/prayer-tracker/`**, replacing `USERNAME` with your GitHub username.
7. On **Android Chrome**, select **Install app** or **Add to Home screen** from Chrome's menu. A supported browser may also show the app's Arabic installation button.

The workflow runs `npm ci`, unit tests, local-date tests in two timezones, TypeScript checks, a production build, PWA artifact checks, and Chromium browser tests. Only a successful build/test job can reach deployment. It uploads `dist/` and deploys using the official GitHub Pages Actions and the standard `GITHUB_TOKEN`. Hosting is exclusively GitHub Pages. This project has not been pushed or deployed for you.

## Using the app

- **اليوم**: Tap + or − for each prayer. Every tap writes automatically to IndexedDB. Counts cannot become negative.
- **السجل**: Choose a date to open an existing record or create a zero record. Expand any day; use +/− or edit a number directly. Direct numeric edits save when the field changes and loses focus. Deleting a day requires confirmation.
- **الإحصائيات**: All-time and per-prayer totals, today, week-to-date, month-to-date, days with activity, and the last 7 or 30 calendar days. An accessible details table accompanies the chart.
- **الإعدادات**: The gear opens export, restore, storage information, and installation when Chrome offers it.

Dates use the device's **local Gregorian calendar**, never UTC slices. The week begins **Saturday**, as labelled in the UI. Monthly and weekly totals run through today. Days with positive counts contribute to activity days; explicit zero records are preserved and counted as recorded days. Merely viewing today does not create a record. Charts distinguish missing records from recorded zeros.

## Backups and data safety

**Export regularly and keep copies outside the phone**, for example in a folder backed up independently. Clearing browser/app storage or uninstalling may erase records. Browser storage is local to the origin and browser profile; changing hosting origin requires backup/restore to transfer records. Private browsing may not preserve data.

Export from **تصدير نسخة احتياطية**. Files are UTF-8 JSON named `prayer-tracker-backup-YYYY-MM-DD.json`, using the local date, and contain:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-11-02T10:00:00.000Z",
  "records": [
    { "date": "2026-11-02", "fajr": 5, "dhuhr": 3, "asr": 0, "maghrib": 0, "isha": 0 }
  ]
}
```

On another device, install/open the same app and choose **استعادة نسخة احتياطية**. The full file is validated before any database write. Unsupported versions, malformed files, invalid dates/timestamps, duplicate dates, missing prayer fields, strings, fractional/negative/unsafe counts are rejected. Each prayer count is bounded at `floor(Number.MAX_SAFE_INTEGER / 5)` to preserve exact daily totals. Files are limited to 20 MiB to avoid excessive memory use on phones.

Restore displays the validated record count, then requires explicit confirmation to **replace all existing records**; it does not merge. Export current data first if you need to keep it. A confirmed empty backup intentionally clears all records. Validation failures make no changes. Clear and insertion run inside one transaction, so a database failure rolls back both operations. The optional persistent-storage request reduces automatic browser eviction when granted, but does not protect against manual deletion and is not a substitute for backups.

## Offline operation and updates

The PWA manifest sets the Arabic name, RTL, standalone display, portrait preference, `/prayer-tracker/` scope/start URL, and 192/512 icons plus a 512 maskable icon. All app code, styles, icons, and the entry page are precached by Workbox. No prayer record is saved or read over the network. After the app reports it is ready offline, normal recording, history, statistics, export, and restore work without a connection. The browser may check for service-worker updates when online.

Updates show an Arabic prompt and activate only after **تحديث الآن**. The button waits for pending writes and is unavailable during backup operations. IndexedDB is separate from asset caches and is never cleared by an app update. Navigation uses in-page tabs, so refreshing uses the same Pages entry URL and needs no server-side router rewrites.

Do not place unrelated apps with conflicting database names on the same origin. The stable database name is `prayer-tracker`, version 1, with `date` as the unique primary key. Future migrations should add `version(2).stores(...).upgrade(...)` in `src/db.ts`, preserving existing versions and data; never delete the database on launch or service-worker activation.

## Verification

```sh
npm test
TZ=Africa/Cairo npm test
TZ=America/Los_Angeles npm test -- --testNamePattern='local calendar dates'
npm run build
npx playwright install chromium
npm run test:e2e
```

On Linux, use `npx playwright install --with-deps chromium` when browser system libraries are missing. Browser tests run against `vite preview` and the **production** service worker using a mobile viewport and Cairo timezone. They cover rapid taps, shared data across tabs, persistence, historical editing, deletion confirmation, backup validation/confirmation/export/restore, offline reload and operation, Arabic direction, and narrow-screen overflow.

Unit tests use Dexie with `fake-indexeddb`, including failure injection after a partial restore write to verify transaction rollback. Production build verification checks the emitted manifest, PNG dimensions, base paths, and precache coverage. See `VERIFICATION.md` for what actually ran in the generation environment. Automated Chromium emulation does **not** establish installation or offline behavior on a physical Android device.

Before relying on the installed app, on your Android device: load while online, wait for offline readiness, install, add a few counts, close/reopen, enable airplane mode, reopen and edit a past day, export a backup, restore it with confirmation, and confirm all counts. Confirm a later application update preserves records.

## Project layout

```text
src/App.vue                 Screens and application state
src/components/             Reusable controls and confirmation dialog
src/db.ts                   Dexie schema and transactional writes
src/model.ts                Record type, prayers and count checks
src/dates.ts                Local date helpers
src/statistics.ts           Derived totals and chart data
src/backup.ts               Export and complete backup validation
src/style.css               Mobile-first RTL styles; system Arabic fonts
public/                     Offline icons and favicon
vite.config.ts              GitHub Pages base, manifest and Workbox
scripts/verify-build.mjs     Emitted PWA checks
scripts/generate-icons.py    Reproducible PNG icons (Python stdlib)
tests/                      Data tests and production browser tests
.github/workflows/deploy.yml Automated Pages deployment
```

Only Vue and Dexie are runtime dependencies; the rest are build or test tools. There is no router, chart library, UI framework, or global state library.

To recreate the source ZIP (Python 3 required):

```sh
npm run package
```

The archive is `artifacts/prayer-tracker.zip`, with one `prayer-tracker/` folder containing the source, hidden deployment configuration, icons, tests, and lockfile. Dependencies, build output, browser artifacts, Git metadata, and the ZIP itself are excluded.
