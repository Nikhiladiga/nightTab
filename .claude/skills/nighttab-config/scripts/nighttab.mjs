// nightTab config helper. Run from the repo root:
//   node .claude/skills/nighttab-config/scripts/nighttab.mjs defaults
//   node .claude/skills/nighttab-config/scripts/nighttab.mjs icon <word>
//   node .claude/skills/nighttab-config/scripts/nighttab.mjs validate <config.json> [--online]
//   node .claude/skills/nighttab-config/scripts/nighttab.mjs contrast <r,g,b> <r,g,b>
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const src = (p) => readFileSync(resolve(ROOT, 'src', p), 'utf8');

// The source modules are plain object literals; strip the ESM export and evaluate them.
const evalModule = (code, from, to) => {
  const m = { exports: {} };
  new Function('module', code.replace(from, to))(m);
  return m.exports;
};

export const load = () => {
  const state = evalModule(src('component/state/index.js'), 'export { state };', 'module.exports = state;');
  const bookmarkTemplate = evalModule(src('component/bookmarkDefault/index.js'), 'export const bookmarkDefault =', 'module.exports =');
  const groupTemplate = evalModule(src('component/groupDefault/index.js'), 'export const groupDefault =', 'module.exports =');
  const icons = evalModule(src('component/fontawesome/index.js').replace("import './index.css';", ''), 'export const fontawesome =', 'module.exports =');
  const version = src('component/version/index.js').match(/version\.number = '([^']+)'/)[1];
  return { state, bookmarkTemplate, groupTemplate, icons, version };
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export const hslToRgb = ({ h, s, l }) => {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return { r: f(0), g: f(8), b: f(4) };
};

