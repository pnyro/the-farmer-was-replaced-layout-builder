// Drone routes: the order in which the drone visits a set of tiles, keeping the number of moves
// low. The farm wraps around (moving off the east edge lands on the west edge), so distances are
// Manhattan distances on a torus. Planned here at export time because in the game every
// instruction costs time.

/** Moves between two tile indices on a wrapping size×size farm. */
export const wrapDistance = (a, b, size) => {
  const dx = Math.abs((a % size) - (b % size));
  const dy = Math.abs(Math.floor(a / size) - Math.floor(b / size));
  return Math.min(dx, size - dx) + Math.min(dy, size - dy);
};

/** Total moves to visit `order` starting from `start`. */
export const routeLength = (order, size, start = 0) => {
  let total = 0;
  let at = start;
  for (const i of order) {
    total += wrapDistance(at, i, size);
    at = i;
  }
  return total;
};

/**
 * Order `indices` for a short drone route from `start`: nearest neighbour (ties go to the tile
 * along the current direction, so dense blocks come out as clean sweeps), then 2-opt to remove
 * crossings. The route ends wherever it ends; the drone doesn't need to come back.
 */
export const planRoute = (indices, size, { start = 0, maxPasses = 8 } = {}) => {
  const todo = new Set(indices);
  const order = [];
  let at = start;
  let dir = [1, 0];
  while (todo.size) {
    let best = -1;
    let bestScore = Infinity;
    const ax = at % size;
    const ay = Math.floor(at / size);
    for (const i of todo) {
      const d = wrapDistance(at, i, size);
      if (d > bestScore) continue;
      // Tie-break: prefer continuing in the current direction, then staying in the row.
      let dx = (i % size) - ax;
      let dy = Math.floor(i / size) - ay;
      if (dx > size / 2) dx -= size;
      if (dx < -size / 2) dx += size;
      if (dy > size / 2) dy -= size;
      if (dy < -size / 2) dy += size;
      const along = Math.sign(dx) === dir[0] && Math.sign(dy) === dir[1] ? 0 : 0.5;
      const score = d + along * 0.1 + (dy !== 0 ? 0.01 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    const bx = best % size;
    const by = Math.floor(best / size);
    let dx = bx - ax;
    let dy = by - ay;
    if (Math.abs(dx) > size / 2) dx = -Math.sign(dx);
    if (Math.abs(dy) > size / 2) dy = -Math.sign(dy);
    if (dx !== 0 || dy !== 0) dir = [Math.sign(dx), dy === 0 ? 0 : Math.sign(dy)];
    order.push(best);
    todo.delete(best);
    at = best;
  }

  // 2-opt on the open path start → order[0] → … → order[n-1]: reverse a segment when that
  // shortens the route. The free end means reversing a suffix only changes one edge.
  const d = (p, q) => wrapDistance(p, q, size);
  const n = order.length;
  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false;
    for (let i = 0; i < n - 1; i++) {
      const before = i === 0 ? start : order[i - 1];
      for (let j = i + 1; j < n; j++) {
        const after = j === n - 1 ? null : order[j + 1];
        const old = d(before, order[i]) + (after === null ? 0 : d(order[j], after));
        const next = d(before, order[j]) + (after === null ? 0 : d(order[i], after));
        if (next < old) {
          for (let a = i, b = j; a < b; a++, b--) [order[a], order[b]] = [order[b], order[a]];
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return order;
};
