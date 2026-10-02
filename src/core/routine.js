// Routines: scripted editor sessions (tutorials, demos, the README video). A routine is plain data,
// a list of steps that the player turns into timed pointer gestures. Every step goes through the
// same editor actions as real input, so a routine can't do anything a user couldn't, and it
// renders identically in both views. The drone acts as the cursor while a routine plays.
//
//   { name, description?, steps: [
//     { op: "setup", size },                  blank farm of this size (history reset)
//     { op: "tool", tool },                   "pencil" | "line" | "rect" | "fill" | "picker"
//     { op: "brush", brush, params? },        brush id ("entity:Pumpkin", "ground:Soil", "erase")
//     { op: "stroke", path, shift? },         drone flies to path[0], presses, follows the path, releases
//     { op: "undo" } | { op: "redo" },
//     { op: "view", view },                   "2d" | "3d"
//     { op: "orbit", degrees, ms? },          3D only: turn the camera around the farm
//     { op: "note", text },                   caption shown while the routine plays ("" hides it)
//     { op: "wait", ms },
//   ]}
//
// Coordinates are tiles [x, y] in drone order: (0,0) is the south-west corner.

import { MAX_SIZE, MIN_SIZE, PARAMS } from "./entities.js";
import { isValidBrushId, isValidTool } from "./editor.js";
import { createCells } from "./grid.js";

// Pacing at 1× speed, in milliseconds (or tiles per second).
export const PACE = {
  setting: 260, // tool / brush change, so the palette change is visible
  flyMin: 220,
  flyMax: 900,
  flyPerTile: 45,
  press: 110,
  release: 200,
  drawSpeed: 14, // tiles/s while the button is held
  dragMin: 320,
  view: 1200,
  orbitPerDegree: 28,
};

const OPS = ["setup", "tool", "brush", "stroke", "undo", "redo", "view", "orbit", "note", "wait"];

const isTile = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isInteger);

/** Throws a descriptive error if the routine is malformed. Returns the routine. */
export const validateRoutine = (routine) => {
  if (!routine || !Array.isArray(routine.steps)) throw new Error("Routine needs a steps array");
  routine.steps.forEach((s, i) => {
    const fail = (msg) => {
      throw new Error(`Step ${i + 1} (${s?.op ?? "?"}): ${msg}`);
    };
    if (!OPS.includes(s?.op)) fail(`unknown op`);
    if (s.op === "setup" && !(Number.isInteger(s.size) && s.size >= MIN_SIZE && s.size <= MAX_SIZE))
      fail(`size must be ${MIN_SIZE}–${MAX_SIZE}`);
    if (s.op === "tool" && !isValidTool(s.tool)) fail(`unknown tool "${s.tool}"`);
    if (s.op === "brush") {
      if (!isValidBrushId(s.brush)) fail(`unknown brush "${s.brush}"`);
      for (const k of Object.keys(s.params ?? {})) if (!PARAMS[k]) fail(`unknown param "${k}"`);
    }
    if (s.op === "stroke" && !(Array.isArray(s.path) && s.path.length > 0 && s.path.every(isTile)))
      fail("path must be a non-empty list of [x, y] tiles");
    if (s.op === "view" && s.view !== "2d" && s.view !== "3d") fail(`view must be "2d" or "3d"`);
    if (s.op === "orbit" && !Number.isFinite(s.degrees)) fail("degrees must be a number");
    if (s.op === "wait" && !(Number.isFinite(s.ms) && s.ms >= 0)) fail("ms must be ≥ 0");
    if (s.op === "note" && typeof s.text !== "string") fail("text must be a string");
  });
  return routine;
};

const easeInOut = (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const roundTile = (p) => [Math.round(p[0]), Math.round(p[1])];

/** Position along a polyline at progress p (0..1), by arc length. */
const along = (path, p) => {
  if (path.length === 1) return path[0];
  const lens = path.slice(1).map((q, i) => dist(path[i], q));
  let d = p * lens.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const k = lens[i] ? Math.min(1, d / lens[i]) : 1;
      const [a, b] = [path[i], path[i + 1]];
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    }
    d -= lens[i];
  }
  return path[path.length - 1];
};

/**
 * Turn a routine into consecutive clips { t0, ms, update(p, ctx) }. `update` is called with the
 * clip's progress (0..1) on every advance while the clip is active, and once with 1 at its end.
 */
