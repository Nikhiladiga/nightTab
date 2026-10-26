# Google Drive Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** nightTab saves its config to the user's Google Drive app data folder after every user edit, and every laptop pulls the newest config on new tab and on tab return.

**Architecture:** A new `src/component/sync/` component. Pure decision logic (`decide.js`) chooses push / pull / none / blocked. `auth.js` signs in with `chrome.identity.launchWebAuthFlow` (auth code + PKCE) and exchanges/refreshes tokens through a tiny Cloudflare Worker (`worker/`) that holds the client secret. `drive.js` talks to the Drive v3 REST API. `data.save()` notifies sync; the Data menu gets a "Sync" section.

**Tech Stack:** plain ES modules + webpack 5 (existing), Chrome MV3 `identity` API, Google Drive v3 REST, Cloudflare Workers (no deps), `node --test` (Node 24, no new dependencies).

**Spec:** `docs/superpowers/specs/2026-10-26-drive-sync-design.md`

## Global Constraints

- Drive scope: `https://www.googleapis.com/auth/drive.appdata`, plus `openid email` for the account email.
- Drive file: name `nighttab-config.json` (fixed constant, not from `APP_NAME`), parent `appDataFolder`.
- No client secret in the extension. Secret lives only in the Worker env var `GOOGLE_CLIENT_SECRET`.
- Worker accepts only `Origin` values listed in env var `ALLOWED_ORIGINS` (comma separated `chrome-extension://<id>`), proxies only `https://oauth2.googleapis.com/token`, logs no tokens, stores nothing.
- Only user-driven `data.save()` calls mark local data dirty and upload. Startup, migration and applying a pulled config never do.
- A failed sync never blocks or breaks the page; nightTab keeps working from localStorage.
- Never open an interactive sign-in popup without a user click.
- Sync UI only shows when `chrome.identity` exists (extension build); the web build is unchanged.
- No new npm dependencies. Test files `*.test.js` import only modules that have no imports of their own, with the `.js` extension.
- Upload debounce: 3000 ms.
- All UI strings go in `src/locale/en_GB/messages.json` and are read with `message.get()`.

## Review Focus

1. Offline when the user edits: dirty flag stays set; upload happens on the `online` event or the next tab open. → `decide` test "dirty, remote unchanged → push" (Task 1) and engine keeps `dirty` on failure (Task 5 manual check 4).
2. Large config (uploaded background image, several MB): upload must send the full JSON, not truncate. → `drive.test.js` "upload body contains the full JSON" with a 3 MB string (Task 4).
3. User revokes nightTab in their Google account: refresh fails, status becomes `reauth`, no popup loop. → Worker test "refresh passes Google 400 through unchanged" (Task 2); auth maps 400 to `AuthError` (Task 3).
4. Drive config written by a newer nightTab version: local data untouched, status `blocked`. → `decide` test "remote version newer → blocked" (Task 1).
5. First sign-in on a laptop that already has local edits: Drive copy wins, local copy goes to backup. → `decide` test "never synced, remote exists → pull with backup" (Task 1).

---

### Task 1: Sync decision logic + test runner

**Files:**
- Create: `src/component/sync/decide.js`
- Test: `src/component/sync/decide.test.js`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces:
  - `decide({ meta, remote, appVersion, compareVersion }) -> { action: 'push'|'pull'|'none'|'blocked', backupLocal: boolean }`
  - `meta`: `{ dirty: boolean, modified: number /* ms, local clock, last user edit */, synced: number /* Drive modifiedTime ms at last successful push/pull, 0 = never */ }`
  - `remote`: `null | { modifiedTime: number /* Drive ms */, version: string, modified: number /* uploader's meta.modified */ }`
  - `compareVersion(a, b) -> 1|0|-1` (pass `version.compare` from `src/component/version`)

Rules, in this order:
1. `remote === null` → push.
2. `compareVersion(remote.version, appVersion) > 0` → blocked.
3. `meta.synced === 0` → pull, `backupLocal: true` (first sign-in: Drive wins).
4. `remoteChanged = remote.modifiedTime > meta.synced`.
5. remoteChanged && !dirty → pull, no backup. !remoteChanged && dirty → push. Both → newest wins: `remote.modified > meta.modified` ? pull with `backupLocal: true` : push. Neither → none.

- [ ] **Step 1: Add `"test": "node --test"` to `package.json` scripts.**
- [ ] **Step 2: Write `decide.test.js`** (`import { test } from 'node:test'`, `assert from 'node:assert/strict'`, `import { decide } from './decide.js'`, with a local 3-part `compareVersion`). Cases, with `appVersion: '7.6.0'`:
  - no remote → `{ action: 'push', backupLocal: false }`
  - remote version `'7.7.0'` → `blocked`
  - `synced: 0`, remote exists, `dirty: true` → `{ action: 'pull', backupLocal: true }`
  - `synced: 100`, remote `modifiedTime: 200`, `dirty: false` → pull, `backupLocal: false`
  - `synced: 200`, remote `modifiedTime: 200`, `dirty: true` → push
  - `synced: 100`, remote `modifiedTime: 200, modified: 50`, local `modified: 60, dirty: true` → push
  - same but remote `modified: 70` → pull, `backupLocal: true`
  - `synced: 200`, remote `modifiedTime: 200`, `dirty: false` → none
