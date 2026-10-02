// Import / export: paste-ready Python, JSON, and a compact URL-hash encoding.

import { ENTITIES, ENTITY_BY_NAME, GROUNDS, PARAMS, isEntity, isGround } from "./entities.js";
import { cellParam, clampSize, createCells, makeCell } from "./grid.js";
import { planRoute, routeLength } from "./route.js";

const PY_PARAM_TO_KEY = Object.fromEntries(Object.values(PARAMS).map((p) => [p.py, p.key]));

// ---------------------------------------------------------------- Python

const pyCell = (c) => {
  const parts = [`"ground": Grounds.${c.ground}`, `"entity": ${c.entity ? `Entities.${c.entity}` : "None"}`];
  const key = c.entity ? ENTITY_BY_NAME[c.entity]?.param : undefined;
  if (key) parts.push(`"${PARAMS[key].py}": ${cellParam(c)}`);
  return `{${parts.join(", ")}}`;
};

/**
 * Paste-ready Python for the game. `grid[y * size + x]` is the tile at (x, y), (0,0) = south-west,
 * which is exactly the order `index_to_coords()` in the README drone scripts expects.
 */
export const exportPython = ({ size, cells }, { name = "grid" } = {}) => {
  const lines = [];
  lines.push(`# Farm layout ${size}x${size}, made with the TFWR Layout Builder.`);
  lines.push(`# ${name}[y * ${name}_size + x] is the tile at (x, y); (0, 0) is the south-west corner.`);
  lines.push(`# Rows go south to north, ${size} tiles per row.`);
  lines.push(`${name}_size = ${size}`);
  lines.push(`${name} = [`);
  // Kept deliberately plain (one tile per line, no comments or trailing comma inside the list)
  // so the game's Python dialect parses it.
  cells.forEach((c, i) => lines.push(`\t${pyCell(c)}${i < cells.length - 1 ? "," : ""}`));
  lines.push("]");
  return lines.join("\n") + "\n";
};

// The game script (exportScript): one paste-ready script in sections that also work on their own.
// Written for the game's Python dialect: tabs, no abs() (needs the Utilities unlock), and it only
// names entities the layout uses, so a save without e.g. cacti can still run it.

const MOVEMENT = `# ==== Movement ====
# Only uses the game's built-ins. Takes the shortest way to a tile, including around the
# farm's wrapping edges.

# Signed number of moves from current to target on an axis of the given size.
def steps(current, target, size):
	diff = target - current
	if diff > size // 2:
		diff = diff - size
	elif diff < -(size // 2):
		diff = diff + size
	return diff

def move_to(x, y):
	size = get_world_size()
	dx = steps(get_pos_x(), x, size)
	dy = steps(get_pos_y(), y, size)
	while dx > 0:
		move(East)
		dx = dx - 1
	while dx < 0:
		move(West)
		dx = dx + 1
	while dy > 0:
		move(North)
		dy = dy - 1
	while dy < 0:
		move(South)
		dy = dy + 1

# Index in a row-by-row list (south row first) with rows of row_size tiles.
def move_to_index(index, row_size):
	move_to(index % row_size, index // row_size)
`;

const farming = ({ plantable, fertilize }) => `# ==== Farming ====
# Works on the tile under the drone. A tile is {"ground": ..., "entity": ...} like in grid.

USE_WATER = True
# Fertilizer grows the plant under the drone by 2s per use. Speeds up giant pumpkins.
USE_FERTILIZER = ${fertilize ? "True" : "False"}

# The entities in this layout the drone can plant (the game spawns the others).
PLANTABLE = [${plantable.map((e) => `Entities.${e}`).join(", ")}]

# Makes the tile match: clears what's there, tills if needed, plants.
def plant_tile(tile):
	entity = tile["entity"]
	if get_ground_type() == tile["ground"] and get_entity_type() == entity:
		return
	if get_entity_type() != None:
		harvest()
	if get_ground_type() != tile["ground"]:
		till()
	if entity in PLANTABLE:
		if USE_WATER and get_water() < 0.5 and num_items(Items.Water) > 0:
			use_item(Items.Water)
		plant(entity)

# Pumpkins can die while growing, and only full squares of grown pumpkins merge into giants.
# Replants or fertilizes; returns True while the tile still needs another visit.
def tend_tile(tile):
	if get_entity_type() != tile["entity"]:
		plant_tile(tile)
		return True
	if can_harvest():
		return False
	if USE_FERTILIZER and num_items(Items.Fertilizer) > 0:
		use_item(Items.Fertilizer)
	return True
`;

const RUN = `# ==== Run ====
def plant_layout():
	for index in plant_order:
		move_to_index(index, grid_size)
		plant_tile(grid[index])

# Keeps going round the pumpkins until all of them are grown.
def tend_pumpkins():
	busy = True
	while busy:
		busy = False
		for index in tend_order:
			move_to_index(index, grid_size)
			if tend_tile(grid[index]):
				busy = True

if grid_size > get_world_size():
	print("The layout is", grid_size, "wide but the farm is", get_world_size())
else:
	plant_layout()
	print("Layout planted")
	if len(tend_order) > 0:
		tend_pumpkins()
		print("Pumpkins grown")
`;

