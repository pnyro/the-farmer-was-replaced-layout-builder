#!/usr/bin/env node
// Turns an image into a routine that paints it on the farm, one rectangle at a time.
//
//   node scripts/image-to-routine.mjs picture.png --size 32 --out picture.routine.json
//   node scripts/record-demo.mjs --routine picture.routine.json --name picture
//
// Each brush's colour is measured from the real 2D renderer, so "nearest colour" means what you
// will actually see. Pixels that are mostly transparent stay empty grassland. Options:
//   --brushes entity:Pumpkin,ground:Soil,...   restrict the palette
//   --map "#d97757=entity:Pumpkin"            force a colour (comma-separated) to a brush
//   --merge                                    allow full pumpkin squares (they merge into giants)
//   --no-3d                                    don't end with a 3D orbit
//   --pace 2.5                                 gesture speed (pictures need many strokes)
// Needs Chrome (renders the palette and decodes the image, so any format Chrome reads works).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import puppeteer from "puppeteer-core";
import { createServer } from "vite";
import { ENTITIES, GROUNDS, MAX_SIZE, MIN_SIZE, needsSoil } from "../src/core/entities.js";
import { brushFromId } from "../src/core/editor.js";
import { EMPTY_CELL, applyBrush, createCells } from "../src/core/grid.js";
import { PARAMS } from "../src/core/entities.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    size: { type: "string", default: "32" },
    out: { type: "string" },
    brushes: { type: "string" },
    map: { type: "string" },
    merge: { type: "boolean", default: false },
    "no-3d": { type: "boolean", default: false },
    preview: { type: "string" },
    pace: { type: "string", default: "2.5" },
    name: { type: "string" },
  },
});
const input = positionals[0];
if (!input) throw new Error("Usage: image-to-routine.mjs <image> [--size 32] [--out file.json]");
const size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Number(args.size)));
const out = resolve(args.out ?? input.replace(/\.[^.]+$/, "") + ".routine.json");

const BACKGROUND = "ground:Grassland";
const defaultBrushes = [
  "ground:Soil",
  ...ENTITIES.filter((e) => e.name !== "Dead_Pumpkin").map((e) => `entity:${e.name}`),
];
const brushes = args.brushes ? args.brushes.split(",") : defaultBrushes;
const defaults = Object.fromEntries(Object.values(PARAMS).map((p) => [p.key, p.default]));
const cellFor = (id) => applyBrush(EMPTY_CELL, brushFromId(id, defaults));
for (const b of brushes) {
  const [kind, name] = b.split(":");
  const ok = kind === "ground" ? GROUNDS.some((g) => g.name === name) : ENTITIES.some((e) => e.name === name);
  if (!ok) throw new Error(`Unknown brush ${b}`);
}

// ------------------------------------------------------------ browser: palette + image pixels
const chrome = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => p && existsSync(p));
if (!chrome) throw new Error("Set CHROME_PATH to a Chrome executable.");

