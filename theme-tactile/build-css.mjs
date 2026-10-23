// Erzeugt <theme>.css aus <theme>.theme.js (Vorgabe: theme-tactile/tactile).
// Aufruf: node theme-tactile/build-css.mjs [pfad/zu/name.theme.js]
// Daneben wird <pfad>/touch.css (falls vorhanden) angehaengt.
// Vorlage ist der NEON-NOIR-Variablenblock des gebauten Stylesheets (gleiches
// Schema, identische Palette); alles Theme-Spezifische wird ersetzt, danach
// werden die Touch-Regeln aus touch.css angehaengt.
//   node theme-tactile/build-css.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const themeFile = process.argv[2] ? resolve(process.argv[2]) : join(here, 'tactile.theme.js');
const themeDir = dirname(themeFile);
const theme = createRequire(import.meta.url)(themeFile);

const cssFile = readdirSync(join(root, 'assets')).find((f) => /^index-.*\.css$/.test(f));
const bundleCss = readFileSync(join(root, 'assets', cssFile), 'utf8');
const m = bundleCss.match(/\[data-theme=neon-noir\]\{([^}]*)\}/);
if (!m) throw new Error('NEON-NOIR-Block nicht gefunden in ' + cssFile);

const vars = new Map();
for (const decl of m[1].split(';')) {
  const i = decl.indexOf(':');
  if (i < 0) continue;
  vars.set(decl.slice(0, i).trim(), decl.slice(i + 1).trim());
}

const hex = (h) => {
  const s = h.replace('#', '');
  const v = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  return [0, 2, 4].map((k) => parseInt(v.slice(k, k + 2), 16));
};
const rgb = (c) => hex(c).join(' ');
const mix = (base, ink, a) => hex(base).map((b, i) => Math.round(b * (1 - a) + hex(ink)[i] * a)).join(' ');

const t = theme.tokens;
const tint = theme.tint;
const set = (k, v) => { if (!vars.has(k)) throw new Error('Unbekannte Variable ' + k); vars.set(k, v); touched.add(k); };
const touched = new Set();

set('color-scheme', theme.scheme);
const surf = { darkest: 'darkest', groove: 'groove', dark: 'dark', panel: 'panel', elevated: 'elevated', accent: 'accent', border: 'border', key: 'key', 'key-selected': 'keySelected' };
for (const [k, v] of Object.entries(surf)) set(`--hw-${k}`, rgb(t.surface[v]));
set('--hw-text', rgb(t.text.text)); set('--hw-muted', rgb(t.text.muted)); set('--hw-strong', rgb(t.text.strong));
set('--hw-ink', rgb(t.overlay.ink)); set('--hw-shade', rgb(t.overlay.shade));
set('--hw-scrim', t.overlay.scrim); set('--hw-scrim-soft', t.overlay.scrimSoft);

for (const [name, a] of Object.entries(t.accents)) {
  for (const role of ['primary', 'bright', 'dim', 'on']) for (const ch of ['fg', 'fill', 'line']) set(`--${name}-${role}-${ch}`, rgb(a[role][ch]));
  for (const ch of ['fg', 'fill', 'line']) {
    set(`--${name}-tint-${ch}`, mix(tint.base, a.ink, tint.amount));
    set(`--${name}-tint-raised-${ch}`, mix(tint.baseRaised, a.ink, tint.amountRaised));
  }
  set(`--${name}-glow`, a.glow); set(`--${name}-glow-strong`, a.glowStrong);
}
for (const [name, l] of Object.entries(t.led)) for (const ch of ['fg', 'fill', 'line']) set(`--led-${name}-${ch}`, rgb(l[ch]));

// --tint-<farbe>: Basis mit Tailwind-500 der Farbe gemischt (wie im Original).
for (const k of [...vars.keys()]) {
  const mm = k.match(/^--tint-([a-z]+)(-raised)?$/);
  if (!mm) continue;
  const c500 = vars.get(`--pal-fill-${mm[1]}-500`).split(' ').map(Number);
  const asHex = '#' + c500.map((n) => n.toString(16).padStart(2, '0')).join('');
  set(k, mm[2] ? mix(tint.baseRaised, asHex, tint.amountRaised) : mix(tint.base, asHex, tint.amount));
}

