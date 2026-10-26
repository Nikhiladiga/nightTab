import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from './index.js';

const env = {
  GOOGLE_CLIENT_ID: 'id123',
  GOOGLE_CLIENT_SECRET: 'secret456',
  ALLOWED_ORIGINS: 'chrome-extension://abc,https://example.com'
};

let calls;

const stubFetch = (body, status = 200) => {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  };
};

const post = (path, body, origin = 'chrome-extension://abc') => new Request('https://worker.test' + path, {
  method: 'POST',
  headers: origin ? { Origin: origin, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

beforeEach(() => stubFetch({}));

test('rejects unknown origin', async () => {
  const res = await worker.fetch(post('/token', {}, 'https://evil.com'), env);
  assert.equal(res.status, 403);
  assert.equal(calls.length, 0);
});

test('rejects missing origin', async () => {
  const res = await worker.fetch(post('/token', {}, null), env);
  assert.equal(res.status, 403);
  assert.equal(calls.length, 0);
});

test('token exchange adds secret', async () => {
  stubFetch({ access_token: 'at' });
  const res = await worker.fetch(post('/token', { code: 'c', code_verifier: 'v', redirect_uri: 'r' }), env);
  assert.equal(calls[0].url, 'https://oauth2.googleapis.com/token');
  const form = new URLSearchParams(calls[0].init.body);
  assert.equal(form.get('client_secret'), 'secret456');
  assert.equal(form.get('client_id'), 'id123');
  assert.equal(form.get('grant_type'), 'authorization_code');
  assert.equal(form.get('code'), 'c');
  assert.equal(form.get('code_verifier'), 'v');
  assert.equal(form.get('redirect_uri'), 'r');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'chrome-extension://abc');
  assert.deepEqual(await res.json(), { access_token: 'at' });
});

test('refresh passes Google 400 through unchanged', async () => {
  stubFetch({ error: 'invalid_grant' }, 400);
  const res = await worker.fetch(post('/refresh', { refresh_token: 'rt' }), env);
  const form = new URLSearchParams(calls[0].init.body);
  assert.equal(form.get('grant_type'), 'refresh_token');
  assert.equal(form.get('refresh_token'), 'rt');
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'invalid_grant' });
});

test('OPTIONS preflight', async () => {
  const req = new Request('https://worker.test/token', { method: 'OPTIONS', headers: { Origin: 'https://example.com' } });
  const res = await worker.fetch(req, env);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://example.com');
  assert.match(res.headers.get('Access-Control-Allow-Methods'), /POST/);
  assert.match(res.headers.get('Access-Control-Allow-Headers'), /Content-Type/);
});

test('unknown path returns 404', async () => {
  const res = await worker.fetch(post('/nope', {}), env);
  assert.equal(res.status, 404);
});

test('invalid JSON body returns 400', async () => {
  const req = new Request('https://worker.test/token', { method: 'POST', headers: { Origin: 'chrome-extension://abc' }, body: 'not json' });
  const res = await worker.fetch(req, env);
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});
