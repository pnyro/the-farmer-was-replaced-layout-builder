#!/usr/bin/env node
// Regenerates src/assets/icons/*.webp and src/assets/sprites/*.webp from our own procedural
// three.js models (src/render3d/models.js), so the 2D view, palette icons and 3D view match.
//
//   pnpm icons                      # uses Google Chrome / Chromium from the usual locations
//   CHROME_PATH=/path/to/chrome pnpm icons
//
// It starts a throwaway Vite server, opens scripts/icons/index.html in headless Chrome,
// and writes the data URLs that page returns.

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { createServer } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
].filter(Boolean);

const chrome = CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error("No Chrome/Chromium found. Set CHROME_PATH to a Chrome executable.");
  process.exit(1);
}

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
  await page.goto(`http://localhost:${port}/scripts/icons/index.html`, { waitUntil: "load" });
  await page.waitForFunction("window.renderDone === true", { timeout: 120_000 });
  const { icons, sprites } = await page.evaluate(() => window.renderAll());

  const write = (dir, map) => {
    const out = join(root, "src/assets", dir);
    if (existsSync(out)) for (const f of readdirSync(out)) rmSync(join(out, f));
    mkdirSync(out, { recursive: true });
    for (const [name, url] of Object.entries(map)) {
      const data = Buffer.from(url.split(",")[1], "base64");
      writeFileSync(join(out, `${name}.webp`), data);
    }
    console.log(`wrote ${Object.keys(map).length} images to src/assets/${dir}/`);
  };
  write("icons", icons);
  write("sprites", sprites);
} finally {
  await browser.close();
  await server.close();
}