const pyList = (name, values, perLine = 32) => {
  if (!values.length) return `${name} = []`;
  const rows = [];
  for (let i = 0; i < values.length; i += perLine) rows.push(`\t${values.slice(i, i + perLine).join(", ")}`);
  return `${name} = [\n${rows.join(",\n")}\n]`;
};

/**
 * The drone's routes for a layout: every tile that isn't empty grassland (plant), then the
 * pumpkins (tend), each ordered for few moves. `moves` is the planting route's length.
 */
export const scriptRoutes = ({ size, cells }) => {
  const work = [];
  const pumpkins = [];
  cells.forEach((c, i) => {
    if (c.ground !== "Grassland" || c.entity) work.push(i);
    if (c.entity === "Pumpkin") pumpkins.push(i);
  });
  const plant = planRoute(work, size);
  const tend = planRoute(pumpkins, size, { start: plant.length ? plant[plant.length - 1] : 0 });
  return { plant, tend, moves: routeLength(plant, size), sweepMoves: size * size - 1 };
};

/**
 * One self-contained script for the game: the layout, the routes, and the drone code to plant it
 * and then tend the pumpkins until they're grown. `fertilize` sets USE_FERTILIZER.
 */
export const exportScript = (layout, { fertilize = false, routes = scriptRoutes(layout) } = {}) => {
  const { size, cells } = layout;
  const plantable = ENTITIES.filter((e) => e.category === "plant" && cells.some((c) => c.entity === e.name)).map((e) => e.name);
  const grid = exportPython(layout).split("\n").slice(1).join("\n"); // without its title line
  return [
    `# Farm layout ${size}x${size}, made with the TFWR Layout Builder.`,
    "# Paste the whole script into one code window and run it. Each section also works when",
    "# copied on its own: Layout is just data, Movement only uses the game's built-ins.",
    "",
    "# ==== Layout ====",
    grid.trimEnd(),
    "# Tiles to plant and pumpkins to tend, in an order planned for few drone moves.",
    pyList("plant_order", routes.plant),
    pyList("tend_order", routes.tend),
    "",
    MOVEMENT,
    farming({ plantable, fertilize }),
    RUN,
  ].join("\n");
};

/**
 * Parse Python produced by exportPython (or hand-written in the same shape). Tolerant:
 * reads every {...} dict in order and an optional `<name>_size = N` / `size = N` line.
 */
