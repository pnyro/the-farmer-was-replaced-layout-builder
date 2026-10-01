// 2D renderer: a HiDPI canvas with smooth zoom/pan. It draws the editor state and maps pointer
// positions to tiles; all editing behaviour lives in the shared editor core.

import { useEffect, useRef } from "react";
import { SPRITE_URLS, getImage, spriteKeyForCell } from "../assets/index.js";
import { ISSUE_TYPES } from "../core/validation.js";
import { OVERLAY } from "../core/overlay.js";
import { useEditor } from "../core/useEditor.js";
import { cactusScale } from "../render3d/scale.js";
import { BACKGROUND, RAMP } from "../render3d/palette.js";
import { mulberry32 } from "../core/random.js";
import { SPRITE_ANCHOR, SPRITE_UNITS } from "./spriteFrame.js";
import { VARIANTS, getTileArt, tileRes } from "./tileArt.js";

const MIN_TILE = 6;
const MAX_TILE = 240;
const SLAB = 0.32; // depth of the earth slab drawn below the south edge, in tiles

const tileVariant = (x, y) => ((x * 73856093) ^ (y * 19349663)) & (VARIANTS - 1);

export default function FarmCanvas2D({ apiRef }) {
  const editor = useEditor();
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let dpr = window.devicePixelRatio || 1;
    let cssW = 1;
    let cssH = 1;
    // View: tile size in CSS px and the screen position of the farm's north-west corner.
    const view = { s: 40, ox: 0, oy: 0 };
    const target = { s: 40, ox: 0, oy: 0 };
    let userMoved = false; // keep auto-fitting until the user zooms or pans
    let lastSize = editor.getState().size;
    let raf = 0;
    let dirty = true;

    let disposed = false;
    const requestDraw = () => {
      if (disposed) return;
      dirty = true;
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const fitTarget = () => {
      const n = editor.getState().size;
      // Leave room for coordinate labels and the status bar along the bottom.
      const padX = 28;
      const padTop = 24;
      const padBottom = 56;
      const s = Math.max(
        MIN_TILE,
        Math.min(MAX_TILE, Math.min((cssW - 2 * padX) / (n + 0.8), (cssH - padTop - padBottom) / (n + SLAB + 0.9))),
      );
      target.s = s;
      target.ox = (cssW - n * s) / 2;
      target.oy = padTop + (cssH - padTop - padBottom - (n + SLAB + 0.9) * s) / 2 + s * 0.55;
    };

    const zoomAt = (factor, cx = cssW / 2, cy = cssH / 2) => {
      userMoved = true;
      const s = Math.max(MIN_TILE, Math.min(MAX_TILE, target.s * factor));
      const k = s / target.s;
      target.ox = cx - (cx - target.ox) * k;
      target.oy = cy - (cy - target.oy) * k;
      target.s = s;
      requestDraw();
    };

    apiRef.current = {
      zoomIn: () => zoomAt(1.25),
      zoomOut: () => zoomAt(0.8),
      fit: () => {
        userMoved = false;
        fitTarget();
        requestDraw();
      },
    };

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      cssW = Math.max(1, r.width);
      cssH = Math.max(1, r.height);
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      if (!userMoved) {
        fitTarget();
        Object.assign(view, target);
      }
      requestDraw();
    };

    // ------------------------------------------------------------ drawing
    const draw = () => {
      const st = editor.getState();
      const { size: n } = st;
      const cells = st.preview?.cells ?? st.cells;
      const analysis = st.preview?.analysis ?? st.analysis;
      const s = view.s;
      const X = (wx) => view.ox + wx * s;
      const Y = (wy) => view.oy + (n - wy) * s; // world y grows north (up on screen)

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = BACKGROUND;
      ctx.fillRect(0, 0, cssW, cssH);

      // Earth slab: south face below the farm with a few rocks, like the 3D view.
      const pad = s * 0.06;
      ctx.fillStyle = "rgba(20,30,40,0.18)";
      ctx.fillRect(X(0) - pad + s * 0.12, Y(0) + s * 0.1, n * s + pad * 2, s * SLAB + s * 0.08);
      const grad = ctx.createLinearGradient(0, Y(0), 0, Y(0) + s * SLAB);
      grad.addColorStop(0, RAMP.brown[1]);
      grad.addColorStop(1, RAMP.brown[3]);
      ctx.fillStyle = grad;
      ctx.fillRect(X(0) - pad, Y(0), n * s + pad * 2, s * SLAB);
      ctx.fillStyle = RAMP.brown[6];
      ctx.fillRect(X(0) - pad, Y(n) - pad, n * s + pad * 2, n * s + pad);
      if (s >= 10) {
        const rnd = mulberry32(n * 31);
        for (let wx = 0.3; wx < n - 0.1; wx += 0.45 + rnd() * 0.55) {
          const r = s * (0.06 + rnd() * 0.05);
          const cx = X(wx);
          const cy = Y(0) + s * SLAB * (0.55 + rnd() * 0.25);
          ctx.fillStyle = rnd() < 0.5 ? RAMP.grey[2] : RAMP.grey[1];
          ctx.beginPath();
          ctx.moveTo(cx - r, cy + r * 0.4);
          ctx.lineTo(cx - r * 0.5, cy - r * 0.6);
          ctx.lineTo(cx + r * 0.6, cy - r * 0.5);
          ctx.lineTo(cx + r, cy + r * 0.4);
          ctx.closePath();
          ctx.fill();
        }
      }

      // Tiles
      const seam = Math.max(0.5, s * 0.025);
      const res = tileRes(s * dpr);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      const x0 = Math.max(0, Math.floor((0 - view.ox) / s));
      const x1 = Math.min(n - 1, Math.floor((cssW - view.ox) / s));
      const yTop = Math.min(n - 1, n - 1 - Math.floor((0 - view.oy) / s));
      const yBot = Math.max(0, n - 1 - Math.floor((cssH - view.oy) / s));
      for (let y = yBot; y <= yTop; y++) {
        for (let x = x0; x <= x1; x++) {
          const c = cells[y * n + x];
          ctx.drawImage(getTileArt(c.ground, tileVariant(x, y), res), X(x) + seam, Y(y + 1) + seam, s - 2 * seam, s - 2 * seam);
        }
      }

      // Tile-level overlays (under entities): shape preview and hover region.
      const fillTiles = (set, color) => {
        if (!set) return;
        ctx.fillStyle = color;
        for (const i of set) {
          const x = i % n;
          const y = (i - x) / n;
          ctx.fillRect(X(x), Y(y + 1), s, s);
        }
      };
      fillTiles(st.preview?.indices, OVERLAY.previewFill);
      if (!st.preview && st.hoverRegion && st.hoverRegion.size > 1) fillTiles(st.hoverRegion, OVERLAY.region);

      // Wrong-ground tint under the entity.
      if (st.showIssues) {
        for (const issue of analysis.issues) {
          if (issue.type !== "wrongGround") continue;
          const x = issue.index % n;
          const y = (issue.index - x) / n;
          ctx.fillStyle = "rgba(255,90,60,0.35)";
          ctx.fillRect(X(x), Y(y + 1), s, s);
        }
      }

      // Entities, back (north) to front (south) so taller sprites overlap correctly.
      const sw = SPRITE_UNITS.w * s;
      const sh = SPRITE_UNITS.h * s;
      const drawSprite = (key, cx, cy, scale = 1, alpha = 1) => {
        const url = SPRITE_URLS[key];
        if (!url) return;
        const img = getImage(url, requestDraw);
        if (!img) return;
        const w = sw * scale;
        const h = sh * scale;
        if (alpha !== 1) ctx.globalAlpha = alpha;
        ctx.drawImage(img, cx - SPRITE_ANCHOR.x * w, cy - SPRITE_ANCHOR.y * h, w, h);
        if (alpha !== 1) ctx.globalAlpha = 1;
      };
      const yEnd = Math.max(0, yBot - 2);
      const yStart = Math.min(n - 1, yTop + 1);
      for (let y = yStart; y >= yEnd; y--) {
        for (let x = 0; x < n; x++) {
          const i = y * n + x;
          const c = cells[i];
          if (!c.entity) continue;
          const m = analysis.mergeOf[i];
          if (m >= 0) {
            const g = analysis.merges[m];
            if (x === g.x && y === g.y) drawSprite("PumpkinBig", X(g.x + g.n / 2), Y(g.y + g.n / 2), g.n);
            continue;
          }
          const cx = X(x + 0.5);
          const cy = Y(y + 0.5);
          if (c.entity === "Cactus") {
            const k = cactusScale(c.params?.cactusSize ?? 9);
            // keep the cactus base on the tile while scaling
            drawSprite(spriteKeyForCell(c, analysis.cactusSorted[i] === 1), cx, cy, k);
          } else {
            drawSprite(spriteKeyForCell(c), cx, cy);
          }
        }
      }

      // Giant pumpkin outlines + labels
      if (st.showIssues) {
        ctx.lineWidth = Math.max(1.5, s * 0.05);
        for (const g of analysis.merges) {
          ctx.strokeStyle = OVERLAY.merge;
          ctx.setLineDash([s * 0.18, s * 0.12]);
          ctx.strokeRect(X(g.x) + 2, Y(g.y + g.n) + 2, g.n * s - 4, g.n * s - 4);
          ctx.setLineDash([]);
          if (s >= 14) badge(`${g.n}×${g.n}`, X(g.x) + 4, Y(g.y + g.n) + 4, OVERLAY.merge, "#3a2400");
        }
        // Issue markers
        for (const [index, list] of analysis.byIndex) {
          const x = index % n;
          const y = (index - x) / n;
          const err = list.some((l) => ISSUE_TYPES[l.type].severity === "error");
          const color = err ? OVERLAY.error : OVERLAY.warning;
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(1.5, s * 0.06);
          ctx.strokeRect(X(x) + ctx.lineWidth / 2, Y(y + 1) + ctx.lineWidth / 2, s - ctx.lineWidth, s - ctx.lineWidth);
          if (s >= 16) dot(X(x + 1) - s * 0.16, Y(y + 1) + s * 0.16, s * 0.12, color, err ? "!" : "•");
        }
      }

      // Shape preview outline and hover outline
      if (st.preview?.indices) outlineSet(st.preview.indices, OVERLAY.preview);
      if (st.hover && !st.stroke) {
        const [hx, hy] = st.hover;
        ctx.strokeStyle = OVERLAY.hover;
        ctx.lineWidth = Math.max(1.5, s * 0.05);
        ctx.strokeRect(X(hx), Y(hy + 1), s, s);
      }

      // Coordinates
      if (st.showGrid && s >= 12) {
        ctx.font = `600 ${Math.min(13, Math.max(9, s * 0.28))}px Montserrat, sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const every = s < 18 ? 4 : s < 28 ? 2 : 1;
        for (let x = 0; x < n; x++) if (x % every === 0 || x === n - 1) ctx.fillText(String(x), X(x + 0.5), Y(0) + s * (SLAB + 0.3));
        ctx.textAlign = "right";
        for (let y = 0; y < n; y++) if (y % every === 0 || y === n - 1) ctx.fillText(String(y), X(0) - s * 0.22, Y(y + 0.5));
        ctx.textAlign = "center";
        ctx.fillText("N ↑", X(n / 2), Y(n) - s * 0.35);
      }

      // The drone waits at (0,0), where the drone scripts start.
      drawSprite("Drone", X(0.18), Y(0.2) - s * 0.15, 0.55, 0.95);
    };

    const badge = (text, x, y, bg, fg) => {
      ctx.font = `700 ${Math.max(10, Math.min(14, view.s * 0.3))}px Montserrat, sans-serif`;
      const w = ctx.measureText(text).width + 8;
      const h = Math.max(14, Math.min(20, view.s * 0.42));
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 3);
      ctx.fill();
      ctx.fillStyle = fg;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x + 4, y + h / 2 + 0.5);
    };

    const dot = (x, y, r, color, glyph) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1b1b1b";
      ctx.font = `800 ${r * 1.5}px Montserrat, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(glyph, x, y + r * 0.08);
    };

    const outlineSet = (set, color) => {
      const st = editor.getState();
      const n = st.size;
      const s = view.s;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.5, s * 0.06);
      ctx.beginPath();
      for (const i of set) {
        const x = i % n;
        const y = (i - x) / n;
        const left = view.ox + x * s;
        const top = view.oy + (n - y - 1) * s;
        if (!set.has(i - 1) || x === 0) (ctx.moveTo(left, top), ctx.lineTo(left, top + s));
        if (!set.has(i + 1) || x === n - 1) (ctx.moveTo(left + s, top), ctx.lineTo(left + s, top + s));
        if (!set.has(i + n)) (ctx.moveTo(left, top), ctx.lineTo(left + s, top));
        if (!set.has(i - n)) (ctx.moveTo(left, top + s), ctx.lineTo(left + s, top + s));
      }
      ctx.stroke();
    };

    const frame = () => {
      raf = 0;
      // Ease the view towards the target for smooth zoom/pan.
      const k = 0.3;
      let moving = false;
      for (const key of ["s", "ox", "oy"]) {
        const d = target[key] - view[key];
        if (Math.abs(d) > 0.01) {
          view[key] += d * k;
          moving = true;
        } else view[key] = target[key];
      }
      if (dirty || moving) {
        dirty = false;
        draw();
      }
      if (moving) raf = requestAnimationFrame(frame);
    };

    // ------------------------------------------------------------ input
    const tileAt = (clientX, clientY) => {
      const r = canvas.getBoundingClientRect();
      const n = editor.getState().size;
      const wx = (clientX - r.left - view.ox) / view.s;
      const wy = n - (clientY - r.top - view.oy) / view.s;
      return [Math.floor(wx), Math.floor(wy)];
    };

    const pointers = new Map();
    let pan = null; // { x, y, ox, oy }
    let pinch = null;
    let spaceDown = false;

    const onPointerDown = (e) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        // Second finger: cancel painting and start pinch-zoom.
        editor.cancel();
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        return;
      }
      if (e.button === 1 || e.button === 2 || (e.button === 0 && spaceDown)) {
        pan = { x: e.clientX, y: e.clientY, ox: target.ox, oy: target.oy };
        canvas.style.cursor = "grabbing";
        return;
      }
      if (e.button === 0) editor.pointerDown(tileAt(e.clientX, e.clientY), { shift: e.shiftKey, alt: e.altKey });
    };

    const onPointerMove = (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        const r = canvas.getBoundingClientRect();
        target.ox += cx - pinch.cx;
        target.oy += cy - pinch.cy;
        zoomAt(d / pinch.d, cx - r.left, cy - r.top);
        Object.assign(view, target);
        pinch = { d, cx, cy };
        return;
      }
      if (pan) {
        userMoved = true;
        target.ox = pan.ox + (e.clientX - pan.x);
        target.oy = pan.oy + (e.clientY - pan.y);
        Object.assign(view, target);
        requestDraw();
        return;
      }
      editor.pointerMove(tileAt(e.clientX, e.clientY), { shift: e.shiftKey, alt: e.altKey });
    };

    const onPointerUp = (e) => {
      pointers.delete(e.pointerId);
      if (pinch) {
        if (pointers.size < 2) pinch = null;
        return;
      }
      if (pan) {
        pan = null;
        canvas.style.cursor = "";
        return;
      }
      editor.pointerUp();
    };

    const onLeave = () => editor.pointerLeave();

    const onWheel = (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX - r.left, e.clientY - r.top);
    };

    const onKey = (e) => {
      if (e.code !== "Space") return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      spaceDown = e.type === "keydown";
      canvas.style.cursor = spaceDown ? "grab" : "";
      if (e.type === "keydown") e.preventDefault();
    };

    const onContext = (e) => e.preventDefault();

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContext);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    const mq = window.matchMedia(`(resolution: ${dpr}dppx)`);
    mq.addEventListener?.("change", resize);
    document.fonts?.ready.then(requestDraw);

    const unsub = editor.subscribe(() => {
      const n = editor.getState().size;
      if (n !== lastSize) {
        lastSize = n;
        userMoved = false;
        fitTarget();
      }
      requestDraw();
    });
    resize();

    return () => {
      disposed = true;
      unsub();
      ro.disconnect();
      mq.removeEventListener?.("change", resize);
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContext);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [editor, apiRef]);

  return (
    <div className="farm-view farm-view-2d" ref={wrapRef}>
      <canvas ref={canvasRef} className="farm-canvas" aria-label="Farm layout, 2D top-down view" />
    </div>
  );
}
