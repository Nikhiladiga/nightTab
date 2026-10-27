import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, validate, findIcons, hslToRgb, contrast } from './nighttab.mjs';

const ref = load();
const base = () => JSON.parse(JSON.stringify({ nightTab: true, version: ref.version, state: ref.state.default, bookmark: [] }));
const item = (visual) => ({ ...JSON.parse(JSON.stringify(ref.bookmarkTemplate)), url: 'https://github.com', display: { ...ref.bookmarkTemplate.display, name: { text: 'GitHub', show: true }, visual: { ...ref.bookmarkTemplate.display.visual, ...visual } } });
const withItems = (...items) => { const c = base(); c.bookmark = [{ ...ref.groupTemplate, name: { text: 'Dev', show: true }, items }]; return c; };

test('default config is valid', () => {
  assert.deepEqual(validate(base(), ref), []);
});

test('wrong version, unknown key, bad enum, out-of-range, type mismatch', () => {
  const c = base();
  c.version = '0.0.1';
  c.state.theme.colour = {};
  c.state.theme.style = 'neon';
  c.state.bookmark.size = 9000;
  c.state.theme.radius = '25';
  const errors = validate(c, ref).join('\n');
  assert.match(errors, /version must be/);
  assert.match(errors, /unknown key state\.theme\.colour/);
  assert.match(errors, /theme\.style = "neon" not one of/);
  assert.match(errors, /bookmark\.size = 9000 outside 50-500/);
  assert.match(errors, /theme\.radius must be number/);
});

test('hsl and rgb must agree', () => {
  const c = base();
  c.state.theme.accent.hsl = { h: 165, s: 85, l: 55 };
  assert.match(validate(c, ref).join('\n'), /accent: rgb .* does not match hsl/);
  c.state.theme.accent.rgb = hslToRgb(c.state.theme.accent.hsl);
  assert.deepEqual(validate(c, ref), []);
});

test('icon must exist with the right prefix', () => {
  assert.deepEqual(validate(withItems(item({ type: 'icon', icon: { name: 'github', prefix: 'fab', label: 'GitHub' } })), ref), []);
  assert.match(validate(withItems(item({ type: 'icon', icon: { name: 'github', prefix: 'fas', label: 'GitHub' } })), ref).join(), /needs prefix "fab"/);
  assert.match(validate(withItems(item({ type: 'icon', icon: { name: 'typesense', prefix: 'fab', label: '' } })), ref).join(), /not in the app's Font Awesome list/);
});

test('bookmark url and image url must be http(s)', () => {
  const bad = item({ type: 'image', image: { url: 'logo.png' } });
  bad.url = 'github.com';
  const errors = validate(withItems(bad), ref).join('\n');
  assert.match(errors, /url must be an http\(s\) URL/);
  assert.match(errors, /image url must be an http\(s\) URL/);
});

test('findIcons returns names with prefixes', () => {
  assert.ok(findIcons(ref.icons, 'npm').some((i) => i.name === 'npm' && i.prefix === 'fab'));
});

test('contrast ratio', () => {
  assert.equal(contrast({ r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 }), 21);
});
