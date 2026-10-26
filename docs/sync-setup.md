# Drive sync setup

Follow these steps once. Sync does not work until you finish them.

## Setup

1. Open Google Cloud Console. Create a new project.
2. Go to **APIs & Services > Library**. Enable **Google Drive API**.
3. Go to **OAuth consent screen**. Choose user type **External**.
4. Add these scopes: `https://www.googleapis.com/auth/drive.appdata`, `openid`, `email`.
5. Add your Google account as a test user.
6. Set the publishing status to **In production** soon. In Testing mode, refresh tokens expire after 7 days.
7. Go to **Credentials**. Create an OAuth client of type **Web application**.
8. Add two redirect URIs:
   - `https://<dev-extension-id>.chromiumapp.org/`
   - `https://<store-extension-id>.chromiumapp.org/`
9. Find the dev ID at `chrome://extensions`. The store ID exists after the first Web Store upload.
10. Copy the client ID and the client secret.
11. Deploy the Worker. Follow `worker/readme.md`.
12. Set `ALLOWED_ORIGINS=chrome-extension://<dev-id>,chrome-extension://<store-id>` in `worker/wrangler.toml`.
13. Set `GOOGLE_CLIENT_ID` and `SYNC_WORKER_URL` in `src/constant/index.js`.
14. Run `npm run build`.
15. Open `chrome://extensions`. Turn on Developer mode. Click **Load unpacked** and choose `dist/web`.
16. Open the Data menu. Click Sync and sign in.

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

- Keep the `LICENSE` file and the copyright notice.
- Credit "Based on nightTab by zombieFox" with a link to https://github.com/zombieFox/nightTab.
- Use a new name and a new icon.
- Add a privacy policy. Google requires one for the Drive scope.

## Verify it works

Use two Chrome profiles signed in to different Chrome accounts. Sign in to the same Google account for sync.

1. Reload the page with no edits. The Network panel shows no upload request.
2. Edit a bookmark. One upload happens about 3 seconds later.
3. In the second profile, open a new tab. It shows the edit.
4. In DevTools, set the network to offline. Edit a bookmark. Go online. The upload happens. `SyncMeta.dirty` was `true` while offline.
5. In DevTools, set network throttling to Slow 3G. Open a new tab so a pull starts. Edit a bookmark before the pull ends. The edit is still there after the pull.
6. Click **Restore backup** in the Data menu. Check that the restored data replaces the config and syncs to Drive.
