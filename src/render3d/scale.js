// Size rules shared by the 3D models and 2D sprites (kept free of three.js imports).

/** Cactus model height multiplier for a size 0–9 (size 0 ≈ a sprout, 9 ≈ tree height). */
export const cactusScale = (size) => 0.16 + 0.1 * size;

/** Giant pumpkin scale (x, y, z) for an n×n merge; the unit model is 1 wide and 1 tall. */
export const bigPumpkinScale = (n) => [n * 0.94, 0.44 + 0.2 * (n - 1), n * 0.94];
