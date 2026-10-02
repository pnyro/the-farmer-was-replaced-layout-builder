#!/usr/bin/env node
// Records the README video: plays a routine (default: src/routines/farmTour.js) in the app and
// captures it frame by frame, so the result is smooth no matter how slowly the page renders.
//
//   pnpm record                                   # public/demo.mp4 + public/demo.gif (README loop)
//   node scripts/record-demo.mjs --stills 5,20,40 # just a few PNGs (in --out) to check framing
//   node scripts/record-demo.mjs --speed 1.5 --fps 30 --width 1920 --height 1080
//
// The page clock is virtualised: every captured frame advances performance.now() by exactly one
// frame, so animations (drone, camera) stay in step with the routine. Needs Chrome and ffmpeg.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import puppeteer from "puppeteer-core";
import { createServer } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { values: args } = parseArgs({
  options: {
    routine: { type: "string", default: "farmTour" },
    out: { type: "string", default: join(root, "public") },
    name: { type: "string", default: "demo" },
    width: { type: "string", default: "1920" },
    height: { type: "string", default: "1080" },
    fps: { type: "string", default: "30" },
    speed: { type: "string", default: "1.3" },
    stills: { type: "string" },
    gif: { type: "boolean", default: true },
    "end-card": { type: "string", default: "2500" },
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

const fps = Number(args.fps);
const speed = Number(args.speed);
const frameMs = 1000 / fps;
const endCardMs = Number(args["end-card"]);
const outDir = resolve(args.out);
mkdirSync(outDir, { recursive: true });

const server = await createServer({ root, logLevel: "error", server: { port: 0 } });
await server.listen();
const { port } = server.httpServer.address();
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: [
    process.env.SWIFTSHADER ? "--use-angle=swiftshader" : "--use-angle=metal",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--enable-gpu-rasterization",
  ],
});

/** Spawn ffmpeg; `done` resolves when it exits cleanly. */
const ffmpeg = (argv) => {
  const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...argv], { stdio: ["pipe", "inherit", "inherit"] });
  p.done = new Promise((ok, fail) => p.on("exit", (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg exited with ${code}`)))));
  return p;
};

try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("page error:", e.message));
  await page.setViewport({ width: Number(args.width), height: Number(args.height), deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle0" });
  await page.waitForFunction("window.__createPlayer !== undefined");
  await page.evaluate(() => document.fonts.ready);

  // Load the 3D view's code up front so switching views doesn't show a loading frame.
  const duration = await page.evaluate(async (routineName) => {
    await import("/src/render3d/Farm3D.jsx");
    const routines = await import("/src/routines/farmTour.js");
    const routine = routines[routineName];
    if (!routine) throw new Error(`No routine "${routineName}" in src/routines/farmTour.js`);
    window.__editor.setView("2d");
    window.__editor.setShowGrid(true);
    window.__editor.setShowIssues(true);
    // Virtual clock: frozen until the recorder advances it.
    let now = performance.now();
    performance.now = () => now;
    window.__tick = (ms) => (now += ms);
    window.__player = window.__createPlayer(routine);
    window.__player.advanceTo(0);
    // End card, faded in by the recorder (CSS transitions would run on the real clock).
    const card = document.createElement("div");
    card.id = "__end-card";
    card.innerHTML =
      '<div class="t">The Farmer Was Replaced – Layout Builder</div><div class="s">Plan farms in 2D or 3D · export them to your drone scripts</div>';
    Object.assign(card.style, {
      position: "fixed",
      inset: "0",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "14px",
      background: "rgba(20, 22, 16, 0.78)",
      color: "#f0f0f0",
      fontFamily: "Montserrat, sans-serif",
      opacity: "0",
      zIndex: "100",
      pointerEvents: "none",
    });
    const style = document.createElement("style");
    style.textContent = "#__end-card .t{font-size:44px;font-weight:800}#__end-card .s{font-size:22px;font-weight:600;color:#c8d89a}";
    document.head.append(style);
    document.body.append(card);
    return window.__player.duration;
  }, args.routine);

  const routineFrames = Math.ceil(duration / speed / frameMs);
  const totalFrames = routineFrames + Math.ceil(endCardMs / frameMs);
  console.log(`routine ${(duration / 1000).toFixed(1)}s at ${speed}× → ${(totalFrames / fps).toFixed(1)}s video, ${totalFrames} frames`);

  // Two animation frames: one to apply the state, one to draw it.
  const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  const cdp = await page.createCDPSession();
  const capture = async () => {
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
    return Buffer.from(data, "base64");
  };

  const stills = args.stills ? args.stills.split(",").map((s) => Math.round((Number(s) * 1000) / frameMs)) : null;
  const video = join(outDir, `${args.name}.mp4`);
  let encoder = null;
  if (!stills) {
    encoder = ffmpeg([
      "-f", "image2pipe", "-framerate", String(fps), "-i", "-",
      "-c:v", "libx264", "-preset", "slow", "-crf", "25", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
      video,
    ]);
  }

  let lastView = "2d";
  const started = Date.now();
  for (let f = 0; f < totalFrames; f++) {
    const t = f * frameMs * speed;
    const view = await page.evaluate(
      (t, dt, f, routineFrames, endCardFrames) => {
        window.__tick(dt);
        window.__player.advanceTo(t);
        if (f >= routineFrames) {
          const k = Math.min(1, (f - routineFrames) / Math.min(endCardFrames, 18));
          document.getElementById("__end-card").style.opacity = String(k);
        }
        return window.__editor.getState().view;
      },
      t, frameMs, f, routineFrames, totalFrames - routineFrames,
    );
    if (view !== lastView) {
      lastView = view;
      // Let the new view mount, then render a few frames on the real clock before resuming.
      await page.waitForSelector(view === "3d" ? ".farm-view-3d canvas" : ".farm-view-2d canvas", { timeout: 60000 });
      await new Promise((r) => setTimeout(r, 1500));
    }
    await settle();
    if (stills) {
      if (stills.includes(f)) {
        const file = join(outDir, `${args.name}-${(f / fps).toFixed(1)}s.png`);
        writeFileSync(file, await capture());
        console.log("wrote", file);
      }
      if (f >= Math.max(...stills)) break;
      continue;
    }
    const png = await capture();
    if (!encoder.stdin.write(png)) await new Promise((r) => encoder.stdin.once("drain", r));
    if (f % fps === 0) {
      const el = (Date.now() - started) / 1000;
      process.stdout.write(`\r  frame ${f}/${totalFrames} (${view}) · ${el.toFixed(0)}s elapsed`);
    }
  }
  if (encoder) {
    encoder.stdin.end();
    await encoder.done;
    console.log(`\nwrote ${video}`);
    if (args.gif) {
      // A short, small loop for the README: the 3D part of the video, at reduced size and rate.
      const gif = join(outDir, `${args.name}.gif`);
      const gifStart = Math.max(0, totalFrames / fps - endCardMs / 1000 - 9);
      await ffmpeg([
        "-ss", gifStart.toFixed(2), "-t", "6", "-i", video,
        "-vf", "fps=12,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
        gif,
      ]).done;
      console.log(`wrote ${gif}`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}
