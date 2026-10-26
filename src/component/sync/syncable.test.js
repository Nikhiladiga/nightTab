import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncable } from './syncable.js';

const saved = (state, items) => JSON.stringify({ nightTab: true, state, bookmark: [{ name: 'g', items }] });

test('ui-only fields do not change the result', () => {
  const a = saved({ theme: 1, menu: false, search: false, header: { search: { show: true } } }, [{ url: 'a' }]);
  const b = saved({ theme: 1, menu: true, search: true, header: { search: { show: true, string: 'x' } } }, [{ url: 'a', searchMatch: true }]);
  assert.equal(syncable(a), syncable(b));
});

test('a real edit changes the result', () => {
  assert.notEqual(syncable(saved({ theme: 1 }, [{ url: 'a' }])), syncable(saved({ theme: 1 }, [{ url: 'b' }])));
});

test('null and invalid json pass through', () => {
  assert.equal(syncable(null), 'null');
  assert.equal(syncable('{'), '{');
});
