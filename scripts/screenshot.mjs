#!/usr/bin/env node
// Captures README screenshots of the demo farm in both views.
//
//   pnpm screenshot                 # writes public/screenshot.png (3D) and public/screenshot-2d.png
//   node scripts/screenshot.mjs --size 32 --out /tmp/shots --width 1600 --height 1000
//
// Starts a throwaway Vite dev server and drives headless Chrome (set CHROME_PATH if needed).

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import puppeteer from "puppeteer-core";
import { createServer } from "vite";
import { encodeLayout } from "../src/core/io.js";
import { demoLayout } from "./demo-layout.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { values: args } = parseArgs({
  options: {
    size: { type: "string", default: "12" },
    out: { type: "string", default: join(root, "public") },
    width: { type: "string", default: "1440" },
    height: { type: "string", default: "900" },
    views: { type: "string", default: "2d,3d" },
    prefix: { type: "string", default: "screenshot" },
    hover: { type: "string" },
  },
});

const chrome = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => p && existsSync(p));
if (!chrome) throw new Error("Set CHROME_PATH to a Chrome executable.");

const outDir = resolve(args.out);
mkdirSync(outDir, { recursive: true });
const server = await createServer({ root, logLevel: "error", server: { port: 0 } });
await server.listen();
const { port } = server.httpServer.address();
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("page error:", e.message));
  await page.setViewport({ width: Number(args.width), height: Number(args.height), deviceScaleFactor: 1 });
  const hash = encodeLayout(demoLayout(Number(args.size)));
  await page.goto(`http://localhost:${port}/#layout=${hash}`, { waitUntil: "networkidle0" });
  await page.waitForFunction("window.__editor !== undefined");
  for (const view of args.views.split(",")) {
    await page.evaluate((v) => window.__editor.setView(v), view);
    if (args.hover) {
      const [x, y] = args.hover.split(",").map(Number);
      await page.evaluate((t) => window.__editor.pointerMove(t), [x, y]);
    }
    await new Promise((r) => setTimeout(r, view === "3d" ? 6000 : 2600));
    // README uses public/screenshot.png (3D) and public/screenshot-2d.png.
    const name = args.prefix === "screenshot" && view === "3d" ? "screenshot.png" : `${args.prefix}-${view}.png`;
    const file = join(outDir, name);
    await page.screenshot({ path: file });
    console.log("wrote", file);
  }
} finally {
  await browser.close();
  await server.close();
}
