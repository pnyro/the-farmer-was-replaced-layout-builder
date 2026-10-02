import { describe, expect, it } from "vitest";
import { planRoute, routeLength, wrapDistance } from "./route.js";

const all = (n) => Array.from({ length: n * n }, (_, i) => i);

describe("drone routes", () => {
  it("measures distance on a wrapping farm", () => {
    expect(wrapDistance(0, 31, 32)).toBe(1); // west edge to east edge
    expect(wrapDistance(0, 31 * 32 + 31, 32)).toBe(2);
    expect(wrapDistance(5, 5 + 3 * 32, 32)).toBe(3);
  });

  it("visits every tile exactly once", () => {
    const tiles = all(12).filter((i) => i % 3 !== 0);
    const order = planRoute(tiles, 12);
    expect([...order].sort((a, b) => a - b)).toEqual(tiles);
  });

  it("sweeps a full farm with one move per tile", () => {
    for (const n of [5, 8, 32]) expect(routeLength(planRoute(all(n), n), n)).toBe(n * n - 1);
  });

  it("uses the wrap-around for scattered tiles", () => {
    const corners = [0, 31, 31 * 32, 31 * 32 + 31];
    expect(routeLength(planRoute(corners, 32), 32)).toBe(3);
  });

  it("beats a row sweep on a sparse layout", () => {
    const n = 32;
    const tiles = [];
    for (let i = 0; i < 40; i++) tiles.push(((i * 97) % 31) * n + ((i * 13) % 29));
    const unique = [...new Set(tiles)];
    const sweep = [...unique].sort((a, b) => a - b);
    expect(routeLength(planRoute(unique, n), n)).toBeLessThan(routeLength(sweep, n) * 0.8);
  });
});
