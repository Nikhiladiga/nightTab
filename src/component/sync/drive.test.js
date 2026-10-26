import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drive } from './drive.js';

const stub = (status, body) => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return calls;
};

test('findFile returns null when no files', async () => {
  stub(200, { files: [] });
  assert.equal(await drive.findFile('t', 'nightTab.json'), null);
});

test('findFile maps appProperties', async () => {
  const calls = stub(200, { files: [{ id: 'a', modifiedTime: '2026-01-01T00:00:00.000Z', appProperties: { version: '7.6.0', modified: '123' } }] });
  assert.deepEqual(await drive.findFile('t', 'nightTab.json'), {
    id: 'a',
    modifiedTime: Date.parse('2026-01-01T00:00:00.000Z'),
    version: '7.6.0',
    modified: 123
  });
  assert.ok(calls[0].url.includes(encodeURIComponent("name='nightTab.json'")));
});

test('upload creates in appDataFolder when id is null', async () => {
  const calls = stub(200, { id: 'n', modifiedTime: '2026-01-01T00:00:00.000Z' });
  const result = await drive.upload('t', { id: null, name: 'x.json', json: '{}', version: '7.6.0', modified: 5 });
  assert.equal(calls[0].options.method, 'POST');
  assert.ok(calls[0].options.body.includes('"appDataFolder"'));
  assert.deepEqual(result, { id: 'n', modifiedTime: Date.parse('2026-01-01T00:00:00.000Z') });
});

test('upload patches when id is given', async () => {
  const calls = stub(200, { id: 'a', modifiedTime: '2026-01-01T00:00:00.000Z' });
  await drive.upload('t', { id: 'a', name: 'x.json', json: '{}', version: '7.6.0', modified: 5 });
  assert.equal(calls[0].options.method, 'PATCH');
  assert.ok(calls[0].url.includes('/upload/drive/v3/files/a'));
  assert.ok(!calls[0].options.body.includes('appDataFolder'));
});

test('upload body contains the full JSON', async () => {
  const calls = stub(200, { id: 'n', modifiedTime: '2026-01-01T00:00:00.000Z' });
  const json = JSON.stringify({ big: 'x'.repeat(3 * 1024 * 1024) });
  await drive.upload('t', { id: null, name: 'x.json', json, version: '7.6.0', modified: 5 });
  assert.ok(calls[0].options.body.includes(json));
});

test('non-2xx throws with status', async () => {
  stub(401, {});
  await assert.rejects(drive.findFile('t', 'x'), (error) => error.status === 401);
});