- [ ] **Step 3: Run `npm test`.** Expected: FAIL, cannot find `decide.js`.
- [ ] **Step 4: Implement `decide` in `decide.js`** (no imports).
- [ ] **Step 5: Run `npm test`.** Expected: all 8 pass.
- [ ] **Step 6: Commit** `feat(sync): add sync decision logic`.

### Task 2: Cloudflare token Worker

**Files:**
- Create: `worker/index.js`, `worker/wrangler.toml`, `worker/readme.md`
- Test: `worker/index.test.js`

**Interfaces:**
- Produces HTTP API (JSON in, JSON out, CORS for allowed origins, `OPTIONS` preflight → 204):
  - `POST /token` body `{ code, code_verifier, redirect_uri }` → forwards `grant_type=authorization_code` with `client_id`, `client_secret` from env; returns Google's JSON and status unchanged.
  - `POST /refresh` body `{ refresh_token }` → forwards `grant_type=refresh_token`; returns Google's JSON and status unchanged.
  - Disallowed/missing `Origin` → 403. Other path/method → 404.
- `export default { fetch(request, env) }`; env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (secret), `ALLOWED_ORIGINS`.

- [ ] **Step 1: Write `worker/index.test.js`** with `globalThis.fetch` stubbed to record the call and return `new Response(JSON.stringify({...}), { status })`. Tests:
  - "rejects unknown origin" → 403, fetch not called.
  - "token exchange adds secret" → stub sees URL `https://oauth2.googleapis.com/token`, form body has `client_secret=<env>` and `grant_type=authorization_code`; response has `Access-Control-Allow-Origin: chrome-extension://abc`.
  - "refresh passes Google 400 through unchanged" → stub returns 400 `{ error: 'invalid_grant' }`; worker returns 400 with same body.
  - "OPTIONS preflight" → 204 with CORS headers.
- [ ] **Step 2: Run `npm test`.** Expected: worker tests FAIL.
- [ ] **Step 3: Implement `worker/index.js`.** Body to Google as `application/x-www-form-urlencoded` (`URLSearchParams`).
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Write `wrangler.toml`** (`name = "nighttab-sync"`, `main = "index.js"`, `compatibility_date = "2026-10-01"`, `[vars] ALLOWED_ORIGINS`, `GOOGLE_CLIENT_ID`) **and `worker/readme.md`**: owner steps — `npx wrangler login`, `npx wrangler secret put GOOGLE_CLIENT_SECRET`, set vars, `npx wrangler deploy`, copy the `*.workers.dev` URL.
- [ ] **Step 6: Commit** `feat(sync): add token exchange worker`.

### Task 3: Sign-in (auth)

**Files:**
- Create: `src/component/sync/pkce.js`, `src/component/sync/auth.js`
- Test: `src/component/sync/pkce.test.js`
- Modify: `src/constant/index.js`, `src/manifest.json`

**Interfaces:**
- Consumes: Worker API (Task 2).
- Produces:
  - `pkce.js` (no imports): `randomVerifier() -> string` (43+ chars, base64url), `async codeChallenge(verifier) -> string` (S256, base64url, no padding), `emailFromIdToken(idToken) -> string`.
  - `auth.js`: `auth.signIn() -> Promise<{ email }>`, `auth.getToken() -> Promise<string>` (access token; refreshes via Worker when < 60 s left), `auth.signOut() -> Promise<void>`, `auth.isSignedIn() -> boolean`, `auth.email() -> string|null`, `class AuthError extends Error` (thrown when refresh returns 400/401).
  - Constants in `src/constant/index.js`: `GOOGLE_CLIENT_ID = ''`, `SYNC_WORKER_URL = ''`, `SYNC_FILE_NAME = 'nighttab-config.json'` (owner fills the first two).
  - Auth stored in localStorage key `APP_NAME + 'SyncAuth'`: `{ refreshToken, accessToken, expiresAt, email }`.