export const parsePython = (text) => {
  const src = text.replace(/#[^\n]*/g, "");
  const dicts = src.match(/\{[^{}]*\}/g) ?? [];
  if (!dicts.length) throw new Error("No tiles found. Expected a list of {\"ground\": ..., \"entity\": ...} dicts.");
  const cells = dicts.map((d, i) => {
    const ground = /["']ground["']\s*:\s*(?:Grounds\.)?(\w+)/.exec(d)?.[1];
    const entityRaw = /["'](?:entity|crop)["']\s*:\s*(?:Entities\.)?(\w+)/.exec(d)?.[1];
    if (ground && !isGround(ground)) throw new Error(`Tile ${i}: unknown ground "${ground}".`);
    const entity = entityRaw && entityRaw !== "None" ? entityRaw : null;
    if (entity && !isEntity(entity)) throw new Error(`Tile ${i}: unknown entity "${entity}".`);
    const params = {};
    for (const [py, key] of Object.entries(PY_PARAM_TO_KEY)) {
      const m = new RegExp(`["']${py}["']\\s*:\\s*(-?\\d+)`).exec(d);
      if (m) params[key] = Number(m[1]);
    }
    return { ground: ground ?? "Grassland", entity, params };
  });
  const sizeMatch = /^\s*(?:\w+_)?size\s*=\s*(\d+)/m.exec(src);
  return fromRawCells(cells, sizeMatch ? Number(sizeMatch[1]) : undefined);
};

// ---------------------------------------------------------------- JSON

export const exportJson = ({ size, cells }) =>
  JSON.stringify(
    {
      format: "tfwr-layout",
      version: 1,
      size,
      cells: cells.map((c) => {
        const out = { ground: c.ground, entity: c.entity };
        const key = c.entity ? ENTITY_BY_NAME[c.entity]?.param : undefined;
        if (key) out.params = { [key]: cellParam(c) };
        return out;
      }),
    },
    null,
    2,
  );

// Old app format: [{ ground: "soil"|"grass"|"water", crop?: "carrot"|... }]
const LEGACY_GROUND = { soil: "Soil", grass: "Grassland", grassland: "Grassland", water: "Grassland" };
const LEGACY_ENTITY = { wheat: "Grass", hay: "Grass", grass: "Grass" };

const normalizeName = (raw, table, legacy) => {
  if (raw === null || raw === undefined || raw === "" || raw === "None") return null;
  const s = String(raw).replace(/^(Grounds|Entities)\./, "");
  if (table(s)) return s;
  const lower = s.toLowerCase();
  if (legacy[lower]) return legacy[lower];
  const match = (table === isGround ? GROUNDS : ENTITIES).find((r) => r.name.toLowerCase() === lower);
  if (match) return match.name;
  throw new Error(`Unknown ${table === isGround ? "ground" : "entity"} "${raw}".`);
};

export const parseJson = (text) => {
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : data?.cells;
  if (!Array.isArray(list)) throw new Error("JSON must be an array of tiles or { size, cells: [...] }.");
  const cells = list.map((c) => ({
    ground: normalizeName(c?.ground ?? "Grassland", isGround, LEGACY_GROUND),
    entity: normalizeName(c?.entity ?? c?.crop ?? null, isEntity, LEGACY_ENTITY),
    params: c?.params ?? {
      ...(c?.size !== undefined ? { cactusSize: c.size } : {}),
      ...(c?.petals !== undefined ? { petals: c.petals } : {}),
    },
  }));
  return fromRawCells(cells, Array.isArray(data) ? undefined : data.size);
};

/** Auto-detect JSON vs Python. */
export const parseLayout = (text) => {
  const t = text.trim();
  if (!t) throw new Error("Nothing to import.");
  if (t.startsWith("{") && /"cells"\s*:/.test(t)) return parseJson(t);
  if (t.startsWith("[") && !/Grounds\.|Entities\./.test(t)) return parseJson(t);
  return parsePython(t);
};

// Imported cells are kept as-is (even soil crops on grassland) so validation can flag them.
const fromRawCells = (raw, declaredSize) => {
  let size = declaredSize;
  if (!size) {
    size = Math.round(Math.sqrt(raw.length));
    if (size * size !== raw.length) {
      throw new Error(`Found ${raw.length} tiles, which isn't a square grid. Add a "size" to the data.`);
    }
  }
  if (size !== clampSize(size)) throw new Error(`Size ${size} is outside the supported range 3–32.`);
  if (raw.length !== size * size) {
    throw new Error(`Expected ${size * size} tiles for a ${size}x${size} farm, found ${raw.length}.`);
  }
  const cells = raw.map((c) => makeCell(c.ground, c.entity, c.params));
  return { size, cells };
};

// ---------------------------------------------------------------- URL hash codec
// Every distinct tile state maps to one character; runs of 3+ use "~<count>." after the char.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const buildStates = () => {
  const states = [];
  for (const g of GROUNDS) {
    states.push(makeCell(g.name, null));
    for (const e of ENTITIES) {
      const p = e.param ? PARAMS[e.param] : null;
      if (!p) states.push(makeCell(g.name, e.name));
      else for (let v = p.min; v <= p.max; v++) states.push(makeCell(g.name, e.name, { [p.key]: v }));
    }
  }
  return states;
};

const STATES = buildStates();
const stateKey = (c) => `${c.ground}|${c.entity ?? ""}|${cellParam(c) ?? ""}`;
const STATE_INDEX = new Map(STATES.map((s, i) => [stateKey(s), i]));
// Two-character codes would be needed past 64 states; the current table uses 60.
const WIDE = STATES.length > ALPHABET.length;

const encState = (i) =>
  WIDE ? ALPHABET[Math.floor(i / 64)] + ALPHABET[i % 64] : ALPHABET[i];

export const encodeLayout = ({ size, cells }) => {
  let out = "";
  let i = 0;
  while (i < cells.length) {
    const code = STATE_INDEX.get(stateKey(cells[i])) ?? 0;
    let run = 1;
    while (i + run < cells.length && STATE_INDEX.get(stateKey(cells[i + run])) === code) run++;
    out += encState(code);
    if (run >= 3) out += `~${run}.`;
    else if (run === 2) out += encState(code);
    i += run;
  }
  return `1.${size}.${out}`;
};

export const decodeLayout = (str) => {
  const m = /^1\.(\d+)\.(.*)$/.exec(str.trim());
  if (!m) throw new Error("Unrecognized layout link.");
  const size = Number(m[1]);
  if (size !== clampSize(size)) throw new Error("Layout link has an invalid size.");
  const data = m[2];
  const cells = createCells(size);
  const step = WIDE ? 2 : 1;
  let pos = 0;
  let k = 0;
  while (pos < data.length && k < cells.length) {
    const chunk = data.slice(pos, pos + step);
    let code = 0;
    for (const ch of chunk) code = code * 64 + ALPHABET.indexOf(ch);
    const state = STATES[code];
    if (!state || chunk.length < step) throw new Error("Layout link is corrupted.");
    pos += step;
    let run = 1;
    if (data[pos] === "~") {
      const end = data.indexOf(".", pos);
      run = Number(data.slice(pos + 1, end));
      if (!Number.isInteger(run) || run < 1 || end < 0) throw new Error("Layout link is corrupted.");
      pos = end + 1;
    }
    for (let r = 0; r < run && k < cells.length; r++) cells[k++] = state;
  }
  return { size, cells };
};
