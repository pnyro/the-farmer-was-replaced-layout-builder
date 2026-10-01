// The editor core: one store holding the document, history, tool state and the transient
// gesture/hover state. Renderers (2D canvas, 3D scene) only translate pointer events into tile
// coordinates and call the interaction methods below, so every tool behaves identically in both.

import { DEFAULT_SIZE, ENTITY_BY_NAME, PARAMS, clampParam } from "./entities.js";
import { cellsEqual, clampSize, createCells, inBounds, paintCells, resizeCells, toIndex } from "./grid.js";
import { floodIndices, lineIndices, shapeIndices } from "./tools.js";
import { analyzeLayout } from "./validation.js";

export const HISTORY_LIMIT = 200;

/** Brush ids: "ground:Soil", "entity:Carrot", "erase". */
export const brushFromId = (id, params) => {
  if (id === "erase") return { kind: "erase" };
  const [kind, name] = id.split(":");
  if (kind === "ground") return { kind: "ground", ground: name };
  const paramKey = ENTITY_BY_NAME[name]?.param;
  return { kind: "entity", entity: name, params: paramKey ? { [paramKey]: params[paramKey] } : undefined };
};

export const brushIdForCell = (cell) => (cell.entity ? `entity:${cell.entity}` : `ground:${cell.ground}`);

export const initialState = (size = DEFAULT_SIZE) => {
  const cells = createCells(size);
  return {
    size,
    cells,
    analysis: analyzeLayout(cells, size),
    past: [],
    future: [],
    tool: "pencil",
    brushId: "entity:Carrot",
    params: { cactusSize: PARAMS.cactusSize.default, petals: PARAMS.petals.default },
    view: "2d",
    showIssues: true,
    showGrid: true,
    // transient
    hover: null, // [x, y] or null
    preview: null, // { cells, indices:Set } while a shape gesture is in progress
    hoverRegion: null, // Set of indices the active tool would touch on click (fill preview)
    stroke: null, // internal gesture bookkeeping
  };
};

