---
name: nighttab-config
description: Use when the user wants a nightTab new tab page set up, themed, or restyled from a plain-language request — bookmarks, groups, icons, fonts, colours, background images — or asks for a nightTab config/JSON file to import.
---

# nightTab config

## Overview

Turn a plain-language request into a nightTab config JSON file that the user imports with **Menu → Data → Restore**, plus a screenshot preview. Always start from the app's own defaults and let the bundled tools check the result: nightTab silently breaks on wrong keys, mismatched colours and missing icons.

Run every command from the repo root. Tools: `H=.claude/skills/nighttab-config/scripts`.

## Steps

1. **Setup.** If `node_modules/` is missing, run `npm ci`.
2. **Defaults.** `node $H/nighttab.mjs defaults > /tmp/nt-defaults.json`. It holds `config` (full default config, correct `version`), `bookmarkTemplate` and `groupTemplate`. Never type the state from memory.
3. **Bookmarks.** Use real URLs. If you are not sure of a URL, search for it; never guess deep links. Copy `bookmarkTemplate` per bookmark and `groupTemplate` per group. Pick each visual in this order:
   - Font Awesome icon if one fits: `node $H/nighttab.mjs icon <word>` gives `name` + `prefix`.
   - Else the site's own logo as an image: `https://www.google.com/s2/favicons?domain=<site domain>&sz=128` (128 px; unknown sites return 404, which `validate --online` catches). For a GitHub org or user, `https://github.com/<name>.png` is larger. The logo must stand out against the tile colour; a dark logo on a dark tile is invisible.
   - Letters only when neither exists.
4. **Look.** Font: any Google Fonts family name. Pick style, accent, background and overlay together so labels stay readable: dim a busy or bright wallpaper with `theme.background.image.opacity` (40–60 lets the dark theme background show through). Tiles, header bar and buttons take their colour from the theme grey scale: `theme.color.range.primary` (hue/saturation; `s: 0` = neutral grey) and `theme.color.contrast` (`start` low = darker greys on dark themes, e.g. `{start: 4, end: 90}` for AMOLED). `theme.bookmark.color` colours the large panel *behind* the groups, not the tiles. Do not set a bookmark item's own `color` — it changes the tile layout and the accent bar. For a pure black look use `background.type: "color"` with black, not a photo. For a wallpaper file on disk, embed it as `data:image/jpeg;base64,…` in `background.image.url`, take the accent from its dominant colour, and if titles sit on a bright part of the image, give `theme.bookmark.color` a dark colour at opacity 30–45. Check label contrast with `node $H/nighttab.mjs contrast <text r,g,b> <tile r,g,b>`; it must be ≥ 4.5.
5. **Write the file** with a short node script that deep-copies the defaults and changes only the needed keys. Save to `~/Downloads/nighttab-<short-name>.json`.
6. **Validate.** `node $H/nighttab.mjs validate <file> --online` until it prints `✓ valid`. It reports unknown keys, bad values, out-of-range numbers, rgb/hsl mismatches (it prints the rgb to use), unknown icons, and URLs or images that do not load. A `!` line is a warning only.
7. **Preview.** `node $H/preview.mjs <file> ~/Downloads/nighttab-<short-name>.png`. Open the PNG and look at it. Fix and repeat steps 5–7 until icons show, the font is right and all text is easy to read.
8. **Deliver.** Show the screenshot and give both paths. Tell the user: open a new tab → **Menu → Data → Restore** → import the file. If Drive sync is on, other laptops get it automatically.

## Format reference

| Key | Values |
|---|---|
| file | `{ nightTab: true, version, state, bookmark: [group] }` |
| `theme.style` | `dark` \| `light` \| `system` |
| `theme.accent` | `{ hsl: {h,s,l}, rgb: {r,g,b} }` — every colour needs **both**, matching |
| `theme.font.display` / `.ui` | `{ name: "Poppins", weight: 100–900, style: "normal" }` |
| `theme.background.type` | `theme` \| `accent` \| `color` \| `gradient` \| `image` \| `video` |
| `theme.background.image` | `{ url, blur, grayscale, scale, accent, opacity, vignette: {opacity, start, end} }` |
| `theme.shade` | `{ opacity, blur }` — backdrop behind open menus and dialogs, **not** a wallpaper overlay |
| `theme.color` | `{ range: { primary: {h, s} }, contrast: {start, end}, shades }` — grey scale for tiles, header, buttons |
| `theme.bookmark.color` | `{ by: "theme" \| "custom", hsl, rgb, opacity }` — panel behind the groups |
| bookmark `accent` | `{ by: "custom", hsl, rgb }` — this tile's icon and bar colour (e.g. white for a monochrome logo) |
| `theme.radius` | number |
| sizes | `bookmark.size`, `header.clock.size`, `group.name.size`: 50–500 |
| `header.search.show` | boolean |
| group | `{ name: {text, show}, collapse, toolbar, items: [bookmark] }` |
| bookmark | `url`, `display.name.text`, `display.visual.type` (`letter` \| `icon` \| `image`), `.letter.text`, `.icon {name, prefix, label}`, `.image.url`, `timestamp` (ms) |

Allowed values and ranges live in `state.option` and `state.minMax` in `src/component/state/index.js`.

## Common mistakes

| Mistake | Fix |
|---|---|
| Guessed logo or favicon URL returns 404 | Use an icon, `github.com/<name>.png`, or a URL that `validate --online` accepts |
| hsl changed, rgb left as before | Copy the rgb that `validate` prints |
| Partial `state` object | Start from the full defaults |
| `npx webpack` or building into `dist/` | Use `preview.mjs`; it builds into a temp folder |
| Reporting "done" without looking at the PNG | Open it; check icons, font and contrast |
