// Grid model. A layout is { size, cells } where cells is a flat array in drone-script order:
// index = y * size + x, (0,0) = south-west corner, x grows East, y grows North.
// A cell is { ground, entity, params? } and is treated as immutable.

import {
  DEFAULT_GROUND,
  ENTITY_BY_NAME,
  MAX_SIZE,
  MIN_SIZE,
  PARAMS,
  canGrowOn,
  clampParam,
  isEntity,
  isGround,
  needsSoil,
} from "./entities.js";

export const EMPTY_CELL = Object.freeze({ ground: DEFAULT_GROUND, entity: null });

export const toIndex = (x, y, size) => y * size + x;
export const toXY = (index, size) => [index % size, Math.floor(index / size)];
export const inBounds = (x, y, size) => x >= 0 && y >= 0 && x < size && y < size;

export const clampSize = (n) => {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return MIN_SIZE;
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, v));
};

export const createCells = (size) => new Array(size * size).fill(EMPTY_CELL);

export const createLayout = (size) => ({ size, cells: createCells(size) });

/** Resize keeping content anchored at the south-west corner (0,0). */
export const resizeCells = (cells, oldSize, newSize) => {
  const next = createCells(newSize);
  const n = Math.min(oldSize, newSize);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      next[y * newSize + x] = cells[y * oldSize + x];
    }
  }
  return next;
};

/** Build a normalized cell, dropping params that don't apply to the entity. */
export const makeCell = (ground, entity, params) => {
  const g = isGround(ground) ? ground : DEFAULT_GROUND;
  const e = entity && isEntity(entity) ? entity : null;
  const paramKey = e ? ENTITY_BY_NAME[e].param : undefined;
  if (!paramKey) {
    if (g === DEFAULT_GROUND && e === null) return EMPTY_CELL;
    return { ground: g, entity: e };
  }
  const raw = params?.[paramKey];
  return {
    ground: g,
    entity: e,
    params: { [paramKey]: raw === undefined ? PARAMS[paramKey].default : clampParam(paramKey, raw) },
  };
};

export const cellParam = (cell) => {
  const key = cell.entity ? ENTITY_BY_NAME[cell.entity]?.param : undefined;
  return key ? cell.params?.[key] ?? PARAMS[key].default : undefined;
};

export const cellsEqual = (a, b) =>
  a === b ||
  (a.ground === b.ground &&
    a.entity === b.entity &&
    cellParam(a) === cellParam(b));

/**
 * A brush describes what painting does to a cell:
 *   { kind: "ground", ground }   – set the ground (Grassland removes soil-only crops)
 *   { kind: "entity", entity, params } – place an entity (auto-tills for soil-only crops)
 *   { kind: "erase" }           – reset to an empty Grassland tile
 */
export const applyBrush = (cell, brush) => {
  switch (brush.kind) {
    case "erase":
      return EMPTY_CELL;
    case "ground": {
      if (cell.ground === brush.ground) return cell;
      // Till()-ing back to grassland would leave soil-only crops invalid: remove them.
      const keep = cell.entity && canGrowOn(cell.entity, brush.ground);
      return makeCell(brush.ground, keep ? cell.entity : null, cell.params);
    }
    case "entity": {
      const ground = needsSoil(brush.entity) ? "Soil" : cell.ground;
      return makeCell(ground, brush.entity, brush.params);
    }
    default:
      return cell;
  }
};

/** Return a new cells array with the brush applied to `indices` (or the same array if nothing changed). */
export const paintCells = (cells, indices, brush) => {
  let next = null;
  for (const i of indices) {
    const before = (next ?? cells)[i];
    if (before === undefined) continue;
    const after = applyBrush(before, brush);
    if (!cellsEqual(before, after)) {
      next ??= cells.slice();
      next[i] = after;
    }
  }
  return next ?? cells;
};

export const countEntities = (cells) => {
  const counts = {};
  for (const c of cells) {
    const k = c.entity ?? "(empty)";
    counts[k] = (counts[k] ?? 0) + 1;
    counts[c.ground] = (counts[c.ground] ?? 0) + 1;
  }
  return counts;
};
