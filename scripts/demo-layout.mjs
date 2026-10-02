#!/usr/bin/env node
// Prints a share-link hash for a demo farm (used for README screenshots).
//   node scripts/demo-layout.mjs [size]
import { makeCell } from "../src/core/grid.js";
import { encodeLayout } from "../src/core/io.js";

export const demoLayout = (size = 12) => {
  const cells = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let c = makeCell("Grassland", null);
      const half = Math.floor(size / 2);
      if (x < half && y < half) {
        // pumpkin patch: a big square plus a 2x2 and a few singles
        if (x < 4 && y < 4) c = makeCell("Soil", "Pumpkin");
        else if (x >= 4 && y < 2) c = makeCell("Soil", "Pumpkin");
        else c = makeCell("Soil", (x + y) % 3 === 0 ? "Pumpkin" : "Carrot");
      } else if (x >= half && y < half) {
        // checkerboard trees with grass (no adjacent trees)
        c = (x + y) % 2 === 0 ? makeCell("Grassland", "Tree") : makeCell("Grassland", "Bush");
        if (y === half - 1) c = makeCell("Grassland", "Grass");
      } else if (x < half && y >= half) {
        // sorted cactus field
        c = makeCell("Soil", "Cactus", { cactusSize: Math.min(9, (x + (y - half)) ) });
        if (x === 1 && y === half + 1) c = makeCell("Soil", "Cactus", { cactusSize: 0 });
      } else {
        if (y >= size - 2) c = makeCell("Soil", "Sunflower", { petals: 7 + ((x * 3 + y) % 9) });
        else c = makeCell("Grassland", "Grass");
      }
      cells.push(c);
    }
  }
  return { size, cells };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const size = Number(process.argv[2] ?? 12);
  console.log(`#layout=${encodeLayout(demoLayout(size))}`);
}
