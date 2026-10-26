import { APP_NAME, GOOGLE_CLIENT_ID, SYNC_WORKER_URL } from '../../constant/index';
import { randomVerifier, codeChallenge, emailFromIdToken } from './pkce';

const KEY = APP_NAME + 'SyncAuth';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata openid email';
const EXPIRY_MARGIN = 60 * 1000;

class AuthError extends Error { }

const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch (error) {
    return null;
  }
};

const save = (state) => localStorage.setItem(KEY, JSON.stringify(state));

const post = async (path, body) => {
  const res = await fetch(SYNC_WORKER_URL + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
};

const auth = {};

auth.signIn = async () => {
  const redirectUri = chrome.identity.getRedirectURL();
  const verifier = randomVerifier();
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent select_account',
    code_challenge: await codeChallenge(verifier),
    code_challenge_method: 'S256'
  });
  const result = await chrome.identity.launchWebAuthFlow({ url, interactive: true });
  const code = new URL(result).searchParams.get('code');
  if (!code) {
    throw new Error('Sign-in was not completed');
  }
  const { ok, status, data } = await post('/token', { code, code_verifier: verifier, redirect_uri: redirectUri });
  if (!ok) {
    throw new Error('Token exchange failed (' + status + ')');
  }
  const email = emailFromIdToken(data.id_token);
  save({
    refreshToken: data.refresh_token,
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    email
  });
  return { email };
};

auth.getToken = async () => {
  const state = load();
  if (!state) {
    throw new AuthError('Not signed in');
  }
  if (state.expiresAt - Date.now() > EXPIRY_MARGIN) {
    return state.accessToken;
  }
  const { ok, status, data } = await post('/refresh', { refresh_token: state.refreshToken });
  if (status === 400 || status === 401) {
    throw new AuthError('Sign in again');
  }
  if (!ok) {
    throw new Error('Token refresh failed (' + status + ')');
  }
  save({
    ...state,
    refreshToken: data.refresh_token || state.refreshToken,
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000
  });
  return data.access_token;
};

auth.signOut = async () => {
  const state = load();
  if (state) {
    await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(state.refreshToken), { method: 'POST' }).catch(() => { });
  }
  localStorage.removeItem(KEY);
};

auth.isSignedIn = () => !!load();

auth.email = () => (load() || {}).email || null;

export { auth, AuthError };