export const createEditor = (init = initialState()) => {
  let state = init;
  const listeners = new Set();

  const set = (patch) => {
    const next = { ...state, ...patch };
    if (patch.cells !== undefined && (patch.cells !== state.cells || patch.size !== undefined)) {
      next.analysis = analyzeLayout(next.cells, next.size);
    }
    state = next;
    listeners.forEach((l) => l());
  };

  const pushHistory = (prev) => {
    const past = state.past.length >= HISTORY_LIMIT ? state.past.slice(1) : state.past.slice();
    past.push(prev);
    return past;
  };

  /** Replace the document as one undoable step. */
  const commit = (size, cells, before = { size: state.size, cells: state.cells }) => {
    if (before.size === size && before.cells === cells) return;
    set({ size, cells, past: pushHistory(before), future: [] });
  };

  const brush = () => brushFromId(state.brushId, state.params);

  // ------------------------------------------------------------ document actions
  const actions = {
    getState: () => state,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    undo() {
      if (!state.past.length || state.stroke) return;
      const prev = state.past[state.past.length - 1];
      set({
        size: prev.size,
        cells: prev.cells,
        past: state.past.slice(0, -1),
        future: [...state.future, { size: state.size, cells: state.cells }],
        preview: null,
        hoverRegion: null,
      });
    },
    redo() {
      if (!state.future.length || state.stroke) return;
      const next = state.future[state.future.length - 1];
      set({
        size: next.size,
        cells: next.cells,
        future: state.future.slice(0, -1),
        past: [...state.past, { size: state.size, cells: state.cells }],
        preview: null,
        hoverRegion: null,
      });
    },
    resize(n) {
      const size = clampSize(n);
      if (size === state.size) return;
      commit(size, resizeCells(state.cells, state.size, size));
      set({ hover: null });
    },
    clear() {
      const cells = createCells(state.size);
      if (state.cells.every((c) => cellsEqual(c, cells[0]))) return;
      commit(state.size, cells);
    },
    /** Load a whole layout (import, share link). Undoable unless `resetHistory`. */
    load({ size, cells }, { resetHistory = false } = {}) {
      if (resetHistory) set({ size, cells, past: [], future: [], preview: null, hover: null });
      else commit(size, cells);
    },
    /** Paint arbitrary indices with the current brush as one undoable step. */
    paint(indices, b = brush()) {
      commit(state.size, paintCells(state.cells, indices, b));
    },

    // ------------------------------------------------------------ settings
    setTool(tool) {
      set({ tool, hoverRegion: null });
      actions.refreshHover();
    },
    setBrush(brushId) {
      set({ brushId });
      actions.refreshHover();
    },
    setParam(key, value) {
      set({ params: { ...state.params, [key]: clampParam(key, value) } });
    },
    /** Nudge the active brush's parameter (cactus size / petals). */
    nudgeParam(delta) {
      const name = state.brushId.startsWith("entity:") ? state.brushId.slice(7) : null;
      const key = name ? ENTITY_BY_NAME[name]?.param : null;
      if (key) actions.setParam(key, state.params[key] + delta);
    },
    setView(view) {
      set({ view });
    },
    toggleView() {
      set({ view: state.view === "2d" ? "3d" : "2d" });
    },
    setShowIssues(v) {
      set({ showIssues: v });
    },
    setShowGrid(v) {
      set({ showGrid: v });
    },

    // ------------------------------------------------------------ pointer interaction
    // `tile` is [x, y] (may be out of bounds or null). `mods` = { shift, alt }.

    pointerDown(tile, mods = {}) {
      if (!tile || !inBounds(tile[0], tile[1], state.size)) return;
      const { size, cells } = state;
      const i = toIndex(tile[0], tile[1], size);
      if (state.tool === "picker" || mods.alt) {
        actions.pick(i);
        return;
      }
      const before = { size, cells };
      switch (state.tool) {
        case "pencil": {
          const next = paintCells(cells, [i], brush());
          set({ cells: next, stroke: { tool: "pencil", before, last: tile } });
          break;
        }
        case "fill": {
          commit(size, paintCells(cells, floodIndices(cells, size, tile), brush()), before);
          actions.refreshHover();
          break;
        }
        case "line":
        case "rect": {
          set({ stroke: { tool: state.tool, before, start: tile, end: tile, shift: !!mods.shift } });
          actions.updatePreview();
          break;
        }
        default:
      }
    },

    pointerMove(tile, mods = {}) {
      const s = state.stroke;
      const sameHover =
        (tile === null && state.hover === null) ||
        (tile && state.hover && tile[0] === state.hover[0] && tile[1] === state.hover[1]);
      if (!s) {
        if (sameHover) return;
        set({ hover: tile && inBounds(tile[0], tile[1], state.size) ? tile : null });
        actions.refreshHover();
        return;
      }
      if (!tile) return;
      const clamped = [
        Math.min(state.size - 1, Math.max(0, tile[0])),
        Math.min(state.size - 1, Math.max(0, tile[1])),
      ];
      const hover = inBounds(tile[0], tile[1], state.size) ? tile : null;
      if (s.tool === "pencil") {
        if (sameHover) return;
        if (!hover) {
          set({ hover: null, stroke: { ...s, last: null } });
          return;
        }
        // Paint the segment since the last tile so fast drags don't leave gaps.
        const from = s.last ?? hover;
        const idx = lineIndices(from, hover, state.size);
        set({ hover, cells: paintCells(state.cells, idx, brush()), stroke: { ...s, last: hover } });
        return;
      }
      if (
        s.end[0] === clamped[0] &&
        s.end[1] === clamped[1] &&
        s.shift === !!mods.shift &&
        sameHover
      )
        return;
      set({ hover, stroke: { ...s, end: clamped, shift: !!mods.shift } });
      actions.updatePreview();
    },

    /** Shift pressed/released mid-gesture. */
    setModifiers(mods) {
      const s = state.stroke;
      if (s && (s.tool === "line" || s.tool === "rect") && s.shift !== !!mods.shift) {
        set({ stroke: { ...s, shift: !!mods.shift } });
        actions.updatePreview();
      }
    },

    pointerUp() {
      const s = state.stroke;
      if (!s) return;
      if (s.tool === "pencil") {
        // Cells were painted live; record the stroke as a single history step.
        const changed = state.cells !== s.before.cells;
        set({
          stroke: null,
          ...(changed ? { past: pushHistory(s.before), future: [] } : {}),
        });
      } else {
        const preview = state.preview;
        set({ stroke: null, preview: null });
        if (preview) commit(state.size, preview.cells, s.before);
      }
      actions.refreshHover();
    },

    /** Abort a gesture in progress (Escape). Pencil strokes are rolled back. */
    cancel() {
      const s = state.stroke;
      if (!s) return;
      if (s.tool === "pencil") set({ cells: s.before.cells, stroke: null });
      else set({ stroke: null, preview: null });
    },

    pointerLeave() {
      if (state.stroke?.tool === "pencil") set({ hover: null, stroke: { ...state.stroke, last: null } });
      else if (!state.stroke) set({ hover: null, hoverRegion: null });
    },

    pick(i) {
      const cell = state.cells[i];
      if (!cell) return;
      const patch = { brushId: brushIdForCell(cell) };
      const key = cell.entity ? ENTITY_BY_NAME[cell.entity]?.param : null;
      if (key) patch.params = { ...state.params, [key]: cell.params?.[key] ?? PARAMS[key].default };
      set(patch);
    },

    // ------------------------------------------------------------ derived transient state
    updatePreview() {
      const s = state.stroke;
      if (!s || (s.tool !== "line" && s.tool !== "rect")) return;
      const indices = shapeIndices(s.tool, s.before.cells, state.size, s.start, s.end, { shift: s.shift });
      const cells = paintCells(s.before.cells, indices, brush());
      set({
        preview: { cells, indices: new Set(indices), analysis: analyzeLayout(cells, state.size) },
      });
    },

    /** What a click would affect at the hovered tile (used for hover highlight in both views). */
    refreshHover() {
      if (state.stroke) return;
      const h = state.hover;
      if (!h) {
        if (state.hoverRegion) set({ hoverRegion: null });
        return;
      }
      let indices;
      if (state.tool === "fill") indices = floodIndices(state.cells, state.size, h);
      else indices = [toIndex(h[0], h[1], state.size)];
      set({ hoverRegion: new Set(indices) });
    },
  };

  return actions;
};
