// Layout analysis shared by both views: validation issues and the giant-pumpkin preview.

import { ENTITY_BY_NAME, canGrowOn } from "./entities.js";

export const ISSUE_TYPES = {
  wrongGround: {
    label: "Crop on wrong ground",
    severity: "error",
    color: "#ff5a3c",
  },
  adjacentTrees: {
    label: "Adjacent trees (slower growth)",
    severity: "warning",
    color: "#ffc62d",
  },
};

/**
 * Greedy giant-pumpkin preview: repeatedly take the largest square (n ≥ 2) made only of
 * pumpkins that are not already part of a merge. Ties pick the most south-western square.
 * Returns [{ x, y, n }] where (x, y) is the south-west corner.
 */
export const findPumpkinMerges = (cells, size) => {
  const isPumpkin = new Uint8Array(size * size);
  for (let i = 0; i < cells.length; i++) isPumpkin[i] = cells[i].entity === "Pumpkin" ? 1 : 0;
  const merges = [];
  const dp = new Int32Array(size * size);
  for (;;) {
    let best = 1;
    let bestI = -1;
    // dp[i] = side of the largest square whose north-east corner is at i.
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        if (!isPumpkin[i]) {
          dp[i] = 0;
          continue;
        }
        if (x === 0 || y === 0) dp[i] = 1;
        else dp[i] = 1 + Math.min(dp[i - 1], dp[i - size], dp[i - size - 1]);
        if (dp[i] > best) {
          best = dp[i];
          bestI = i;
        }
      }
    }
    if (bestI < 0) break;
    const ex = bestI % size;
    const ey = (bestI - ex) / size;
    const x = ex - best + 1;
    const y = ey - best + 1;
    for (let yy = y; yy <= ey; yy++) {
      for (let xx = x; xx <= ex; xx++) isPumpkin[yy * size + xx] = 0;
    }
    merges.push({ x, y, n: best });
  }
  // Present in a stable, drone-friendly order.
  return merges.sort((a, b) => a.y - b.y || a.x - b.x);
};

/** Number of orthogonal tree neighbours for every tile (0 for non-trees). */
export const treeNeighbourCounts = (cells, size) => {
  const out = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (cells[i].entity !== "Tree") continue;
      let n = 0;
      if (x > 0 && cells[i - 1].entity === "Tree") n++;
      if (x < size - 1 && cells[i + 1].entity === "Tree") n++;
      if (y > 0 && cells[i - size].entity === "Tree") n++;
      if (y < size - 1 && cells[i + size].entity === "Tree") n++;
      out[i] = n;
    }
  }
  return out;
};

/**
 * Cactus sort state per tile (1 = sorted or not a cactus). A cactus is sorted when every
 * neighbouring cactus to the North/East is >= its size and every one to the South/West is <=.
 * Unsorted grown cacti turn brown in the game, and both views mirror that.
 */
export const cactusSortedFlags = (cells, size) => {
  const out = new Uint8Array(size * size).fill(1);
  const sz = (i) => cells[i].params?.cactusSize ?? 9;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (cells[i].entity !== "Cactus") continue;
      const v = sz(i);
      const check = (nx, ny, wantGreater) => {
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) return true;
        const j = ny * size + nx;
        if (cells[j].entity !== "Cactus") return true;
        return wantGreater ? sz(j) >= v : sz(j) <= v;
      };
      out[i] =
        check(x, y + 1, true) && check(x + 1, y, true) && check(x, y - 1, false) && check(x - 1, y, false) ? 1 : 0;
    }
  }
  return out;
};

/**
 * Full analysis. Returns
 *   issues: Array<{ index, type, message }>
 *   byIndex: Map<index, issue[]>
 *   merges: [{x, y, n}]
 *   mergeOf: Int32Array mapping tile index -> merge index (or -1)
 *   cactusSorted: Uint8Array (0 = unsorted cactus)
 */
export const analyzeLayout = (cells, size) => {
  const issues = [];
  const treeN = treeNeighbourCounts(cells, size);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.entity && ENTITY_BY_NAME[c.entity] && !canGrowOn(c.entity, c.ground)) {
      issues.push({
        index: i,
        type: "wrongGround",
        message: `${ENTITY_BY_NAME[c.entity].label} can't grow on ${c.ground}; till() to Soil first.`,
      });
    }
    if (treeN[i] > 0) {
      issues.push({
        index: i,
        type: "adjacentTrees",
        message: `Tree next to ${treeN[i]} other tree${treeN[i] > 1 ? "s" : ""}: grows ${2 ** treeN[i]}× slower.`,
      });
    }
  }
  const byIndex = new Map();
  for (const issue of issues) {
    const list = byIndex.get(issue.index);
    if (list) list.push(issue);
    else byIndex.set(issue.index, [issue]);
  }
  const merges = findPumpkinMerges(cells, size);
  const mergeOf = new Int32Array(size * size).fill(-1);
  merges.forEach((m, k) => {
    for (let y = m.y; y < m.y + m.n; y++) {
      for (let x = m.x; x < m.x + m.n; x++) mergeOf[y * size + x] = k;
    }
  });
  return { issues, byIndex, merges, mergeOf, cactusSorted: cactusSortedFlags(cells, size) };
};

export const pumpkinYield = (n) => (n >= 6 ? n * n * 6 : n * n * n);
