// "Farm tour": builds a 32×32 showcase farm with every tool, then shows it off in 3D.
// Used for the README video (scripts/record-demo.mjs) and as a built-in routine.
//
//   NW  hedge maze with treasure      NE  sorted cactus field
//   SW  pumpkin patch + carrots       SE  orchard + sunflower field
//   with grass paths and a dinosaur in between.

const tool = (t) => ({ op: "tool", tool: t });
const brush = (b, params) => ({ op: "brush", brush: b, ...(params && { params }) });
const drag = (from, to, shift = false) => ({ op: "stroke", path: [from, to], ...(shift && { shift }) });
const click = (at) => ({ op: "stroke", path: [at] });
const note = (text) => ({ op: "note", text });
const wait = (ms) => ({ op: "wait", ms });

// Maze in the NW quarter: a 13×13 hedge square at (1,18) with interior walls (local coordinates).
const MAZE = [1, 18];
const m = ([u, v]) => [MAZE[0] + u, MAZE[1] + v];
const MAZE_WALLS = [
  [[2, 2], [8, 2]],
  [[10, 0], [10, 4]],
  [[2, 4], [2, 10]],
  [[4, 4], [8, 4]],
  [[4, 6], [4, 10]],
  [[8, 6], [10, 6]],
  [[6, 8], [10, 8]],
  [[6, 10], [12, 10]],
];

// Cactus sizes grow towards the north-east corner: nested squares from (18,18) to (30,30).
const CACTUS_BANDS = [
  [3, 18],
  [5, 21],
  [7, 24],
  [9, 27],
];

export const farmTour = {
  name: "Farm tour",
  description: "Builds a 32×32 showcase farm with every tool, then flies around it in 3D.",
  steps: [
    { op: "setup", size: 32 },
    wait(600),

    // SW: pumpkin patch
    note("Till a patch of soil"),
    tool("rect"),
    brush("ground:Soil"),
    drag([1, 1], [13, 13]),
    note("Full pumpkin squares merge into giant pumpkins"),
    brush("entity:Pumpkin"),
    drag([2, 2], [7, 7]),
    drag([9, 2], [12, 5]),
    drag([9, 8], [11, 10]),
    drag([3, 10], [4, 11]),
    note("Flood-fill the rest with carrots"),
    tool("fill"),
    brush("entity:Carrot"),
    click([1, 13]),
    wait(300),

    // NW: hedge maze
    note("Lines and outlines for a hedge maze"),
    tool("rect"),
    brush("entity:Hedge"),
    drag(m([0, 0]), m([12, 12]), true),
    tool("line"),
    ...MAZE_WALLS.map(([a, b]) => drag(m(a), m(b))),
    tool("pencil"),
    brush("erase"),
    click(m([6, 0])),
    brush("entity:Treasure"),
    click(m([7, 7])),
    wait(300),

    // NE: sorted cactus field
    note("A sorted cactus field: sizes grow to the north-east"),
    tool("rect"),
    ...CACTUS_BANDS.flatMap(([size, from]) => [brush("entity:Cactus", { cactusSize: size }), drag([from, from], [30, 30])]),
    wait(300),

    // SE: orchard — trees on every third diagonal so no two trees touch
    note("An orchard: bushes, with trees on the diagonals"),
    brush("entity:Bush"),
    drag([18, 8], [30, 13]),
    tool("line"),
    brush("entity:Tree"),
    drag([18, 11], [20, 13], true),
    drag([18, 8], [23, 13], true),
    drag([21, 8], [26, 13], true),
    drag([24, 8], [29, 13], true),
    drag([27, 8], [30, 11], true),
    wait(300),

    note("A dinosaur chasing an apple"),
    tool("pencil"),
    brush("entity:Dinosaur"),
    { op: "stroke", path: [[19, 16], [26, 16], [26, 15], [23, 15]] },
    brush("entity:Apple"),
    click([29, 16]),
    wait(500),

    // The same tools in 3D
    note("Everything works in 3D too"),
    { op: "view", view: "3d" },
    note("Plant a sunflower field"),
    tool("rect"),
    brush("entity:Sunflower", { petals: 12 }),
    drag([18, 1], [30, 6]),
    note(""),
    wait(400),
    { op: "orbit", degrees: 360, ms: 10000 },
    wait(800),
  ],
};
