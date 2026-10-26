# nightTab sync token worker

This Cloudflare Worker keeps the Google client secret off the extension.
It exchanges auth codes and refreshes tokens.

## Endpoints

- `POST /token` body `{ code, code_verifier, redirect_uri }`
- `POST /refresh` body `{ refresh_token }`

Google's JSON and status come back unchanged.
A request from an origin not in `ALLOWED_ORIGINS` gets 403.

## Owner steps

1. Run `npx wrangler login`.
2. Edit `wrangler.toml`. Set `GOOGLE_CLIENT_ID` and `ALLOWED_ORIGINS` (the `chrome-extension://<id>` origin).
3. Run `npx wrangler secret put GOOGLE_CLIENT_SECRET` and paste the secret.
4. Run `npx wrangler deploy`.
5. Copy the `*.workers.dev` URL from the output. The extension uses it as the token endpoint.