- [ ] **Step 1: Write `pkce.test.js`.** RFC 7636 appendix B vector: verifier `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` → challenge `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`. `randomVerifier()` length ≥ 43 and matches `/^[A-Za-z0-9_-]+$/`. `emailFromIdToken` on a hand-built `header.<base64url({"email":"a@b.c"})>.sig` → `'a@b.c'`.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement `pkce.js`** with `crypto.getRandomValues` and `crypto.subtle.digest('SHA-256', ...)`.
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Implement `auth.js`.** `signIn`: redirect `chrome.identity.getRedirectURL()`; auth URL `https://accounts.google.com/o/oauth2/v2/auth` with `response_type=code`, `access_type=offline`, `prompt=consent select_account`, `code_challenge_method=S256`, the scopes above; `chrome.identity.launchWebAuthFlow({ url, interactive: true })`; POST code to `SYNC_WORKER_URL + '/token'`. `signOut`: POST `https://oauth2.googleapis.com/revoke?token=<refreshToken>` (ignore failure), remove the storage key.
- [ ] **Step 6: Add `"identity"` to a new `"permissions"` array in `src/manifest.json`.** Do not add `key` (store and dev IDs differ; both redirect URIs are registered, see Task 7).
- [ ] **Step 7: Run `npm run build` and `npm run lint`.** Expected: both succeed.
- [ ] **Step 8: Commit** `feat(sync): add google sign-in via worker`.

### Task 4: Drive client

**Files:**
- Create: `src/component/sync/drive.js`
- Test: `src/component/sync/drive.test.js`

**Interfaces:**
- Produces (no imports; token and file name are arguments):
  - `findFile(token, name) -> Promise<null | { id, modifiedTime: number, version: string, modified: number }>` — `GET https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='<name>'&fields=files(id,modifiedTime,appProperties)`; `version`/`modified` read from `appProperties`.
  - `download(token, id) -> Promise<object>` — `GET .../files/<id>?alt=media`.
  - `upload(token, { id, name, json, version, modified }) -> Promise<{ id, modifiedTime: number }>` — multipart (`uploadType=multipart`, `fields=id,modifiedTime`); create (POST, metadata `parents: ['appDataFolder']`) when `id` is null, else PATCH `.../upload/drive/v3/files/<id>`. Metadata sets `appProperties: { version, modified: String(modified) }`.
  - Non-2xx → throws `Error` with `.status`.

