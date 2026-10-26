import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide } from './decide.js';

const compareVersion = (a, b) => {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (x[i] > y[i]) return 1;
    if (x[i] < y[i]) return -1;
  }
  return 0;
};

const run = (meta, remote) => decide({
  meta: { dirty: false, modified: 0, synced: 0, ...meta },
  remote,
  appVersion: '7.6.0',
  compareVersion
});

const remoteAt = (modifiedTime, modified = 0, version = '7.6.0') => ({ modifiedTime, version, modified });

test('no remote pushes', () => {
  assert.deepEqual(run({}, null), { action: 'push', backupLocal: false, backupRemote: false });
});

test('newer remote version is blocked', () => {
  assert.equal(run({}, remoteAt(200, 0, '7.7.0')).action, 'blocked');
});

test('first sign-in pulls with backup', () => {
  assert.deepEqual(run({ synced: 0, dirty: true }, remoteAt(200)), { action: 'pull', backupLocal: true, backupRemote: false });
});

test('remote changed and local clean pulls without backup', () => {
  assert.deepEqual(run({ synced: 100 }, remoteAt(200)), { action: 'pull', backupLocal: false, backupRemote: false });
});

test('local dirty and remote unchanged pushes', () => {
  assert.equal(run({ synced: 200, dirty: true }, remoteAt(200)).action, 'push');
});

test('both changed, local newer pushes with remote backup', () => {
  assert.deepEqual(run({ synced: 100, dirty: true, modified: 60 }, remoteAt(200, 50)), { action: 'push', backupLocal: false, backupRemote: true });
});

test('local dirty and remote unchanged pushes without remote backup', () => {
  assert.deepEqual(run({ synced: 200, dirty: true }, remoteAt(200)), { action: 'push', backupLocal: false, backupRemote: false });
});

test('both changed, remote newer pulls with backup', () => {
  assert.deepEqual(run({ synced: 100, dirty: true, modified: 60 }, remoteAt(200, 70)), { action: 'pull', backupLocal: true, backupRemote: false });
});

test('nothing changed does nothing', () => {
  assert.equal(run({ synced: 200 }, remoteAt(200)).action, 'none');
});
