import { describe, expect, it } from "vitest";
import { ENTITIES, GROUNDS } from "./entities.js";
import { createEditor, initialState } from "./editor.js";
import { EMPTY_CELL, applyBrush, makeCell, resizeCells, toIndex } from "./grid.js";
import { decodeLayout, encodeLayout, exportJson, exportPython, parseJson, parseLayout, parsePython } from "./io.js";
import { floodIndices, lineIndices, rectIndices } from "./tools.js";
import { analyzeLayout, findPumpkinMerges } from "./validation.js";

const C = (ground, entity, params) => makeCell(ground, entity, params);

const randomLayout = (size, seed = 1) => {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const cells = [];
  for (let i = 0; i < size * size; i++) {
    const g = GROUNDS[Math.floor(rnd() * GROUNDS.length)].name;
    const e = rnd() < 0.2 ? null : ENTITIES[Math.floor(rnd() * ENTITIES.length)].name;
    cells.push(C(g, e, { cactusSize: Math.floor(rnd() * 10), petals: 7 + Math.floor(rnd() * 9) }));
  }
  return { size, cells };
};

describe("brushes", () => {
  it("auto-tills soil-only crops on grassland", () => {
    const c = applyBrush(EMPTY_CELL, { kind: "entity", entity: "Carrot" });
    expect(c).toEqual({ ground: "Soil", entity: "Carrot" });
  });
  it("keeps grassland for grass/bush/tree", () => {
    expect(applyBrush(EMPTY_CELL, { kind: "entity", entity: "Tree" }).ground).toBe("Grassland");
  });
  it("painting grassland removes soil-only crops but keeps trees", () => {
    const g = { kind: "ground", ground: "Grassland" };
    expect(applyBrush(C("Soil", "Pumpkin"), g)).toEqual(EMPTY_CELL);
    expect(applyBrush(C("Soil", "Tree"), g)).toEqual({ ground: "Grassland", entity: "Tree" });
  });
  it("stores and clamps per-tile params", () => {
    expect(applyBrush(EMPTY_CELL, { kind: "entity", entity: "Cactus", params: { cactusSize: 42 } }).params).toEqual({
      cactusSize: 9,
    });
    expect(C("Soil", "Sunflower").params).toEqual({ petals: 15 });
    expect(C("Soil", "Carrot", { petals: 3 }).params).toBeUndefined();
  });
  it("erase resets the tile", () => {
    expect(applyBrush(C("Soil", "Carrot"), { kind: "erase" })).toBe(EMPTY_CELL);
  });
});

describe("tool geometry", () => {
  it("draws lines inclusive of both ends", () => {
    expect(lineIndices([0, 0], [3, 0], 4)).toEqual([0, 1, 2, 3]);
    expect(lineIndices([0, 0], [2, 2], 4)).toEqual([0, 5, 10]);
  });
  it("snaps lines with shift", () => {
    expect(lineIndices([0, 0], [3, 1], 4, true)).toEqual([0, 1, 2, 3]);
  });
  it("builds filled and outline rectangles clipped to the grid", () => {
    expect(rectIndices([1, 1], [0, 0], 3)).toEqual([0, 1, 3, 4]);
    expect(rectIndices([0, 0], [2, 2], 3, true)).toHaveLength(8);
    expect(rectIndices([2, 2], [9, 9], 3)).toEqual([8]);
  });
  it("flood fills only identical connected tiles", () => {
    const size = 3;
    const cells = new Array(9).fill(EMPTY_CELL);
    cells[toIndex(1, 0, size)] = C("Soil", "Carrot");
    cells[toIndex(1, 1, size)] = C("Soil", "Carrot");
    cells[toIndex(1, 2, size)] = C("Soil", "Carrot");
    expect(floodIndices(cells, size, [0, 0])).toEqual([0, 3, 6]);
    expect(floodIndices(cells, size, [1, 1])).toEqual([1, 4, 7]);
  });
});