- [ ] **Step 1: Write `drive.test.js`** with a stubbed `globalThis.fetch`. Tests: "findFile returns null when no files"; "findFile maps appProperties" (`modifiedTime` ISO string → ms number, `modified` string → number); "upload creates in appDataFolder when id is null" (method POST, body contains `"appDataFolder"`); "upload body contains the full JSON" (3 MB string field survives intact); "non-2xx throws with status" (401).
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement `drive.js`.**
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(sync): add drive app data client`.

### Task 5: Sync engine + data hooks

**Files:**
- Create: `src/component/sync/index.js`
- Modify: `src/component/data/index.js` (`data.save`), `src/component/index.js` (export `sync` like other components), `src/index.js` (call `component.sync.init()` last)

**Interfaces:**
- Consumes: `decide` (Task 1), `auth` (Task 3), `findFile/download/upload` (Task 4), `data.get/set/backup/update/reload.render`, `version`.
- Produces `sync` object:
  - `sync.init()` — sets `sync.ready = true`; if signed in, runs `sync.run()`; adds `visibilitychange` (when visible) and `online` listeners that call `sync.run()`.
  - `sync.changed()` — called from `data.save()`; no-op unless `sync.ready`; sets `meta.dirty = true`, `meta.modified = Date.now()`, saves meta, schedules `sync.run()` after 3000 ms (debounced).
  - `sync.run() -> Promise<void>` — no-op if signed out, offline, or already running. Calls `findFile`, `decide`, then:
    - push: `upload(...)` with current `data.get(APP_NAME)`; on success `meta = { dirty: false, modified, synced: result.modifiedTime, fileId: result.id }`.
    - pull: if `backupLocal`, `data.backup(JSON.parse(local))`; `data.set(APP_NAME, JSON.stringify(data.update(remoteObj)))`; `meta = { dirty: false, modified: remote.modified, synced: remote.modifiedTime }`; `data.reload.render()`.
    - blocked/none: update status only.
    - On `AuthError` → status `reauth`. Other errors → status `error` (or `offline` when `!navigator.onLine`); meta unchanged, so `dirty` stays.
  - `sync.status` (`'signed-out'|'syncing'|'synced'|'offline'|'error'|'blocked'|'reauth'`), `sync.lastSync` (ms), `sync.onStatus(fn)` (one listener, used by the menu UI).
  - `sync.markChanged()` — same as `changed()` but ignores `ready` (used by Restore backup).
  - Meta stored in localStorage key `APP_NAME + 'SyncMeta'`. Default `{ dirty: false, modified: 0, synced: 0, fileId: null }`.
  - `sync.signIn()` / `sync.signOut()` — wrap `auth`; both reset meta `synced` and `fileId` to the default (so the next sign-in takes the "first sign-in" rule) and keep `dirty`/`modified`. `signIn` then runs `sync.run()`.
- `data.save()`: compare the new JSON string with `data.get(APP_NAME)` before writing; call `sync.changed()` only when they differ. (Avoids marking no-op saves dirty.)
- If `chrome.identity` is missing, `sync.init()` returns at once.

- [ ] **Step 1: Implement `sync/index.js` and the hooks.**
- [ ] **Step 2: Run `npm test`, `npm run lint`, `npm run build`.** Expected: all succeed.
- [ ] **Step 3: Manual checks** (load `dist/web` unpacked, with Task 7 setup done or a test OAuth client):
  1. Reload page with no edits: no upload request in Network panel.
  2. Edit a bookmark: one upload ~3 s later.
  3. Second Chrome profile, same Google account: open new tab → shows the edit.
  4. DevTools offline, edit, go online: upload happens; `SyncMeta.dirty` was `true` while offline.
- [ ] **Step 4: Commit** `feat(sync): sync config with drive on save and tab return`.

### Task 6: Data menu "Sync" section + Restore backup

**Files:**
- Modify: `src/component/menu/index.js:15` (data `sub`: `['sync', 'restore', 'backup', 'clear']`), `src/component/menuContent/dataSetting/index.js` (add `dataSetting.sync(parent)`), `src/locale/en_GB/messages.json`

**Interfaces:**
- Consumes: `sync`, `auth` (Tasks 3, 5).
- Message keys (en_GB values): `menuNavDataSubNavSync` "Sync", `menuContentDataSyncSignIn` "Sign in with Google", `menuContentDataSyncSignOut` "Sign out", `menuContentDataSyncSignedIn` "Signed in as", `menuContentDataSyncNow` "Sync now", `menuContentDataSyncStatusSynced` "Synced", `menuContentDataSyncStatusSyncing` "Syncing", `menuContentDataSyncStatusOffline` "Offline. Changes upload when you are back online.", `menuContentDataSyncStatusError` "Sync failed. nightTab tries again on the next tab.", `menuContentDataSyncStatusBlocked` "Update nightTab to sync. Your cloud config is from a newer version.", `menuContentDataSyncStatusReauth` "Sign in again to keep syncing.", `menuContentDataSyncStatusSignedOut` "Sign in to save your setup to your Google Drive and load it on other laptops.", `menuContentDataSyncRestoreBackup` "Restore backup", `menuContentDataSyncRestoreBackupHelper` "Replaces your current setup with the copy saved before the last sync change."

- [ ] **Step 1: Implement `dataSetting.sync(parent)`** with existing `Button`, `Control_helperText`, `form.wrap`/`form.inline`, `node`. Shows email + status + last sync time (`dateTime` utility or `toLocaleString`), Sign in / Sign out / Sync now, Restore backup (disabled when `data.get(APP_NAME + 'Backup')` is null). Restore: `data.set(APP_NAME, backup)`, `sync.markChanged()`, `data.reload.render()`. Hide the whole section's controls and show only a helper line when `chrome.identity` is missing. Re-render status via `sync.onStatus`.
- [ ] **Step 2: Run `npm run lint` and `npm run build`.** Expected: succeed.
- [ ] **Step 3: Manual check:** sign in → email shows; Sign out → status signed out, local bookmarks still there; `npm start` (web build) → Sync section shows only the helper line, no errors in console.
- [ ] **Step 4: Commit** `feat(sync): add sync controls to data menu`.

### Task 7: Owner setup guide + end-to-end check

**Files:**
- Create: `docs/sync-setup.md`

- [ ] **Step 1: Write `docs/sync-setup.md`:** Google Cloud project → enable Drive API → OAuth consent screen (External; scopes `drive.appdata`, `openid`, `email`; add owner as test user; move to "In production" early, because Testing mode expires refresh tokens after 7 days) → OAuth client type **Web application** with redirect URIs `https://<dev-extension-id>.chromiumapp.org/` and `https://<store-extension-id>.chromiumapp.org/` (dev ID from `chrome://extensions`) → deploy Worker (`worker/readme.md`) with `ALLOWED_ORIGINS=chrome-extension://<dev-id>,chrome-extension://<store-id>` → fill `GOOGLE_CLIENT_ID` and `SYNC_WORKER_URL` in `src/constant/index.js` → `npm run build` → load `dist/web` unpacked.
- [ ] **Step 2: Before writing, verify against live Google docs** that a Web-application client + PKCE still requires `client_secret` at the token endpoint and that `launchWebAuthFlow` redirect URIs use `chromiumapp.org`. Record any difference in the guide and tell the owner.
- [ ] **Step 3: Owner does the setup; then run the Task 5 manual checks 1–4 across two laptops or two Chrome profiles signed in to different Chrome accounts.**
- [ ] **Step 4: Commit** `docs: add sync setup guide`.