export const contrast = (a, b) => {
  const lum = ({ r, g, b }) => {
    const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
};

const iconPrefix = (icon) => (icon.styles.includes('solid') ? 'fas' : icon.styles.includes('brands') ? 'fab' : null);

export const findIcons = (icons, word) => {
  const w = word.toLowerCase();
  return icons
    .filter((i) => i.name.includes(w) || i.label.toLowerCase().includes(w) || i.search.some((s) => String(s).toLowerCase().includes(w)))
    .map((i) => ({ name: i.name, prefix: iconPrefix(i), label: i.label }))
    .filter((i) => i.prefix);
};

// Walk the config state against default/option/minMax and collect error strings.
const checkState = (value, def, option, minMax, path, errors) => {
  for (const [key, v] of Object.entries(value)) {
    const p = path ? path + '.' + key : key;
    if (!(key in def)) { errors.push(`unknown key state.${p}`); continue; }
    const d = def[key];
    if (isObj(d) && !isObj(v)) { errors.push(`state.${p} must be an object`); continue; }
    if (!isObj(d) && d !== null && !Array.isArray(d) && typeof v !== typeof d) { errors.push(`state.${p} must be ${typeof d}, got ${typeof v}`); continue; }
    const opt = option && option[key];
    if (Array.isArray(opt) && !opt.includes(v)) errors.push(`state.${p} = ${JSON.stringify(v)} not one of ${opt.join('|')}`);
    const mm = minMax && minMax[key];
    if (mm && typeof mm.min === 'number' && typeof v === 'number' && (v < mm.min || v > mm.max)) errors.push(`state.${p} = ${v} outside ${mm.min}-${mm.max}`);
    if (isObj(v) && isObj(v.hsl) && isObj(v.rgb)) {
      const want = hslToRgb(v.hsl);
      if (['r', 'g', 'b'].some((c) => Math.abs(want[c] - v.rgb[c]) > 3)) errors.push(`state.${p}: rgb ${JSON.stringify(v.rgb)} does not match hsl (expected ${JSON.stringify(want)})`);
    }
    if (isObj(v) && isObj(d) && Object.keys(d).length) checkState(v, d, isObj(opt) ? opt : null, isObj(mm) ? mm : null, p, errors);
  }
};

const isHttpUrl = (u) => { try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch { return false; } };

export const validate = (config, ref = load()) => {
  const errors = [];
  if (!isObj(config)) return ['config must be a JSON object'];
  if (config.nightTab !== true) errors.push('nightTab must be true');
  if (config.version !== ref.version) errors.push(`version must be "${ref.version}", got ${JSON.stringify(config.version)}`);
  if (!isObj(config.state)) errors.push('state must be an object');
  else checkState(config.state, ref.state.default, ref.state.option, ref.state.minMax, '', errors);
  if (!Array.isArray(config.bookmark)) { errors.push('bookmark must be an array of groups'); return errors; }
  const iconNames = new Map(ref.icons.map((i) => [i.name, i]));
  config.bookmark.forEach((group, g) => {
    if (!isObj(group) || !isObj(group.name) || !Array.isArray(group.items)) { errors.push(`bookmark[${g}] must be a group ({ name: {text, show}, items: [] })`); return; }
    group.items.forEach((item, i) => {
      const at = `bookmark[${g}].items[${i}]`;
      if (!isHttpUrl(item.url)) errors.push(`${at}.url must be an http(s) URL`);
      const visual = item.display && item.display.visual;
      if (!isObj(visual)) { errors.push(`${at}.display.visual missing`); return; }
      if (!['letter', 'icon', 'image'].includes(visual.type)) errors.push(`${at} visual.type must be letter|icon|image`);
      if (visual.type === 'icon') {
        const icon = iconNames.get(visual.icon && visual.icon.name);
        if (!icon) errors.push(`${at} icon "${visual.icon && visual.icon.name}" is not in the app's Font Awesome list`);
        else if (visual.icon.prefix !== iconPrefix(icon)) errors.push(`${at} icon "${icon.name}" needs prefix "${iconPrefix(icon)}"`);
      }
      if (visual.type === 'image' && !isHttpUrl(visual.image && visual.image.url)) errors.push(`${at} image url must be an http(s) URL`);
    });
  });
  return errors;
};

// Every URL the page will load or link to, with where it came from.
export const urlsOf = (config) => {
  const out = [];
  const bg = config.state && config.state.theme && config.state.theme.background;
  if (bg && bg.type === 'image' && bg.image.url) out.push(['background image', bg.image.url]);
  (config.bookmark || []).forEach((group) => (group.items || []).forEach((item) => {
    out.push([`link "${item.display.name.text}"`, item.url]);
    if (item.display.visual.type === 'image') out.push([`image "${item.display.name.text}"`, item.display.visual.image.url]);
  }));
  return out;
};

// Images must load in the page; links only open in the user's browser, so bot blocks (401/403/429, LinkedIn 999) on links are warnings.
const checkOnline = async (config) => {
  const errors = [];
  const warnings = [];
  for (const [what, url] of urlsOf(config)) {
    const isImage = what.includes('image');
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'Mozilla/5.0' } });
      if (!res.ok) (!isImage && [401, 403, 429, 999].includes(res.status) ? warnings : errors).push(`${what}: ${url} returned ${res.status}`);
      else if (isImage && !String(res.headers.get('content-type')).startsWith('image/')) errors.push(`${what}: ${url} is not an image (${res.headers.get('content-type')})`);
    } catch (e) {
      errors.push(`${what}: ${url} failed (${e.message})`);
    }
  }
  return { errors, warnings };
};

const main = async ([cmd, ...args]) => {
  if (cmd === 'defaults') {
    const { state, bookmarkTemplate, groupTemplate, version } = load();
    console.log(JSON.stringify({ config: { nightTab: true, version, state: state.default, bookmark: [] }, bookmarkTemplate, groupTemplate }, null, 2));
  } else if (cmd === 'icon' && args[0]) {
    console.log(JSON.stringify(findIcons(load().icons, args[0]).slice(0, 25), null, 2));
  } else if (cmd === 'validate' && args[0]) {
    const config = JSON.parse(readFileSync(args[0], 'utf8'));
    const errors = validate(config);
    if (args.includes('--online')) {
      const online = await checkOnline(config);
      errors.push(...online.errors);
      online.warnings.forEach((w) => console.warn('! ' + w + ' (link may still work in a browser)'));
    }
    if (errors.length) { console.error(errors.map((e) => '✗ ' + e).join('\n')); process.exit(1); }
    console.log('✓ valid');
  } else if (cmd === 'contrast' && args[1]) {
    const rgb = (s) => { const [r, g, b] = s.split(',').map(Number); return { r, g, b }; };
    console.log(contrast(rgb(args[0]), rgb(args[1])));
  } else {
    console.error('usage: nighttab.mjs defaults | icon <word> | validate <file> [--online] | contrast <r,g,b> <r,g,b>');
    process.exit(2);
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
