# Google Drive sync — design

Date: 2026-10-26
Status: approved 2026-10-26

## Intent

The owner uses this nightTab fork daily on more than one laptop. Today, each switch means
rebuilding bookmarks, groups, theme and custom font by hand, because they forget to export
the JSON config before they switch. The fix: nightTab saves the config to the cloud on its
own, and every laptop picks up the latest config on its own. No manual export.

This is project 1 of 2. Project 2 (an AI-agent skill that writes nightTab config JSON from a
plain-language prompt) gets its own design later. It only produces a JSON file that the user
imports through the existing import flow; sync then spreads it. Nothing here depends on it.

## Goals

- User signs in once per laptop, inside nightTab, with a Google account of their choice.
- Every change saves to the user's Google Drive automatically.
- Every laptop shows the latest config without user action.
- Free to run. No database to maintain. The only server piece is one tiny token-exchange
  Worker on the Cloudflare free plan (see Login).

## Non-goals

- Sync for the plain web build (non-extension). Sign-in uses `chrome.identity`, extension only.
- Firefox / other browsers.
- Merging edits field by field. Whole-config, newest wins.
- Version history beyond the existing single backup slot.
- Sharing configs between different users.

## Anti-goals (failure even if it "works")

- Silent data loss: a sync that overwrites a config with no way back.
- Sync that depends on the Chrome profile account. The owner's Chrome profile can be a work
  account or a personal account; sync must follow the account they sign in with inside nightTab.
- nightTab becoming slow or unusable offline or when Drive is down.
- Credentials or secrets shipped in a way that lets others act as the user.

## Decisions taken with the owner

- **Storage:** a single JSON file in the user's Google Drive **app data folder**
  (`appDataFolder`, scope `https://www.googleapis.com/auth/drive.appdata`). Hidden from the
  user's Drive UI, private to this app. Chosen over Firebase (no project/rules to maintain)
  and over `chrome.storage.sync` (tied to Chrome profile account, 100 KB limit).
  Also rejected: storing configs in Cloudflare KV/D1/R2 behind the Worker. Simpler code,
  but free quotas are shared by all store users, the owner would hold every user's data
  (privacy policy burden), and D1 values are size-capped. Drive keeps each user's data in
  their own quota.
- **Login:** Google sign-in inside nightTab, independent of the Chrome profile account.
  Note: `chrome.identity.getAuthToken` uses the Chrome profile account, so it does **not**
  meet this. Use `chrome.identity.launchWebAuthFlow` against Google OAuth with the
  `https://<extension-id>.chromiumapp.org/` redirect.
