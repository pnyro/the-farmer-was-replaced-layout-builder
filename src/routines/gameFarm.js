// "Game farm": a 32×32 farm the drone can really build. Only plantable crops (no hedges,
// treasure, dinosaurs or apples, which the game spawns itself) and no cacti, whose sizes the game
// rolls at random. Used for the editor-to-game video.
//
//   NW  sunflowers around a giant pumpkin   NE  orchard: bushes + trees on the diagonals
//   SW  pumpkin patch + carrots              SE  carrots with pumpkin rows

const tool = (t) => ({ op: "tool", tool: t });
const brush = (b, params) => ({ op: "brush", brush: b, ...(params && { params }) });
const drag = (from, to, shift = false) => ({ op: "stroke", path: [from, to], ...(shift && { shift }) });
const click = (at) => ({ op: "stroke", path: [at] });
const note = (text) => ({ op: "note", text });
const wait = (ms) => ({ op: "wait", ms });

export const gameFarm = {
  name: "Game farm",
  description: "Plans a 32×32 farm with crops the drone can plant, ready to export to the game.",
  steps: [
    { op: "setup", size: 32 },
    wait(500),

    note("Till soil and plant pumpkins: full squares merge into giants"),
    tool("rect"),
    brush("ground:Soil"),
    drag([1, 1], [13, 13]),
    brush("entity:Pumpkin"),
    drag([2, 2], [7, 7]),
    drag([9, 2], [12, 5]),
    drag([9, 8], [11, 10]),
    note("Flood-fill the rest with carrots"),
    tool("fill"),
    brush("entity:Carrot"),
    click([1, 13]),
    wait(250),

    note("Sunflowers around a 5×5 pumpkin"),
    tool("rect"),
    brush("entity:Sunflower"),
    drag([1, 18], [13, 30]),
    brush("entity:Pumpkin"),
    drag([5, 22], [9, 26]),
    wait(250),

    note("An orchard: bushes, with trees on the diagonals"),
    brush("entity:Bush"),
    drag([18, 18], [30, 30]),
    tool("line"),
    brush("entity:Tree"),
    drag([18, 27], [21, 30], true),
    drag([18, 24], [24, 30], true),
    drag([18, 21], [27, 30], true),
    drag([18, 18], [30, 30], true),
    drag([21, 18], [30, 27], true),
    drag([24, 18], [30, 24], true),
    drag([27, 18], [30, 21], true),
    wait(250),

    note("A carrot field"),
    tool("rect"),
    brush("entity:Carrot"),
    drag([18, 1], [30, 13]),
    wait(300),

    note("Same tools in 3D: pumpkin rows (single rows never merge)"),
    { op: "view", view: "3d" },
    tool("line"),
    brush("entity:Pumpkin"),
    drag([18, 4], [30, 4]),
    drag([30, 7], [18, 7]),
    drag([18, 10], [30, 10]),
    note(""),
    wait(400),
    // Finish facing north, like the game's camera.
    { op: "orbit", degrees: 346, ms: 8000 },
    wait(600),
  ],
};
