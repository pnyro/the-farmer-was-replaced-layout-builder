// Procedural, palette-based tile art for the 2D view (cached per resolution).

import { RAMP } from "../render3d/palette.js";
import { mulberry32 } from "../core/random.js";

export const VARIANTS = 4;
const cache = new Map();

const nextPow2 = (n) => 2 ** Math.ceil(Math.log2(Math.max(1, n)));

/** Resolution bucket for a tile drawn at `px` device pixels. */
export const tileRes = (px) => Math.min(256, Math.max(16, nextPow2(px)));

const drawGrassland = (ctx, r, rnd) => {
  ctx.fillStyle = RAMP.olive[3];
  ctx.fillRect(0, 0, r, r);
  // soft bevel: light north-west edge, darker south-east edge
  const b = Math.max(1, r * 0.05);
  ctx.fillStyle = RAMP.olive[2];
  ctx.fillRect(0, 0, r, b);
  ctx.fillRect(0, 0, b, r);
  ctx.fillStyle = RAMP.olive[4];
  ctx.fillRect(0, r - b, r, b);
  ctx.fillRect(r - b, 0, b, r);
  // mottled patches
  for (let k = 0; k < 6; k++) {
    ctx.fillStyle = k % 2 ? "rgba(146,166,13,0.18)" : "rgba(64,81,3,0.18)";
    const x = b + rnd() * (r - 3 * b);
    const y = b + rnd() * (r - 3 * b);
    const w = r * (0.12 + rnd() * 0.18);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + w * 0.2);
    ctx.lineTo(x + w * 0.7, y + w * 0.8);
    ctx.lineTo(x - w * 0.1, y + w * 0.6);
    ctx.closePath();
    ctx.fill();
  }
  // short blades
  if (r >= 32) {
    ctx.lineWidth = Math.max(1, r / 64);
    ctx.lineCap = "round";
    for (let k = 0; k < 14; k++) {
      const x = b * 2 + rnd() * (r - 4 * b);
      const y = b * 2 + rnd() * (r - 4 * b);
      const h = r * (0.04 + rnd() * 0.05);
      ctx.strokeStyle = rnd() < 0.5 ? RAMP.olive[1] : RAMP.olive[5];
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * h, y - h);
      ctx.stroke();
    }
  }
};

const drawSoil = (ctx, r, rnd) => {
  ctx.fillStyle = RAMP.brown[4];
  ctx.fillRect(0, 0, r, r);
  // Furrows running East–West, matching the 3D ridges.
  const ridges = 4;
  const pitch = r / ridges;
  for (let k = 0; k < ridges; k++) {
    const y0 = k * pitch;
    ctx.fillStyle = RAMP.brown[2]; // lit north face
    ctx.fillRect(0, y0 + pitch * 0.12, r, pitch * 0.42);
    ctx.fillStyle = RAMP.brown[3]; // south face
    ctx.fillRect(0, y0 + pitch * 0.54, r, pitch * 0.3);
    ctx.fillStyle = "rgba(85,51,16,0.55)"; // trough
    ctx.fillRect(0, y0 + pitch * 0.84, r, pitch * 0.16);
  }
  // clods
  for (let k = 0; k < 10; k++) {
    ctx.fillStyle = k % 2 ? "rgba(204,152,69,0.35)" : "rgba(85,51,16,0.35)";
    const s = Math.max(1, r * (0.02 + rnd() * 0.025));
    ctx.fillRect(rnd() * r, rnd() * r, s, s);
  }
  const b = Math.max(1, r * 0.04);
  ctx.fillStyle = "rgba(255,220,160,0.12)";
  ctx.fillRect(0, 0, r, b);
  ctx.fillStyle = "rgba(40,20,5,0.25)";
  ctx.fillRect(0, r - b, r, b);
};

/** Cached canvas for a ground type at a resolution bucket. */
export const getTileArt = (ground, variant, res) => {
  const key = `${ground}:${variant}:${res}`;
  let c = cache.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = c.height = res;
    const ctx = c.getContext("2d");
    const rnd = mulberry32(variant * 97 + (ground === "Soil" ? 5 : 1));
    if (ground === "Soil") drawSoil(ctx, res, rnd);
    else drawGrassland(ctx, res, rnd);
    cache.set(key, c);
  }
  return c;
};
