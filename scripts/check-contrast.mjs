#!/usr/bin/env node
/**
 * Colour-contrast guard for the text tokens actually used in the UI.
 *
 * Lighthouse/axe find these in a browser; this finds them in CI, on the source,
 * with no browser and no network. It reads the palette from
 * `tailwind.config.ts`, collects every `text-*` utility used in `app/` and
 * `components/`, and checks each against the worst-case light surface the app
 * paints behind text (`cream`, white, the caramel chips, the error tint).
 *
 * WCAG 2.2 AA, normal text: 4.5:1. Large text (>=24px, or >=18.66px bold) only
 * needs 3:1 and is not modelled here — every token below is used at 9-14px
 * somewhere, so all of them are held to 4.5:1.
 *
 *   npm run check:contrast
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CONFIG = readFileSync(path.join(ROOT, "tailwind.config.ts"), "utf8");

/* ------------------------------- the palette ------------------------------ */
const palette = {};
for (const m of CONFIG.matchAll(/(\w+):\s*\{\s*([\s\S]*?)\n\s*\}/g)) {
  for (const c of m[2].matchAll(/(\d+):\s*"(#[0-9A-Fa-f]{6})"/g)) {
    palette[`${m[1]}-${c[1]}`] = c[2];
  }
}

/**
 * Tokens that are only ever icons or text on a dark panel — verified by hand,
 * and exempt because WCAG 1.4.3 governs *text*, not decorative glyphs.
 */
const NON_TEXT = {
  "caramel-300": "monogram on the espresso-900 tile, check bullet glyph",
  "caramel-500": "star / sparkles / message icons",
  "espresso-300": "footer middot separator, empty stars, input leading icons",
  "sage-300": "check / message glyphs beside already-readable labels",
  "#4ADE80": "WhatsApp glyph in the dark header pill",
  "#128C4B": "WhatsApp glyph inside its 15%-green disc",
};

/* ------------------------------ the surfaces ------------------------------ */
const SURFACES = [
  ["cream-100", "#FDF5E9"],
  ["cream-50", "#FFFBF5"],
  ["white", "#FFFFFF"],
  ["cream-200", "#F7EAD8"],
  ["caramel-100", "#FBEBD3"],
  ["error tint", "#FBEEE8"],
];

/* ------------------------------- the maths -------------------------------- */
const hex = (h) => h.replace("#", "").match(/../g).map((x) => parseInt(x, 16));
const lin = (c) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => {
  const [x, y] = [luminance(hex(a)), luminance(hex(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const over = (fg, bg, alpha) =>
  "#" +
  hex(fg)
    .map((c, i) => Math.round(c * alpha + hex(bg)[i] * (1 - alpha)).toString(16).padStart(2, "0"))
    .join("");

/* -------------------------------- the scan -------------------------------- */
const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".tsx")) files.push(p);
  }
};
walk(path.join(ROOT, "app"));
walk(path.join(ROOT, "components"));

const used = new Map();
const note = (key, token, alpha, raw, file) => {
  if (!used.has(key)) used.set(key, { token, alpha, raw, files: new Set() });
  used.get(key).files.add(file);
};

for (const file of files) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    for (const m of line.matchAll(/text-(espresso|caramel|sage|cream)-(\d+)(?:\/(\d+))?/g)) {
      const token = `${m[1]}-${m[2]}`;
      if (!palette[token]) continue;
      const alpha = m[3] ? Number(m[3]) / 100 : 1;
      note(`${token}${alpha < 1 ? `/${m[3]}` : ""}`, token, alpha, false, file);
    }
    for (const m of line.matchAll(/text-\[(#[0-9A-Fa-f]{6})\]/g)) {
      note(m[1], m[1], 1, true, file);
    }
  }
}

/* ------------------------------- the verdict ------------------------------ */
let failures = 0;
const rows = [];

for (const [key, info] of [...used].sort()) {
  if (info.token.startsWith("cream-")) continue; // only ever on espresso-900
  if (NON_TEXT[info.token]) {
    rows.push([true, key, `exempt — ${NON_TEXT[info.token]}`, info.files.size]);
    continue;
  }

  const fg = info.raw ? info.token : palette[info.token];
  let worst = { ratio: Infinity, surface: "" };
  for (const [name, bg] of SURFACES) {
    const r = contrast(info.alpha < 1 ? over(fg, bg, info.alpha) : fg, bg);
    if (r < worst.ratio) worst = { ratio: r, surface: name };
  }

  const ok = worst.ratio >= 4.5;
  if (!ok) failures += 1;
  rows.push([ok, key, `${worst.ratio.toFixed(2)}:1 on ${worst.surface}`, info.files.size]);
}

for (const [ok, key, detail, count] of rows) {
  console.log(`${ok ? "✓" : "✗"} ${key.padEnd(22)} ${detail.padEnd(34)} ${count} file(s)`);
}
console.log(
  failures
    ? `\n${failures} text colour(s) below 4.5:1 — darken the token or drop the opacity modifier.`
    : `\nAll ${rows.length} text colours clear 4.5:1 on every light surface.`,
);

process.exit(failures ? 1 : 0);