- **Token exchange (owner chose option b):** a public Web-application OAuth client cannot
  redeem an authorization code for a refresh token without its `client_secret`, and the
  implicit flow only gives ~1 h access tokens whose silent renewal depends on a live Google
  session in that browser (often absent on the owner's work Chrome profile). So: the
  extension runs the authorization-code flow (with PKCE) via `launchWebAuthFlow`
  (`access_type=offline`, `prompt=consent` on first sign-in), then sends the code to a tiny
  **Cloudflare Worker** (free plan) that holds the `client_secret` and calls Google's token
  endpoint. The Worker also handles refresh (refresh token in, access token out). The
  Worker stores nothing. The extension keeps the refresh token in `chrome.storage.local`.
  Result: sign in once per laptop. Rejected: (a) no server — hourly "sign in again" on the
  work profile; (c) secret in the extension — readable by anyone who installs it.
- **Worker hardening:** only accept requests whose `Origin` is the extension origin(s)
  (`chrome-extension://<dev-id>` and `<store-id>`); only proxy Google's token endpoint;
  no logging of tokens. Worker source lives in this repo (e.g. `worker/`), with its own
  short deploy readme.
- **When laptop B updates:** on new tab open, and when the user returns to an already-open
  nightTab tab (`visibilitychange` / focus). If the Drive copy is newer than local, replace
  local and re-render (existing `data.reload.render()`).
- **Upload:** after each `data.save()`, debounced a few seconds.
- **Conflict rule:** newest save wins. The losing local version goes into the existing
  backup slot (`data.backup()`, key `nightTabBackup`) so the user can recover it.
- **Offline:** nightTab works from localStorage as today; pending upload retries when the
  connection returns.
- **Distribution:** the owner plans to publish this fork on the Chrome Web Store under a
  new name and icon (GPL-3 obligations: keep `license` and copyright notices, publish
  source, state changes, credit "Based on nightTab by zombieFox" with a link in readme,
  store listing, and in-app menu). Publishing gives the fixed extension ID that the OAuth
  client needs. Rename/credit work is separate from this design but must not be forgotten.

## Existing code to hook into

- `src/component/data/index.js`: `data.save()` (line ~291) is the single write path;
  `data.load()` the single read path; `data.backup()`, `data.restore()`, `data.update()`
  (runs version migrations on older configs), `data.reload.render()`.
- `src/component/menuContent/dataSetting/index.js`: the Data menu section (import/export
  live here). Sign-in UI goes here.
- `src/manifest.json`: MV3; needs `identity` permission and a fixed `key` for local
  unpacked builds so the extension ID matches the OAuth client.

## Behaviour

1. **Sign in** (Data menu): button "Sign in with Google". After sign-in show the account
   email, last sync time, and "Sign out".
2. **First sign-in on a laptop** (builder's call, my default): if Drive has a config, the
   Drive copy wins and local goes to backup; if Drive is empty, upload local.
3. **Save:** `data.save()` writes localStorage as now, stamps a modified time, then
   schedules an upload.
4. **Pull:** on load and on tab return, read the Drive file's modified time; download only
   when newer than local. Run downloaded data through the same `data.update()` migration
   path as imports.
5. **Errors:** a failed sync never blocks the page. Show sync state in the Data menu
   (synced / offline / error / signed out). Expired access token: refresh through the
   Worker; if the refresh token is rejected, show "Sign in again".
6. **Upload triggers (my call):** only user-driven `data.save()` calls stamp the modified
   time and upload. Startup, migration (`data.load()` → `data.update()`) and applying a
   pulled config must not, so a stale laptop never overwrites a newer Drive copy.
7. **Backups (my call):** back up local data before a pull replaces it only when local
   has unsynced edits (otherwise the existing backup is kept). Add a "Restore backup"
   button in the Data menu; nothing reads `nightTabBackup` in the UI today.
8. **Version guard (my call):** refuse to apply a Drive config whose `version` is newer
   than the running extension (`data.update()` cannot migrate down); show "Update
   nightTab to sync".
9. **Drive file name (my call):** a fixed constant (e.g. `nighttab-config.json`), not
    derived from `APP_NAME`, so the planned rename does not orphan the file.
10. **Sign out:** stop syncing, keep local data, revoke/forget the token.

## Constraints

- A Google OAuth client of type **Web application** (redirect URIs:
  `https://<dev-id>.chromiumapp.org/` and `https://<store-id>.chromiumapp.org/`) and a
  Cloudflare account must be set up by the owner; these are manual steps only they can do.
  Builder provides a step-by-step guide. The client ID ships in the extension (public by
  design); the client secret lives only in the Worker as a secret env var.
- While the OAuth consent screen is in "Testing" mode, only listed test users can sign in,
  and Google expires refresh tokens after 7 days. The owner should move the consent screen
  to "In production" early; `drive.appdata` is a non-sensitive scope (light review).
- Config may contain uploaded background images as data URLs, so size can reach MBs. Drive
  handles this; use multipart or resumable upload as needed.
- Work Google accounts may block third-party apps; the owner will sign in with a personal
  account.
- Match the codebase: plain JS modules, one component folder, existing control components
  (`Button`, etc.) for UI.

## Left to the builder

- Module layout (e.g. new `src/component/sync/`), debounce interval, polling details.
- How "modified time" is stored locally and compared (Drive `modifiedTime` vs. a stamp
  inside the config).
- Exact OAuth flow details and token storage (`chrome.storage.local` is fine).
- Test approach for the sync decision logic (which copy wins) — this logic needs a test.
- Handling of clock skew between laptops and of several nightTab tabs open at once.
