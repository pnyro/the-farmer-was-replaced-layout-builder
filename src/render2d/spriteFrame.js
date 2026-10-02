// Shared framing for the 2D map sprites rendered by scripts/render-icons.mjs.
// A sprite is an orthographic view of one tile's entity: the tile centre is at world (0,0,0)
// and the camera looks down from the south at SPRITE_ELEVATION degrees.
export const SPRITE_ELEVATION = 58;
export const SPRITE_FRAME = { left: -0.62, right: 0.62, top: 1.18, bottom: -0.62, px: 200 };
export const ICON_SIZE = 128;

/** Where the tile centre lands inside the sprite image, as fractions of width/height. */
export const SPRITE_ANCHOR = {
  x: -SPRITE_FRAME.left / (SPRITE_FRAME.right - SPRITE_FRAME.left),
  y: SPRITE_FRAME.top / (SPRITE_FRAME.top - SPRITE_FRAME.bottom),
};
/** Sprite size in tile units. */
export const SPRITE_UNITS = {
  w: SPRITE_FRAME.right - SPRITE_FRAME.left,
  h: SPRITE_FRAME.top - SPRITE_FRAME.bottom,
};
