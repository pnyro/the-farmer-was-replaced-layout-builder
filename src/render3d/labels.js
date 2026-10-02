// Text labels for the 3D view as canvas-texture sprites (no DOM overlays). They keep a constant
// on-screen size (sizeAttenuation off), so sprite scale is a fraction of the viewport height.

import * as THREE from "three";

const cache = new Map();

/**
 * Cached sprite material for a label.
 * style: { color, background, font }
 */
export const labelMaterial = (text, { color = "#ffffff", background = null, weight = 600 } = {}) => {
  const key = `${text}|${color}|${background}|${weight}`;
  let entry = cache.get(key);
  if (entry) return entry;
  const px = 64;
  const font = `${weight} ${px}px Montserrat, system-ui, sans-serif`;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = font;
  const padX = background ? px * 0.35 : px * 0.1;
  const w = Math.ceil(ctx.measureText(text).width + padX * 2);
  const h = Math.ceil(px * 1.35);
  canvas.width = w;
  canvas.height = h;
  ctx.font = font;
  if (background) {
    ctx.fillStyle = background;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, px * 0.2);
    ctx.fill();
  } else {
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = px * 0.08;
    ctx.shadowOffsetY = px * 0.04;
  }
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2 + px * 0.04);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const material = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, sizeAttenuation: false });
  entry = { material, aspect: w / h };
  cache.set(key, entry);
  return entry;
};