describe("editor + undo/redo", () => {
  const ed = () => createEditor(initialState(4));
  it("records a pencil stroke as one undo step", () => {
    const e = ed();
    e.setBrush("entity:Carrot");
    e.pointerDown([0, 0]);
    e.pointerMove([3, 0]);
    e.pointerUp();
    const s = e.getState();
    expect(s.cells.slice(0, 4).every((c) => c.entity === "Carrot")).toBe(true);
    expect(s.past).toHaveLength(1);
    e.undo();
    expect(e.getState().cells.every((c) => c === EMPTY_CELL)).toBe(true);
    e.redo();
    expect(e.getState().cells[3].entity).toBe("Carrot");
  });
  it("previews rect without committing, then commits on release", () => {
    const e = ed();
    e.setTool("rect");
    e.setBrush("ground:Soil");
    e.pointerDown([0, 0]);
    e.pointerMove([1, 1]);
    expect(e.getState().preview.indices.size).toBe(4);
    expect(e.getState().cells[0]).toBe(EMPTY_CELL);
    e.pointerUp();
    expect(e.getState().preview).toBeNull();
    expect(e.getState().cells[toIndex(1, 1, 4)].ground).toBe("Soil");
    expect(e.getState().past).toHaveLength(1);
  });
  it("cancels a pencil stroke with no history entry", () => {
    const e = ed();
    e.pointerDown([0, 0]);
    e.cancel();
    expect(e.getState().cells[0]).toBe(EMPTY_CELL);
    expect(e.getState().past).toHaveLength(0);
  });
  it("picks with the picker tool and alt-click", () => {
    const e = ed();
    e.setBrush("entity:Cactus");
    e.setParam("cactusSize", 3);
    e.pointerDown([2, 2]);
    e.pointerUp();
    e.setBrush("ground:Soil");
    e.setParam("cactusSize", 9);
    e.pointerDown([2, 2], { alt: true });
    expect(e.getState().brushId).toBe("entity:Cactus");
    expect(e.getState().params.cactusSize).toBe(3);
  });
  it("resizes anchored at the south-west corner and undoes the resize", () => {
    const e = ed();
    e.pointerDown([0, 0]);
    e.pointerUp();
    e.pointerDown([3, 3]);
    e.pointerUp();
    e.resize(6);
    const s = e.getState();
    expect(s.size).toBe(6);
    expect(s.cells[toIndex(0, 0, 6)].entity).toBe("Carrot");
    expect(s.cells[toIndex(3, 3, 6)].entity).toBe("Carrot");
    e.resize(3);
    expect(e.getState().cells.filter((c) => c.entity).length).toBe(1);
    e.undo();
    e.undo();
    expect(e.getState().size).toBe(4);
  });
  it("clamps size to 3–32", () => {
    const e = ed();
    e.resize(1);
    expect(e.getState().size).toBe(3);
    e.resize(99);
    expect(e.getState().size).toBe(32);
    expect(resizeCells(new Array(9).fill(EMPTY_CELL), 3, 5)).toHaveLength(25);
  });
});

describe("validation", () => {
  it("flags soil crops on grassland and adjacent trees", () => {
    const size = 3;
    const cells = new Array(9).fill(EMPTY_CELL);
    cells[0] = { ground: "Grassland", entity: "Carrot" };
    cells[4] = C("Grassland", "Tree");
    cells[5] = C("Grassland", "Tree");
    cells[8] = C("Grassland", "Tree"); // diagonal to 4, orthogonal to 5
    const { issues } = analyzeLayout(cells, size);
    expect(issues.filter((i) => i.type === "wrongGround").map((i) => i.index)).toEqual([0]);
    expect(issues.filter((i) => i.type === "adjacentTrees").map((i) => i.index)).toEqual([4, 5, 8]);
  });
  it("finds the largest pumpkin squares greedily", () => {
    const size = 5;
    const cells = new Array(25).fill(EMPTY_CELL);
    const P = C("Soil", "Pumpkin");
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) cells[toIndex(x, y, size)] = P;
    cells[toIndex(3, 0, size)] = P;
    cells[toIndex(4, 0, size)] = P;
    cells[toIndex(3, 1, size)] = P;
    cells[toIndex(4, 1, size)] = P;
    cells[toIndex(4, 4, size)] = P;
    expect(findPumpkinMerges(cells, size)).toEqual([
      { x: 0, y: 0, n: 3 },
      { x: 3, y: 0, n: 2 },
    ]);
  });
  it("detects unsorted cacti", () => {
    const K = (n) => C("Soil", "Cactus", { cactusSize: n });
    const cells = new Array(9).fill(EMPTY_CELL);
    cells[toIndex(0, 0, 3)] = K(1);
    cells[toIndex(1, 0, 3)] = K(2);
    cells[toIndex(0, 1, 3)] = K(3);
    expect([...analyzeLayout(cells, 3).cactusSorted]).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    cells[toIndex(1, 0, 3)] = K(0);
    const flags = analyzeLayout(cells, 3).cactusSorted;
    expect(flags[toIndex(0, 0, 3)]).toBe(0);
    expect(flags[toIndex(1, 0, 3)]).toBe(0);
  });
  it("does not merge single pumpkins", () => {
    const cells = new Array(9).fill(EMPTY_CELL);
    cells[0] = C("Soil", "Pumpkin");
    expect(findPumpkinMerges(cells, 3)).toEqual([]);
  });
});

