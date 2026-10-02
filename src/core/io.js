// Import / export: paste-ready Python, JSON, and a compact URL-hash encoding.

import { ENTITIES, ENTITY_BY_NAME, GROUNDS, PARAMS, isEntity, isGround } from "./entities.js";
import { cellParam, clampSize, createCells, makeCell } from "./grid.js";

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

// The drone code appended by exportScript(). Written for the game's Python dialect: tabs, no
// abs() (needs the Utilities unlock), and only names the layout actually uses, so a save that
// hasn't unlocked e.g. cacti can still run a layout without them.
const SCRIPT_BODY = `
# ---- Drone code: no need to edit below this line ----

# Signed number of moves from current to target on an axis that wraps around.
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

def do_tile(tile):
	entity = tile["entity"]
	if can_harvest():
		harvest()
	elif get_entity_type() != None and get_entity_type() != entity:
		harvest()
	if get_ground_type() != tile["ground"]:
		till()
	if entity in PLANTABLE and get_entity_type() != entity:
WATER_LINES		plant(entity)

# Visits every tile row by row from the south-west corner, snaking so the drone never
# doubles back. The first pass plants everything; later passes only fix tiles that differ
# from the layout (dead pumpkins, missing plants), so grown crops are left for you.
def visit(first):
	for y in range(grid_size):
		for i in range(grid_size):
			x = i
			if y % 2 == 1:
				x = grid_size - 1 - i
			tile = grid[y * grid_size + x]
			move_to(x, y)
			if first or (tile["entity"] != None and get_entity_type() != tile["entity"]):
				do_tile(tile)

if grid_size > get_world_size():
	print("The layout is", grid_size, "wide but the farm is", get_world_size())
else:
	visit(True)
	# Keep tending until you stop the script: replants dead pumpkins so giants can form.
	while True:
		visit(False)
`;

/**
 * One self-contained script for the game: the layout plus the drone code that plants and then
 * tends it. Paste it into a single code window and run it. `water` waters tiles before planting.
 */
export const exportScript = ({ size, cells }, { water = true } = {}) => {
  const used = ENTITIES.filter((e) => e.category === "plant" && cells.some((c) => c.entity === e.name));
  const header = [
    "# Paste this whole script into one code window and run it. The drone plants the",
    "# layout starting in the south-west corner, then keeps it tended until you stop it.",
  ].join("\n");
  const plantable = `\n# Entities in this layout the drone can plant (the game spawns the others).\nPLANTABLE = [${used
    .map((e) => `Entities.${e.name}`)
    .join(", ")}]\n`;
  const waterLines = water ? "\t\tif get_water() < 0.5 and num_items(Items.Water) > 0:\n\t\t\tuse_item(Items.Water)\n" : "";
  return exportPython({ size, cells }).replace("\n", `\n${header}\n`) + plantable + SCRIPT_BODY.replace("WATER_LINES", waterLines);
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
