// WCAG contrast check for the ARQUS tokens.  Usage:
//   node scripts/check-contrast.mjs          check, exit 1 on any failure
//   node scripts/check-contrast.mjs --md     also print the table as Markdown (for docs/DESIGN.md)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const tokensPath = fileURLToPath(new URL('../src/styles/_tokens.scss', import.meta.url));
const tokens = Object.fromEntries(
  [...readFileSync(tokensPath, 'utf8').matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [
    m[1],
    m[2].toLowerCase(),
  ]),
);

const channel = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [foreground, background, minimum ratio, what it is]
const TEXT = 4.5;
const GRAPHIC = 3;
const pairs = [
  // primary text
  ...['paper', 'surface', 'plate', 'brand-tint', 'brand'].map((bg) => ['ink', bg, TEXT, `text on ${bg}`]),
  ['on-ink', 'ink', TEXT, 'text on ink (hero, active nav)'],
  ['on-ink-2', 'ink', TEXT, 'secondary text on ink'],
  // secondary and muted text
  ...['paper', 'surface', 'plate', 'brand-tint'].map((bg) => ['ink-2', bg, TEXT, `secondary text on ${bg}`]),
  ...['paper', 'surface', 'plate', 'brand-tint'].map((bg) => ['ink-3', bg, TEXT, `muted text on ${bg}`]),
  // blue text, links, icons
  ...['paper', 'surface', 'plate', 'brand-tint'].map((bg) => ['brand-deep', bg, TEXT, `link/icon on ${bg}`]),
  // semantic text
  ...['positive', 'negative', 'warning'].flatMap((n) => [
    [n, `${n}-bg`, TEXT, `${n} chip text`],
    [n, 'surface', TEXT, `${n} text on surface`],
  ]),
  // focus rings and meaningful graphics
  ...['paper', 'surface', 'plate', 'brand-tint'].map((bg) => ['brand-deep', bg, GRAPHIC, `focus ring on ${bg}`]),
  ...['surface', 'plate', 'paper'].map((bg) => ['ink', bg, GRAPHIC, `outline button border on ${bg}`]),
  ['brand', 'ink', GRAPHIC, 'cyan icon / art on ink (active nav icon, hero)'],
  ...['paper', 'surface'].map((bg) => ['ink-3', bg, GRAPHIC, `inactive nav icon on ${bg}`]),
  ...['surface', 'plate', 'paper'].map((bg) => ['line-strong', bg, GRAPHIC, `form field border on ${bg}`]),
];

// Cyan on light surfaces is decorative only (borders, glows, avatar fill). Reported, not gated:
// meaning is always carried by ink text, weight or position, never by the cyan alone.
const decorative = ['paper', 'surface'].map((bg) => ['brand', bg, `cyan accent on ${bg}`]);

const missing = [...pairs.flatMap((p) => [p[0], p[1]]), ...decorative.flatMap((p) => [p[0], p[1]])].filter(
  (n) => !tokens[n],
);
if (missing.length) {
  console.error('Unknown tokens:', [...new Set(missing)].join(', '));
  process.exit(2);
}

const rows = pairs.map(([fg, bg, min, use]) => {
  const r = ratio(tokens[fg], tokens[bg]);
  return { fg, bg, use, min, r, ok: r >= min };
});

const pad = (s, n) => String(s).padEnd(n);
for (const row of rows) {
  console.log(
    `${row.ok ? 'PASS' : 'FAIL'}  ${pad(row.r.toFixed(2) + ':1', 8)} (>= ${row.min})  --${row.fg} on --${row.bg}  ${row.use}`,
  );
}
for (const [fg, bg, use] of decorative) {
  console.log(`INFO  ${pad(ratio(tokens[fg], tokens[bg]).toFixed(2) + ':1', 8)} (decorative)  --${fg} on --${bg}  ${use}`);
}

if (process.argv.includes('--md')) {
  console.log('\n| Foreground | Background | Ratio | Needs | Use | Result |\n| --- | --- | --- | --- | --- | --- |');
  for (const row of rows) {
    console.log(
      `| \`--${row.fg}\` ${tokens[row.fg]} | \`--${row.bg}\` ${tokens[row.bg]} | ${row.r.toFixed(2)}:1 | ${row.min}:1 | ${row.use} | ${row.ok ? 'pass' : '**FAIL**'} |`,
    );
  }
  for (const [fg, bg, use] of decorative) {
    console.log(
      `| \`--${fg}\` ${tokens[fg]} | \`--${bg}\` ${tokens[bg]} | ${ratio(tokens[fg], tokens[bg]).toFixed(2)}:1 | n/a | ${use} (decorative) | info |`,
    );
  }
}

const failed = rows.filter((r) => !r.ok);
console.log(`\n${rows.length - failed.length}/${rows.length} pairs pass`);
process.exit(failed.length ? 1 : 0);
