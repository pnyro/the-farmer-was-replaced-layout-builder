// Tool geometry: which tile indices a gesture affects. Pure functions shared by both views.

import { cellsEqual, inBounds, toIndex } from "./grid.js";

export const TOOLS = [
  { id: "pencil", label: "Draw", shortcut: "d", hint: "Click or drag to paint tiles" },
  { id: "line", label: "Line", shortcut: "l", hint: "Drag a straight line (Shift: snap to 45°)" },
  { id: "rect", label: "Rectangle", shortcut: "r", hint: "Drag a filled rectangle (Shift: outline only)" },
  { id: "fill", label: "Fill", shortcut: "f", hint: "Flood-fill connected identical tiles" },
  { id: "picker", label: "Pick", shortcut: "i", hint: "Pick a tile's content as the brush (or Alt+click)" },
];

export const TOOL_BY_ID = Object.fromEntries(TOOLS.map((t) => [t.id, t]));

/** Bresenham line between two tiles, inclusive. Returns [x, y] pairs. */
export const linePoints = (x0, y0, x1, y1) => {
  const pts = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    pts.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return pts;
};

/** Snap the end point to the nearest horizontal / vertical / 45° direction. */
export const snapLineEnd = (x0, y0, x1, y1) => {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx > 2 * ady) return [x1, y0];
  if (ady > 2 * adx) return [x0, y1];
  const d = Math.max(adx, ady);
  return [x0 + Math.sign(dx) * d, y0 + Math.sign(dy) * d];
};

const toIndices = (pts, size) => {
  const out = [];
  for (const [x, y] of pts) if (inBounds(x, y, size)) out.push(toIndex(x, y, size));
  return out;
};

export const lineIndices = (a, b, size, snap = false) => {
  const [ex, ey] = snap ? snapLineEnd(a[0], a[1], b[0], b[1]) : b;
  return toIndices(linePoints(a[0], a[1], ex, ey), size);
};

export const rectIndices = (a, b, size, outline = false) => {
  const x0 = Math.max(0, Math.min(a[0], b[0]));
  const x1 = Math.min(size - 1, Math.max(a[0], b[0]));
  const y0 = Math.max(0, Math.min(a[1], b[1]));
  const y1 = Math.min(size - 1, Math.max(a[1], b[1]));
  const out = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (outline && x !== x0 && x !== x1 && y !== y0 && y !== y1) continue;
      out.push(toIndex(x, y, size));
    }
  }
  return out;
};

/** 4-connected flood fill over cells identical to the start cell. */
export const floodIndices = (cells, size, start) => {
  const [sx, sy] = start;
  if (!inBounds(sx, sy, size)) return [];
  const target = cells[toIndex(sx, sy, size)];
  const seen = new Uint8Array(size * size);
  const out = [];
  const stack = [toIndex(sx, sy, size)];
  seen[stack[0]] = 1;
  while (stack.length) {
    const i = stack.pop();
    out.push(i);
    const x = i % size;
    const y = (i - x) / size;
    const nbrs = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of nbrs) {
      if (!inBounds(nx, ny, size)) continue;
      const j = toIndex(nx, ny, size);
      if (seen[j]) continue;
      seen[j] = 1;
      if (cellsEqual(cells[j], target)) stack.push(j);
    }
  }
  return out.sort((p, q) => p - q);
};

/**
 * Indices a gesture would affect for shape tools. Pencil strokes are built incrementally
 * by the editor (one line segment per pointer move) so they are not handled here.
 */
export const shapeIndices = (tool, cells, size, start, end, modifiers = {}) => {
  switch (tool) {
    case "line":
      return lineIndices(start, end, size, !!modifiers.shift);
    case "rect":
      return rectIndices(start, end, size, !!modifiers.shift);
    case "fill":
      return floodIndices(cells, size, start);
    default:
      return [];
  }
};