describe("import / export", () => {
  it("round-trips Python", () => {
    const layout = randomLayout(7);
    const py = exportPython(layout);
    expect(py).toContain("Grounds.");
    expect(py).toContain("grid_size = 7");
    expect(parsePython(py)).toEqual(layout);
    expect(parseLayout(py)).toEqual(layout);
  });
  it("writes params into Python", () => {
    const py = exportPython({ size: 3, cells: [C("Soil", "Cactus", { cactusSize: 4 }), ...new Array(8).fill(EMPTY_CELL)] });
    expect(py).toContain('{"ground": Grounds.Soil, "entity": Entities.Cactus, "size": 4},');
    expect(py).toContain('{"ground": Grounds.Grassland, "entity": None},');
  });
  it("round-trips JSON", () => {
    const layout = randomLayout(5, 7);
    expect(parseJson(exportJson(layout))).toEqual(layout);
    expect(parseLayout(exportJson(layout))).toEqual(layout);
  });
  it("imports the legacy lowercase format", () => {
    const legacy = JSON.stringify(
      new Array(9).fill(0).map((_, i) => (i === 0 ? { ground: "soil", crop: "carrot" } : { ground: "grass" })),
    );
    const { size, cells } = parseLayout(legacy);
    expect(size).toBe(3);
    expect(cells[0]).toEqual({ ground: "Soil", entity: "Carrot" });
    expect(cells[1]).toBe(EMPTY_CELL);
  });
  it("keeps invalid imported tiles so validation can flag them", () => {
    const py = exportPython({ size: 3, cells: new Array(9).fill(EMPTY_CELL) }).replace(
      '"entity": None',
      '"entity": Entities.Carrot',
    );
    const { cells, size } = parsePython(py);
    expect(cells[0]).toEqual({ ground: "Grassland", entity: "Carrot" });
    expect(analyzeLayout(cells, size).issues[0].type).toBe("wrongGround");
  });
  it("rejects bad input", () => {
    expect(() => parseLayout("")).toThrow();
    expect(() => parseLayout('[{"ground": "lava"}]')).toThrow();
    expect(() => parseLayout(JSON.stringify(new Array(5).fill({ ground: "Soil" })))).toThrow(/square/);
  });
  it("round-trips the URL encoding compactly", () => {
    const layout = randomLayout(32, 3);
    expect(decodeLayout(encodeLayout(layout))).toEqual(layout);
    const empty = { size: 32, cells: new Array(1024).fill(EMPTY_CELL) };
    expect(encodeLayout(empty)).toBe("1.32.A~1024.");
    expect(decodeLayout(encodeLayout(empty))).toEqual(empty);
  });
});

describe("game script export", () => {
  it("is a sectioned script that only names entities the layout uses", async () => {
    const { exportScript, scriptRoutes } = await import("./io.js");
    const cells = [C("Soil", "Pumpkin"), C("Grassland", "Tree"), C("Grassland", "Hedge"), ...new Array(6).fill(EMPTY_CELL)];
    const py = exportScript({ size: 3, cells });
    for (const section of ["Layout", "Movement", "Farming", "Run"]) expect(py).toContain(`# ==== ${section} ====`);
    expect(py).toContain("PLANTABLE = [Entities.Tree, Entities.Pumpkin]");
    expect(py).not.toContain("Entities.Cactus");
    expect(py).toContain("USE_FERTILIZER = False");
    expect(exportScript({ size: 3, cells }, { fertilize: true })).toContain("USE_FERTILIZER = True");
    expect(py).not.toMatch(/^ +\S/m); // tabs only
    expect(py.match(/Farm layout 3x3/g)).toHaveLength(1);
    expect(parseLayout(py).cells).toEqual(cells);
    // Empty grassland is skipped; only the pumpkin is tended.
    const routes = scriptRoutes({ size: 3, cells });
    expect([...routes.plant].sort()).toEqual([0, 1, 2]);
    expect(routes.tend).toEqual([0]);
    expect(py).toContain("plant_order = [\n\t0, 1, 2\n]");
  });

  it("keeps the Movement section free of layout names", async () => {
    const { exportScript } = await import("./io.js");
    const py = exportScript({ size: 3, cells: new Array(9).fill(EMPTY_CELL) });
    const movement = py.slice(py.indexOf("# ==== Movement ===="), py.indexOf("# ==== Farming ===="));
    expect(movement).not.toMatch(/grid|PLANTABLE|tile\[/);
  });
});