const server = await createServer({ root, logLevel: "error", server: { port: 0 } });
await server.listen();
const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage();
let palette;
let pixels;
// Everything below runs with the browser open (for --preview); it is closed at the end.
try {
  await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${server.httpServer.address().port}/`, { waitUntil: "networkidle0" });
  await page.waitForFunction("window.__editor !== undefined");
  await page.evaluate(() => {
    window.__editor.setView("2d");
    window.__editor.setShowGrid(false);
    window.__editor.setShowIssues(false);
  });

  // Paint a 5×5 farm with each brush and average the middle tile as drawn.
  palette = [];
  for (const id of [BACKGROUND, ...brushes]) {
    const cells = createCells(5).fill(cellFor(id));
    const rgb = await page.evaluate(async (layout) => {
      window.__editor.load(layout, { resetHistory: true });
      await new Promise((r) => setTimeout(r, 400)); // sprites load + view eases in
      const canvas = document.querySelector(".farm-canvas");
      const ctx = canvas.getContext("2d");
      // The farm is centred; find its tile size from the canvas (5 tiles + margins).
      const w = canvas.width;
      const h = canvas.height;
      const s = Math.min(w, h) / 8;
      const data = ctx.getImageData(Math.round(w / 2 - s * 0.5), Math.round(h / 2 - s * 0.6), Math.round(s), Math.round(s)).data;
      const sum = [0, 0, 0];
      for (let i = 0; i < data.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += data[i + k];
      return sum.map((v) => v / (data.length / 4));
    }, { size: 5, cells });
    palette.push({ id, rgb });
  }

  const type = { ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" }[extname(input).toLowerCase()];
  if (!type) throw new Error(`Unsupported image type ${extname(input)}`);
  const dataUrl = `data:${type};base64,${readFileSync(input).toString("base64")}`;
  pixels = await page.evaluate(async (src, n) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    // Fit the image into a square, then downscale in halving steps for a clean area average.
    let w = Math.max(img.naturalWidth || 512, 512);
    let c = new OffscreenCanvas(w, w);
    const k = w / Math.max(img.naturalWidth || w, img.naturalHeight || w);
    const iw = (img.naturalWidth || w) * k;
    const ih = (img.naturalHeight || w) * k;
    c.getContext("2d").drawImage(img, (w - iw) / 2, (w - ih) / 2, iw, ih);
    while (w / 2 >= n) {
      const next = new OffscreenCanvas(Math.max(n, Math.floor(w / 2)), Math.max(n, Math.floor(w / 2)));
      const ctx = next.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(c, 0, 0, next.width, next.height);
      c = next;
      w = next.width;
    }
    const final = new OffscreenCanvas(n, n);
    const fctx = final.getContext("2d");
    fctx.imageSmoothingQuality = "high";
    fctx.drawImage(c, 0, 0, n, n);
    return Array.from(fctx.getImageData(0, 0, n, n).data);
  }, dataUrl, size);

// ------------------------------------------------------------ quantise
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const forced = (args.map ?? "")
  .split(",")
  .filter(Boolean)
  .map((pair) => {
    const [color, id] = pair.split("=");
    return { rgb: hex(color.trim()), id: id.trim() };
  });
// "Redmean" weighted RGB distance: cheap and close enough to perceptual for picking a brush.
const distance = (a, b) => {
  const r = (a[0] + b[0]) / 2;
  const d = a.map((v, i) => v - b[i]);
  return (2 + r / 256) * d[0] ** 2 + 4 * d[1] ** 2 + (2 + (255 - r) / 256) * d[2] ** 2;
};
const ranked = (rgb) => {
  const pool = [...palette, ...forced.map((f) => ({ id: f.id, rgb: f.rgb }))];
  return pool.sort((p, q) => distance(rgb, p.rgb) - distance(rgb, q.rgb)).map((p) => p.id);
};

// grid[y][x] in drone order (y = 0 is the bottom row of the image).
const grid = [];
const alts = [];
for (let y = 0; y < size; y++) {
  grid.push([]);
  alts.push([]);
  for (let x = 0; x < size; x++) {
    const i = ((size - 1 - y) * size + x) * 4;
    const a = pixels[i + 3] / 255;
    if (a < 0.5) {
      grid[y].push(BACKGROUND);
      alts[y].push([BACKGROUND]);
      continue;
    }
    // Canvas pixels are unpremultiplied: an anti-aliased edge keeps the shape's colour.
    const order = ranked([pixels[i], pixels[i + 1], pixels[i + 2]]);
    grid[y].push(order[0]);
    alts[y].push(order);
  }
}

// Full squares of pumpkins merge into one giant pumpkin, which would blur the picture. Keep
// pumpkins to every other row (rows can't form a square); the gaps get the next-best brush,
// usually soil, so the shape stays solid.
if (!args.merge) {
  const P = "entity:Pumpkin";
  for (let y = 1; y < size; y += 2) {
    for (let x = 0; x < size; x++) {
      if (grid[y][x] === P) grid[y][x] = alts[y][x].find((id) => id !== P && id !== BACKGROUND) ?? "ground:Soil";
    }
  }
}

// ------------------------------------------------------------ rectangles
// Crops that need soil auto-till, so the soil pass can also cover them: that turns a speckled
// soil area into a few big rectangles, and the crops are planted on top afterwards.
const SOIL = "ground:Soil";
const covers = (id, v) => v === id || (id === SOIL && v.startsWith("entity:") && needsSoil(v.slice(7)));

/** Greedy cover of one brush's tiles with maximal rectangles (widest run, then grow upwards). */
const rectsFor = (id) => {
  const todo = grid.map((row) => row.map((v) => v === id));
  const rects = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!todo[y][x]) continue;
      let x1 = x;
      while (x1 + 1 < size && covers(id, grid[y][x1 + 1]) && (todo[y][x1 + 1] || grid[y][x1 + 1] !== id)) x1++;
      let y1 = y;
      const rowFull = (yy) => {
        for (let xx = x; xx <= x1; xx++) if (!covers(id, grid[yy][xx])) return false;
        return true;
      };
      while (y1 + 1 < size && rowFull(y1 + 1)) y1++;
      for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) todo[yy][xx] = false;
      rects.push([[x, y], [x1, y1]]);
    }
  }
  return rects;
};

const counts = {};
for (const row of grid) for (const id of row) counts[id] = (counts[id] ?? 0) + 1;
const used = Object.keys(counts)
  .filter((id) => id !== BACKGROUND)
  .sort((a, b) => (b === SOIL) - (a === SOIL) || counts[b] - counts[a]); // soil first, then biggest areas

const name = args.name ?? `Picture: ${input.split("/").pop()}`;
const steps = [{ op: "setup", size }, { op: "wait", ms: 500 }, { op: "note", text: name }, { op: "tool", tool: "rect" }];
let at = [0, 0];
for (const id of used) {
  steps.push({ op: "brush", brush: id });
  // Visit rectangles nearest-first from wherever the drone is.
  const left = rectsFor(id);
  while (left.length) {
    let best = 0;
    let bestD = Infinity;
    left.forEach(([a, b], i) => {
      const d = Math.min(Math.hypot(a[0] - at[0], a[1] - at[1]), Math.hypot(b[0] - at[0], b[1] - at[1]));
      if (d < bestD) (best = i), (bestD = d);
    });
    let [a, b] = left.splice(best, 1)[0];
    if (Math.hypot(b[0] - at[0], b[1] - at[1]) < Math.hypot(a[0] - at[0], a[1] - at[1])) [a, b] = [b, a];
    steps.push({ op: "stroke", path: a[0] === b[0] && a[1] === b[1] ? [a] : [a, b] });
    at = b;
  }
}
steps.push({ op: "note", text: "" }, { op: "wait", ms: 800 });
if (!args["no-3d"]) steps.push({ op: "view", view: "3d" }, { op: "wait", ms: 400 }, { op: "orbit", degrees: 360, ms: 9000 }, { op: "wait", ms: 600 });

writeFileSync(out, JSON.stringify({ name, description: `Generated from ${input.split("/").pop()}`, pace: Number(args.pace), steps }, null, 1));

// Preview in the terminal, top row first.
const glyph = Object.fromEntries([[BACKGROUND, "."], ...used.map((id, i) => [id, "#*o+x%@=&~"[i] ?? "?"])]);
for (let y = size - 1; y >= 0; y--) console.log(grid[y].map((id) => glyph[id]).join(""));
console.log(used.map((id) => `${glyph[id]} ${id} ×${counts[id]}`).join("   "));
console.log(`palette: ${palette.map((p) => `${p.id}=${p.rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`).join(" ")}`);
console.log(`${steps.filter((s) => s.op === "stroke").length} strokes → ${out}`);

  if (args.preview) {
    const cells = [];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) cells.push(cellFor(grid[y][x]));
    await page.setViewport({ width: 1100, height: 1000, deviceScaleFactor: 1 });
    await page.evaluate(async (layout) => {
      window.__editor.load(layout, { resetHistory: true });
      await new Promise((r) => setTimeout(r, 800));
    }, { size, cells });
    await (await page.$(".farm-canvas")).screenshot({ path: resolve(args.preview) });
    console.log(`preview → ${resolve(args.preview)}`);
  }
} finally {
  await browser.close();
  await server.close();
}
