import { describe, expect, it } from "vitest";
import { createEditor } from "./editor.js";
import { toIndex } from "./grid.js";
import { compileRoutine, createPlayer, validateRoutine } from "./routine.js";
import { farmTour } from "../routines/farmTour.js";

const play = (routine, step = 33) => {
  const editor = createEditor();
  const player = createPlayer(editor, routine);
  for (let t = 0; t < player.duration; t += step) player.advanceTo(t);
  player.advanceTo(player.duration);
  return { editor, player, state: editor.getState() };
};

describe("routines", () => {
  it("rejects malformed steps with the step number", () => {
    expect(() => validateRoutine({ steps: [{ op: "setup", size: 8 }, { op: "tool", tool: "spray" }] })).toThrow(/Step 2/);
    expect(() => validateRoutine({ steps: [{ op: "stroke", path: [[1.5, 2]] }] })).toThrow(/path/);
    expect(() => validateRoutine({ steps: [{ op: "brush", brush: "entity:Pumpkin", params: { foo: 1 } }] })).toThrow(/param/);
    expect(() => validateRoutine({ steps: [] })).not.toThrow();
  });

  it("paints through the editor's tools, one undo step per gesture", () => {
    const { state, player } = play({
      steps: [
        { op: "setup", size: 8 },
        { op: "tool", tool: "rect" },
        { op: "brush", brush: "entity:Pumpkin" },
        { op: "stroke", path: [[0, 0], [1, 1]] },
        { op: "tool", tool: "pencil" },
        { op: "brush", brush: "entity:Cactus", params: { cactusSize: 4 } },
        { op: "stroke", path: [[0, 7], [7, 7]] },
      ],
    });
    expect(player.done).toBe(true);
    expect(state.analysis.merges).toEqual([expect.objectContaining({ x: 0, y: 0, n: 2 })]);
    for (let x = 0; x < 8; x++) expect(state.cells[toIndex(x, 7, 8)]).toMatchObject({ entity: "Cactus", params: { cactusSize: 4 } });
    expect(state.past).toHaveLength(2);
    expect(state.playback).toMatchObject({ running: false, drone: [7, 7] });
  });

  it("pace speeds up gestures but not waits", () => {
    const steps = [{ op: "setup", size: 8 }, { op: "stroke", path: [[0, 0], [7, 7]] }, { op: "wait", ms: 1000 }];
    const slow = compileRoutine({ steps }).duration;
    const fast = compileRoutine({ steps, pace: 2 }).duration;
    expect(fast - 1000).toBeCloseTo((slow - 1000) / 2);
    expect(() => validateRoutine({ steps, pace: 0 })).toThrow(/pace/);
  });

  it("gives the same result whatever the frame rate", () => {
    const a = play(farmTour, 16).state;
    const b = play(farmTour, 250).state;
    expect(b.cells).toEqual(a.cells);
  });

  it("builds the farm tour without layout issues", () => {
    const { state } = play(farmTour);
    expect(state.size).toBe(32);
    expect(state.view).toBe("3d");
    expect(state.analysis.issues).toEqual([]);
    expect(state.analysis.merges.map((m) => m.n).sort()).toEqual([2, 3, 4, 6]);
    expect(compileRoutine(farmTour).duration).toBeGreaterThan(20000);
  });
});