set('--crt-chassis', rgb(t.crt.chassis)); set('--crt-bezel', rgb(t.crt.bezel)); set('--crt-inscription', rgb(t.crt.inscription));
for (const k of ['fill', 'ink', 'value', 'line', 'lamp']) set(`--crt-ui-${k}`, rgb(t.crt.ui[k]));
set('--crt-vignette', t.crt.vignette); set('--crt-reflection', t.crt.reflection);
const sh = { inset: 'inset', raised: 'raised', button: 'button', 'button-pressed': 'buttonPressed', led: 'led', 'key-rest': 'keyRest', 'key-lip': 'keyLip', 'key-pressed': 'keyPressed' };
for (const [k, v] of Object.entries(sh)) set(`--shadow-${k}`, t.shadow[v]);
set('--bg-brushed', t.decor.brushedMetal); set('--bg-knurled', t.decor.knurled);
set('--fader-groove-bg', t.decor.faderGrooveBg); set('--fader-groove-shadow', t.decor.faderGrooveShadow);
set('--knurl-dot', t.decor.knurlDot); set('--pad-inset-shadow', t.decor.padInsetShadow); set('--pad-active-shadow', t.decor.padActiveShadow);
set('--glow-scale', String(t.glowScale));

const untouched = [...vars.keys()].filter((k) => !touched.has(k) && !/^--pal-/.test(k));
if (untouched.length) throw new Error('Nicht gemappte Variablen: ' + untouched.join(', '));

const block = `[data-theme=${theme.id}]{` + [...vars].map(([k, v]) => `${k}:${v}`).join(';') + '}';
const touchFile = join(themeDir, 'touch.css');
const touch = existsSync(touchFile) ? readFileSync(touchFile, 'utf8') : '';
const header = `/* ${theme.name} - generiert von theme-tactile/build-css.mjs aus ${theme.id}.theme.js. Nicht von Hand bearbeiten. */\n`;
writeFileSync(join(themeDir, `${theme.id}.css`), header + block + '\n' + touch);

// Kontrastbericht (WCAG 2.x).
const lum = (c) => { const [r, g, b] = hex(c).map((n) => { const s = n / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return ((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)); };
const checks = [
  ['text / panel', t.text.text, t.surface.panel, 7],
  ['muted / panel', t.text.muted, t.surface.panel, 4.5],
  ['text / elevated', t.text.text, t.surface.elevated, 7],
  ['muted / elevated', t.text.muted, t.surface.elevated, 4.5],
  ['border / panel', t.surface.border, t.surface.panel, 1.5],
];
for (const [n, a] of Object.entries(t.accents)) {
  checks.push([`${n} primary / panel`, a.primary.fill, t.surface.panel, 3]);
  checks.push([`${n} on / primary`, a.on.fill, a.primary.fill, 4.5]);
  checks.push([`${n} primary / darkest`, a.primary.fill, t.surface.darkest, 3]);
}
for (const [n, l] of Object.entries(t.led)) if (n !== 'off') checks.push([`led ${n} / panel`, l.fill, t.surface.panel, 3]);
let bad = 0;
console.log('Kontrast'.padEnd(28) + 'Wert'.padStart(7) + '  Min  Status');
for (const [n, a, b, min] of checks) { const r = ratio(a, b); const ok = r >= min; if (!ok) bad++; console.log(n.padEnd(28) + r.toFixed(2).padStart(7) + '  ' + String(min).padEnd(4) + (ok ? ' ok' : ' ZU NIEDRIG')); }
console.log(`\n${vars.size} Variablen, ${touched.size} gesetzt, ${vars.size - touched.size} Palette uebernommen. Kontrastverstoesse: ${bad}`);
if (bad) process.exitCode = 1;
