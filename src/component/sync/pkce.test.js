import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomVerifier, codeChallenge, emailFromIdToken } from './pkce.js';

test('codeChallenge matches the RFC 7636 vector', async () => {
  assert.equal(
    await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
  );
});

test('randomVerifier is long base64url', () => {
  const verifier = randomVerifier();
  assert.ok(verifier.length >= 43);
  assert.match(verifier, /^[A-Za-z0-9_-]+$/);
});

test('emailFromIdToken reads the email claim', () => {
  const payload = Buffer.from(JSON.stringify({ email: 'a@b.c' })).toString('base64url');
  assert.equal(emailFromIdToken(`header.${payload}.sig`), 'a@b.c');
});
