# Revamp brief: TFWR Layout Builder

Research notes for the implementation pass. Source of truth for game data is the installed game:
`~/Library/Application Support/Steam/steamapps/common/The Farmer Was Replaced/TheFarmerWasReplaced_Data/StreamingAssets/Languages/builtins.py`
(plus `Languages/EN/docs/unlocks/*.md`).

## Current app (React 19 + Vite, plain JS)
- `App.jsx` holds grid state `{ground, crop}` (row-major, index 0 = bottom-left), tool selection, shortcuts.
- `Dock.jsx` = tool palette, grid size (1–64, even only), reset, JSON export.
- `FarmGrid.jsx` = 2D canvas renderer + fake "isometric" CSS 3D transform with hand-inverted hit testing.
- `GridCell.jsx` is dead code (canvas replaced it).
- Problems vs the real game:
  - Tools include `water` ground, `wheat`, `hay`, `apple` — none are plantable game entities/grounds.
  - Size rule is wrong: game farm is up to **32×32**; `set_world_size(n)` allows any n ≥ 3 (odd OK).
  - Export is lowercase JSON (`"soil"`, `"carrot"`), but README drone scripts expect `Grounds.Soil` / `Entities.Carrot` Python values → user must hand-convert.
  - README `coords_to_index` has a bug (`grid_size = get_world_size() ** 2`).

## Game data (from builtins.py)
**Grounds:** `Grassland` (default), `Soil` (via `till()`). Nothing else.

**Plantable entities** (grows on):
| Entity | Ground | Notes for rendering |
|---|---|---|
| Grass | grassland or soil | auto-grows on grassland; looks like tall wheat |
| Bush | grassland or soil | small round shrub |
| Tree | grassland or soil | slower if orthogonally adjacent to other trees (worth a warning overlay) |
| Carrot | soil | |
| Pumpkin | soil | full squares of grown pumpkins merge into one giant pumpkin (mesh pieces exist: Corner/Edge/Middle/End/Big) |
| Cactus | soil | sizes 0–9; brown when unsorted, green when sorted |
| Sunflower | soil | 7–15 petals |

**Non-plantable / generated entities** (show as "special" or view-only): `Apple` (dinosaur food), `Dinosaur` (tail segment, renders as chicken body), `Hedge` + `Treasure` (maze), `Dead_Pumpkin`.

Planting a soil-only crop on grassland is invalid in-game → the editor should auto-set ground to Soil (or flag it).

Coordinates: (0,0) is south-west, x→East, y→North. Index = y * size + x.

Mining DLC ("The Miner Was Replaced") releases Nov 2 2026 — not in builtins yet; keep the entity table data-driven so it's easy to extend.

## Visual reference (3D mode)
Steam screenshots + extracted assets (scratchpad: `…/scratchpad/ss/sheet.jpg`, `…/scratchpad/farm.html`):
- Farm is one contiguous chunky earth slab with rocks on the sides; tiles sit flush on top with faint seams.
- Grassland tile: dark olive-green top. Soil tile: brown with ploughed furrows.
- Perspective camera, steep (~55–60°) three-quarter view, warm golden-hour directional light, soft shadows, light bloom.
- Background: flat muted slate blue-grey (~`#8a9db0`), no ground plane.
- Low-poly, flat-shaded, colored from a single 16×16 palette texture (no textures beyond that).
- Drone: yellow/orange body with propeller arms, hovers above the farm.
- UI: olive-green square buttons, dark rounded code windows, Montserrat font. Resource icons are tiny low-poly renders.

Palette ramps (exact, sampled from `ColorPalette2.png`, light→dark):
- Mint green: `#61ecb7 #5ceca4 #56ec91 #50eb7d #49eb6a #44eb57`
- Olive (grass/leaves/cactus): `#92a60d #81950b #718409 #617307 #506205 #405103 #304101`
- Grey (stone/drone frame): `#cccccc #b2b2b2 #989898 #7f7f7f #656565 #4b4b4b #313131`
- Tan (wheat/straw): `#caae7e #caa972 #caa567 #cba05b #cb9c50 #cc9845`
- Brown (soil/wood): `#cc9845 #ac7b36 #8c5f27 #7e5421 #70491b #623e15 #553310`
- Orange-yellow (pumpkin/drone/sunflower): `#ffc62d #fabd25 #f6b51e #f1ad16 #eda40f #e89c07 #e49400`
- Purple→red-orange gradient (accents/flowers): `#7656b7 … #af5351 … #dd5200`
- Teal `#006b7a`, background off-white `#f0f0f0`

Game mesh metrics (Z-up from Unity/Blender, rotate −90° on X): tile ≈ 1.2 × 1.2 top, ~1.1 deep; Tree ≈ 1.3 tall; Sunflower ≈ 1.3–1.45 tall; Carrots ≈ 0.6 tall; Bush ≈ 0.35 tall; Cactus 0.2 (size 0) → 1.3 (size 9).

## Decisions (confirmed by owner)
- **No game assets in the repo.** Every 3D entity is modeled in code with three.js, in the same low-poly palette style. An optional, gitignored local extractor that loads the real meshes is allowed but not required.
- **Don't use the existing 2D icons in `src/assets/`** (web-sourced, unclear license). Replace them with original icons: either generated with the `codex` CLI (its `image_generation` feature is enabled), or rendered from our own three.js models.
- **Stack:** `@react-three/fiber` + `@react-three/drei`.
- **2D and 3D have the same features** — only the projection differs. Every tool, overlay, selection, hover, validation and shortcut works the same in both. Put real effort into the 2D view, not just 3D.

## Proposed scope
1. Data model: `{ ground: 'Grassland'|'Soil', entity: EntityName|null, params?: {cactusSize, petals} }`, data-driven entity table.
2. Tool palette: all grounds + entities (plantable section, special section), eraser, fill/rect/line tools, undo/redo.
3. Views: 2D top-down (existing canvas, cleaned up) and real 3D mode (three.js / @react-three/fiber) with orbit camera, raycast painting, hover highlight, game look above. Drop the CSS-transform isometric hack.
4. Size: 3–32 (any integer), plus presets matching the game's expansions.
5. Export: paste-ready Python (`Grounds.Soil`, `Entities.Carrot`, index order matching the drone scripts), plus JSON; import of either; localStorage autosave; shareable URL.
6. Validation overlays: soil-only crop on grassland, adjacent trees, pumpkin merge preview.
7. Fix README scripts and update screenshots.