export const compileRoutine = (routine) => {
  validateRoutine(routine);
  const clips = [];
  let t = 0;
  let drone = [0, 0];
  const clip = (ms, update) => {
    clips.push({ t0: t, ms, update });
    t += ms;
  };
  const instant = (ms, run) => {
    let done = false;
    clip(ms, (p, ctx) => {
      if (!done) (run(ctx), (done = true));
    });
  };
  const moveDrone = (ctx, pos, mods) => {
    ctx.editor.setPlayback({ drone: pos });
    ctx.editor.pointerMove(roundTile(pos), mods);
  };

  for (const s of routine.steps) {
    switch (s.op) {
      case "setup":
        instant(0, ({ editor }) => {
          editor.load({ size: s.size, cells: createCells(s.size) }, { resetHistory: true });
          editor.setPlayback({ drone: [0, 0] });
        });
        drone = [0, 0];
        break;
      case "tool":
        instant(PACE.setting, ({ editor }) => editor.setTool(s.tool));
        break;
      case "brush":
        instant(PACE.setting, ({ editor }) => {
          editor.setBrush(s.brush);
          for (const [k, v] of Object.entries(s.params ?? {})) editor.setParam(k, v);
        });
        break;
      case "stroke": {
        const mods = { shift: !!s.shift };
        const path = s.path;
        const from = drone;
        const to = path[0];
        const fly = Math.min(PACE.flyMax, Math.max(PACE.flyMin, dist(from, to) * PACE.flyPerTile));
        clip(fly, (p, ctx) => {
          const k = easeInOut(p);
          moveDrone(ctx, [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k], mods);
        });
        instant(PACE.press, ({ editor }) => editor.pointerDown(to, mods));
        if (path.length > 1) {
          const lens = path.slice(1).map((q, i) => dist(path[i], q));
          const len = lens.reduce((a, b) => a + b, 0);
          // Arc-length progress of each corner, so a coarse frame step still visits every corner.
          const corners = lens.slice(0, -1).map((_, i) => lens.slice(0, i + 1).reduce((a, b) => a + b, 0) / len);
          let last = 0;
          clip(Math.max(PACE.dragMin, (len / PACE.drawSpeed) * 1000), (p, ctx) => {
            for (const c of corners) if (c > last && c < p) moveDrone(ctx, along(path, c), mods);
            moveDrone(ctx, along(path, p), mods);
            last = p;
          });
        }
        instant(PACE.release, ({ editor }) => editor.pointerUp());
        drone = path[path.length - 1];
        break;
      }
      case "undo":
        instant(PACE.setting * 1.5, ({ editor }) => editor.undo());
        break;
      case "redo":
        instant(PACE.setting * 1.5, ({ editor }) => editor.redo());
        break;
      case "view":
        instant(PACE.view, ({ editor }) => editor.setView(s.view));
        break;
      case "orbit": {
        const total = (s.degrees * Math.PI) / 180;
        let last = 0;
        clip(s.ms ?? Math.abs(s.degrees) * PACE.orbitPerDegree, (p, ctx) => {
          const k = easeInOut(p);
          ctx.view()?.orbit?.((k - last) * total);
          last = k;
        });
        break;
      }
      case "note":
        instant(0, ({ editor }) => editor.setPlayback({ note: s.text || null }));
        break;
      case "wait":
        clip(s.ms, () => {});
        break;
      default:
    }
  }
  return { clips, duration: t };
};

/**
 * Plays a routine on an editor. Time only moves when you call `advanceTo(ms)`, so the same player
 * drives real-time playback (from requestAnimationFrame) and frame-exact video capture.
 * `view` returns the active view's API (zoom/fit/orbit), if any.
 */
export const createPlayer = (editor, routine, { view = () => null } = {}) => {
  const { clips, duration } = compileRoutine(routine);
  const ctx = { editor, view };
  let index = 0;
  let time = 0;

  const advanceTo = (ms) => {
    time = Math.max(time, Math.min(ms, duration));
    while (index < clips.length) {
      const c = clips[index];
      if (time < c.t0) break;
      const p = c.ms > 0 ? Math.min(1, (time - c.t0) / c.ms) : 1;
      c.update(p, ctx);
      if (p < 1) break;
      index++;
    }
    if (index >= clips.length) editor.setPlayback({ running: false });
  };

  editor.setPlayback({ running: true, note: null });
  return {
    duration,
    advanceTo,
    get time() {
      return time;
    },
    get done() {
      return index >= clips.length;
    },
    /** Abort: release any held gesture and hand the drone back. */
    stop() {
      editor.cancel();
      editor.setPlayback(null);
      index = clips.length;
    },
  };
};
