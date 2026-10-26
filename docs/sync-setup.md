# Drive sync setup

Follow these steps once. Sync does not work until you finish them.

## Setup

1. Open Google Cloud Console. Create a new project.
2. Go to **APIs & Services > Library**. Enable **Google Drive API**.
3. Go to **OAuth consent screen**. Choose user type **External**.
4. Add these scopes: `https://www.googleapis.com/auth/drive.appdata`, `openid`, `email`.
5. Add your Google account as a test user.
6. Set the publishing status to **In production** soon. In Testing mode, refresh tokens expire after 7 days.
7. Run `npm run build`. Open `chrome://extensions`. Turn on Developer mode. Click **Load unpacked** and choose `dist/web`. Copy the extension ID.
8. Do not move the `dist/web` folder after this step. The manifest has no `key`, so a new path gives a new ID. A new ID breaks the redirect URI and `ALLOWED_ORIGINS`.
9. Go to **Credentials**. Create an OAuth client of type **Web application**.
10. Add the redirect URI `https://<dev-extension-id>.chromiumapp.org/`.
11. Copy the client ID and the client secret.
12. Open `worker/wrangler.toml`. Set `GOOGLE_CLIENT_ID` to the client ID.
13. Set `ALLOWED_ORIGINS=chrome-extension://<dev-id>` in the same file.
14. Run `npx wrangler login`. Run `npx wrangler secret put GOOGLE_CLIENT_SECRET` in `worker/` and paste the secret.
15. Run `npx wrangler deploy` in `worker/`. Copy the `*.workers.dev` URL. See `worker/readme.md`.
16. Set `GOOGLE_CLIENT_ID` and `SYNC_WORKER_URL` in `src/constant/index.js`.
17. Run `npm run build`. Click reload for the extension in `chrome://extensions`.
18. Open the Data menu, then the Sync tab. Click **Sign in with Google**.

### After the first Web Store upload

The store ID exists only after the first upload.

1. Add the redirect URI `https://<store-extension-id>.chromiumapp.org/` to the OAuth client.
2. Set `ALLOWED_ORIGINS=chrome-extension://<dev-id>,chrome-extension://<store-id>` in `worker/wrangler.toml`.
3. Run `npx wrangler deploy` again.

## Facts checked against Google docs

- Scope `drive.appdata` is non-sensitive. It needs only basic verification.
  [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- `launchWebAuthFlow` redirects use `https://<app-id>.chromiumapp.org/*`.
  [chrome.identity](https://developer.chrome.com/docs/extensions/reference/api/identity)
- Testing mode gives refresh tokens that expire in 7 days. This applies unless the scopes are only name, email, and profile. Our scope list includes `drive.appdata`, so the limit applies.
  [OAuth 2.0 overview](https://developers.google.com/identity/protocols/oauth2)
- Google docs list `client_secret` as "Optional" at the token endpoint. They do not mention PKCE for this flow.
  [Web server flow](https://developers.google.com/identity/protocols/oauth2/web-server)
  Community reports say a Web application client still needs `client_secret` with PKCE. This is not official. The Worker sends the secret, so the code is safe either way.

## Web Store notes

- Keep the `license` file and the copyright notice.
- Credit "Based on nightTab by zombieFox" with a link to https://github.com/zombieFox/nightTab.
- Use a new name and a new icon.
- Add a privacy policy. The Chrome Web Store requires one for extensions that handle user data. Config data goes to Drive, so this applies. [Developer program policy](https://developer.chrome.com/docs/webstore/program-policies/privacy)

## Verify it works

Use two Chrome profiles signed in to different Chrome accounts. Sign in to the same Google account for sync.

1. Reload the page with no edits. The Network panel shows no upload request.
2. Edit a bookmark. One upload happens about 3 seconds later.
3. In the second profile, open a new tab. It shows the edit.
4. In DevTools, set the network to offline. Edit a bookmark. Go online. The upload happens. `dirty` in the `nightTabSyncMeta` localStorage key was `true` while offline.
5. In DevTools, set network throttling to Slow 3G. Open a new tab so a pull starts. Edit a bookmark before the pull ends. The edit is still there after the pull.
6. Open the Data menu, then the Sync tab. Click **Restore backup**. Your current setup goes into the backup slot. The backup is applied. The change uploads to Drive.
7. Click **Restore backup** again. This undoes the restore, and the change uploads again.
