// Procedural low-poly models, built from primitives with per-face palette colours.
// Coordinate frame: Y up, one tile = 1×1 unit centred on the origin, tile top at y = 0.
// The 3D view instances these geometries and the icon script renders them to PNG/WebP,
// so the 2D icons and the 3D scene always match.

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RAMP } from "./palette.js";
import { mulberry32 } from "../core/random.js";
import { cactusScale } from "./scale.js";

// ------------------------------------------------------------------ helpers

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _n = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/**
 * Turn a primitive into a coloured, transformed, non-indexed part.
 * `color` is a hex string, an array (one picked per triangle), or fn(normal, centroid, rand) → hex.
 */
const part = (geo, color, { pos = [0, 0, 0], rot = [0, 0, 0], scale = 1, seed = 1 } = {}) => {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  geo.dispose();
  for (const k of Object.keys(g.attributes)) if (k !== "position") g.deleteAttribute(k);
  const sc = typeof scale === "number" ? [scale, scale, scale] : scale;
  _m.compose(_v.set(...pos), _q.setFromEuler(_e.set(...rot)), _s.set(...sc));
  g.applyMatrix4(_m);
  const p = g.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const rnd = mulberry32(seed);
  for (let t = 0; t < p.count; t += 3) {
    let hex = color;
    if (Array.isArray(color)) hex = color[Math.floor(rnd() * color.length)];
    else if (typeof color === "function") {
      _a.fromBufferAttribute(p, t + 1).sub(_v.fromBufferAttribute(p, t));
      _b.fromBufferAttribute(p, t + 2).sub(_v.fromBufferAttribute(p, t));
      _n.crossVectors(_a, _b).normalize();
      const cy = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3;
      hex = color(_n, cy, rnd);
    }
    _c.set(hex);
    for (let k = 0; k < 3; k++) {
      colors[(t + k) * 3] = _c.r;
      colors[(t + k) * 3 + 1] = _c.g;
      colors[(t + k) * 3 + 2] = _c.b;
    }
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
};

/** Apply a transform to an already-built part (used for composite sub-assemblies). */
const transform = (g, { pos = [0, 0, 0], rot = [0, 0, 0], scale = 1 } = {}) => {
  const sc = typeof scale === "number" ? [scale, scale, scale] : scale;
  _m.compose(_v.set(...pos), _q.setFromEuler(_e.set(...rot)), _s.set(...sc));
  g.applyMatrix4(_m);
  return g;
};

const build = (parts) => {
  const g = mergeGeometries(parts.flat(), false);
  parts.flat().forEach((p) => p.dispose());
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
};

/** Colour by face direction: top / side / bottom. */
const byNormal = (top, side, bottom = side) => (n) => (n.y > 0.5 ? top : n.y < -0.5 ? bottom : side);

// ------------------------------------------------------------------ tiles

export const TILE_TOP = 0;

const grasslandTile = () =>
  build([
    part(new THREE.BoxGeometry(0.98, 0.16, 0.98), byNormal(RAMP.olive[4], RAMP.olive[5], RAMP.brown[6]), {
      pos: [0, -0.1, 0],
    }),
    // Slightly raised, inset top gives the soft bevel the game tiles have.
    part(new THREE.BoxGeometry(0.94, 0.04, 0.94), byNormal(RAMP.olive[3], RAMP.olive[4]), { pos: [0, -0.02, 0] }),
  ]);

const soilTile = () => {
  const parts = [
    part(new THREE.BoxGeometry(0.98, 0.16, 0.98), byNormal(RAMP.brown[3], RAMP.brown[4], RAMP.brown[6]), {
      pos: [0, -0.11, 0],
    }),
  ];
  // Ploughed furrows: triangular ridges running East–West.
  const ridges = 4;
  for (let r = 0; r < ridges; r++) {
    const z = -0.375 + (r * 0.75) / (ridges - 1);
    parts.push(
      part(new THREE.CylinderGeometry(0.135, 0.135, 0.94, 3, 1), (n) => (n.z > 0 ? RAMP.brown[2] : RAMP.brown[3]), {
        pos: [0, -0.068, z],
        rot: [-Math.PI / 2, 0, Math.PI / 2],
        scale: [1, 1, 0.55],
      }),
    );
  }
  return build(parts);
};

/** The earth slab under an n×n farm, with rocks embedded in its sides. */
export const buildSlab = (n) => {
  const w = n + 0.12;
  const top = -0.17;
  const depth = 0.62;
  const parts = [
    part(new THREE.BoxGeometry(w, depth, w), byNormal(RAMP.brown[6], RAMP.brown[1], RAMP.brown[6]), {
      pos: [0, top - depth / 2, 0],
    }),
    // Darker band near the bottom for a bit of depth.
    part(new THREE.BoxGeometry(w + 0.01, 0.12, w + 0.01), byNormal(RAMP.brown[3], RAMP.brown[2]), {
      pos: [0, top - depth + 0.06, 0],
    }),
  ];
  const rnd = mulberry32(1234 + n);
  const half = w / 2;
  for (let side = 0; side < 4; side++) {
    let t = -half + 0.25 + rnd() * 0.3;
    while (t < half - 0.2) {
      const r = 0.08 + rnd() * 0.09;
      const y = top - depth + 0.12 + rnd() * 0.14;
      const out = half - r * 0.25;
      const pos =
        side === 0 ? [t, y, out] : side === 1 ? [out, y, -t] : side === 2 ? [-t, y, -out] : [-out, y, t];
      parts.push(
        part(new THREE.DodecahedronGeometry(r, 0), [RAMP.grey[0], RAMP.grey[1], RAMP.grey[2]], {
          pos,
          rot: [rnd() * 3, rnd() * 3, rnd() * 3],
          scale: [1.2, 0.75, 1],
          seed: Math.floor(rnd() * 1e6),
        }),
      );
      t += 0.5 + rnd() * 0.5;
    }
  }
  return build(parts);
};

// ------------------------------------------------------------------ plants

// Dense golden stalks, like the game's wheat-looking grass.
const grass = () => {
  const rnd = mulberry32(7);
  const parts = [];
  const grid = 10;
  for (let i = 0; i < grid; i++) {
    for (let j = 0; j < grid; j++) {
      const x = -0.42 + ((i + 0.2 + rnd() * 0.6) / grid) * 0.84;
      const z = -0.42 + ((j + 0.2 + rnd() * 0.6) / grid) * 0.84;
      const h = 0.4 + rnd() * 0.26;
      const tilt = [(rnd() - 0.5) * 0.25, rnd() * 6, (rnd() - 0.5) * 0.25];
      const blade = part(new THREE.ConeGeometry(0.02, h, 3, 1, true), [RAMP.tan[2], RAMP.tan[3], RAMP.tan[4]], {
        pos: [0, h / 2, 0],
        seed: i * 31 + j,
      });
      const head = part(new THREE.ConeGeometry(0.028, 0.15, 3, 1), [RAMP.orange[3], RAMP.orange[4], RAMP.tan[5]], {
        pos: [0, h + 0.03, 0],
        seed: i * 17 + j,
      });
      parts.push(transform(blade, { pos: [x, 0, z], rot: tilt }), transform(head, { pos: [x, 0, z], rot: tilt }));
    }
  }
  // A few low green tufts at the base.
  for (let k = 0; k < 6; k++) {
    parts.push(
      part(new THREE.ConeGeometry(0.06, 0.12, 3), [RAMP.olive[2], RAMP.olive[3]], {
        pos: [(rnd() - 0.5) * 0.8, 0.06, (rnd() - 0.5) * 0.8],
        rot: [0, rnd() * 6, 0],
        seed: k,
      }),
    );
  }
  return build(parts);
};

const bush = () => {
  const blobs = [
    [0, 0.17, 0, 0.17],
    [0.13, 0.11, 0.06, 0.12],
    [-0.12, 0.1, 0.08, 0.12],
    [0.02, 0.1, -0.13, 0.12],
    [-0.04, 0.27, 0.02, 0.1],
  ];
  return build(
    blobs.map(([x, y, z, r], k) =>
      part(new THREE.IcosahedronGeometry(r, 0), [RAMP.olive[1], RAMP.olive[2], RAMP.olive[3]], {
        pos: [x, y, z],
        rot: [k, k * 2, 0],
        seed: k + 3,
      }),
    ),
  );
};

const tree = () => {
  const parts = [
    part(new THREE.CylinderGeometry(0.05, 0.085, 0.55, 5), [RAMP.brown[3], RAMP.brown[4]], { pos: [0, 0.275, 0] }),
    part(new THREE.CylinderGeometry(0.02, 0.035, 0.25, 4), RAMP.brown[3], {
      pos: [0.09, 0.45, 0],
      rot: [0, 0, -0.8],
    }),
  ];
  const blobs = [
    [0, 0.78, 0, 0.27],
    [0.17, 0.66, 0.08, 0.19],
    [-0.16, 0.68, -0.06, 0.2],
    [0.02, 0.66, 0.18, 0.18],
    [-0.02, 0.98, -0.02, 0.16],
  ];
  blobs.forEach(([x, y, z, r], k) =>
    parts.push(
      part(new THREE.IcosahedronGeometry(r, 0), [RAMP.olive[0], RAMP.olive[1], RAMP.olive[2]], {
        pos: [x, y, z],
        rot: [k * 0.7, k * 1.3, 0],
        seed: k + 11,
      }),
    ),
  );
  return build(parts);
};

const carrotPlant = (seed) => {
  const rnd = mulberry32(seed);
  const parts = [
    part(new THREE.ConeGeometry(0.075, 0.26, 5), [RAMP.orange[5], RAMP.orange[6], RAMP.accent[4]], {
      pos: [0, -0.02, 0],
      rot: [Math.PI, 0, 0],
      seed,
    }),
  ];
  const leaves = 4;
  for (let k = 0; k < leaves; k++) {
    const a = (k / leaves) * Math.PI * 2 + rnd();
    parts.push(
      part(new THREE.ConeGeometry(0.045, 0.24, 3), [RAMP.olive[1], RAMP.olive[2], RAMP.olive[3]], {
        pos: [Math.cos(a) * 0.05, 0.22, Math.sin(a) * 0.05],
        rot: [Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55],
        scale: [1, 1, 0.35],
        seed: seed + k,
      }),
    );
  }
  return parts;
};

const carrot = () => {
  const spots = [
    [-0.2, -0.2],
    [0.2, -0.18],
    [-0.18, 0.2],
    [0.21, 0.19],
  ];
  return build(
    spots.map(([x, z], k) => carrotPlant(k * 13 + 5).map((p) => transform(p, { pos: [x, 0, z], rot: [0, k * 1.7, 0] }))),
  );
};

/** Ribbed, squashed sphere. `ribs` lobes around, height relative to radius. */
const pumpkinBody = (radius, height, ribs, colors, seed = 1, ribDepth = 0.07) => {
  const g = new THREE.SphereGeometry(1, ribs * 2, 7);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const theta = Math.atan2(z, x);
    const k = 1 + ribDepth * Math.cos(ribs * theta);
    // Flatter top with a dimple around the stem.
    const yy = y > 0.85 ? 0.78 + (y - 0.85) * 0.3 : y;
    p.setXYZ(i, x * k * radius, (yy + 1) * 0.5 * height, z * k * radius);
  }
  return part(g, colors, { seed });
};

const PUMPKIN_COLORS = [RAMP.orange[3], RAMP.orange[4], RAMP.orange[5], RAMP.orange[6]];

const pumpkin = () =>
  build([
    pumpkinBody(0.32, 0.46, 8, PUMPKIN_COLORS),
    part(new THREE.CylinderGeometry(0.025, 0.04, 0.12, 5), RAMP.olive[4], {
      pos: [0, 0.44, 0],
      rot: [0.2, 0, 0.15],
    }),
    part(new THREE.ConeGeometry(0.06, 0.14, 3), RAMP.olive[3], {
      pos: [0.06, 0.43, 0.02],
      rot: [0, 0, -1.3],
      scale: [1, 1, 0.3],
    }),
  ]);

/** Unit giant pumpkin (radius 0.5, height 1); the renderer scales it to n×n tiles. */
const pumpkinBig = () =>
  build([
    pumpkinBody(0.5, 1, 16, PUMPKIN_COLORS, 3, 0.035),
    part(new THREE.CylinderGeometry(0.02, 0.03, 0.08, 5), RAMP.olive[4], { pos: [0, 0.98, 0] }),
  ]);

const deadPumpkin = () => {
  const dull = [RAMP.brown[2], RAMP.brown[3], RAMP.brown[4]];
  return build([
    transform(pumpkinBody(0.3, 0.3, 8, dull, 9), { rot: [0.25, 0, 0.1] }),
    part(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 8), RAMP.brown[6], { pos: [0.02, 0.27, 0.04], rot: [0.25, 0, 0.1] }),
    part(new THREE.TetrahedronGeometry(0.07), dull, { pos: [0.3, 0.03, 0.18], rot: [1, 2, 0], seed: 4 }),
    part(new THREE.TetrahedronGeometry(0.05), dull, { pos: [-0.28, 0.02, 0.22], rot: [2, 1, 0], seed: 5 }),
    part(new THREE.CylinderGeometry(0.02, 0.03, 0.12, 5), RAMP.olive[5], {
      pos: [-0.2, 0.03, -0.25],
      rot: [0, 0, 1.4],
    }),
  ]);
};

/** Cactus modelled 1 unit tall; the renderer scales it by size. */
const cactus = (brown = false) => {
  const col = brown ? [RAMP.brown[3], RAMP.brown[4], RAMP.brown[5]] : [RAMP.olive[3], RAMP.olive[4], RAMP.olive[5]];
  const flower = RAMP.accent[2];
  const seg = 7;
  return build([
    part(new THREE.CylinderGeometry(0.12, 0.14, 0.82, seg), col, { pos: [0, 0.41, 0], seed: 1 }),
    part(new THREE.SphereGeometry(0.12, seg, 3, 0, Math.PI * 2, 0, Math.PI / 2), col, { pos: [0, 0.82, 0], seed: 2 }),
    // right arm
    part(new THREE.CylinderGeometry(0.06, 0.06, 0.18, seg), col, { pos: [0.18, 0.42, 0], rot: [0, 0, Math.PI / 2], seed: 3 }),
    part(new THREE.CylinderGeometry(0.065, 0.065, 0.24, seg), col, { pos: [0.26, 0.54, 0], seed: 4 }),
    part(new THREE.SphereGeometry(0.065, seg, 3, 0, Math.PI * 2, 0, Math.PI / 2), col, { pos: [0.26, 0.66, 0], seed: 5 }),
    // left arm
    part(new THREE.CylinderGeometry(0.05, 0.05, 0.16, seg), col, { pos: [-0.17, 0.3, 0.02], rot: [0, 0, Math.PI / 2], seed: 6 }),
    part(new THREE.CylinderGeometry(0.055, 0.055, 0.18, seg), col, { pos: [-0.24, 0.38, 0.02], seed: 7 }),
    part(new THREE.SphereGeometry(0.055, seg, 3, 0, Math.PI * 2, 0, Math.PI / 2), col, { pos: [-0.24, 0.47, 0.02], seed: 8 }),
    // flowers
    part(new THREE.IcosahedronGeometry(0.05, 0), [flower, RAMP.accent[1]], { pos: [0, 0.94, 0], seed: 9 }),
    part(new THREE.IcosahedronGeometry(0.035, 0), [flower, RAMP.accent[3]], { pos: [0.26, 0.71, 0], seed: 10 }),
  ]);
};

const sunflower = (petals) => {
  const head = [
    part(new THREE.CylinderGeometry(0.12, 0.13, 0.06, 10), RAMP.brown[5], { seed: 1 }),
    part(new THREE.CylinderGeometry(0.07, 0.12, 0.035, 10), RAMP.brown[6], { pos: [0, 0.045, 0] }),
  ];
  for (let k = 0; k < petals; k++) {
    const a = (k / petals) * Math.PI * 2;
    head.push(
      part(new THREE.ConeGeometry(0.06, 0.2, 3), [RAMP.orange[0], RAMP.orange[1], RAMP.orange[2]], {
        pos: [Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2],
        rot: [0, -a, -Math.PI / 2],
        scale: [1, 1, 0.35],
        seed: k,
      }),
    );
  }
  // Tilt the head towards the south (+z), like the game's flowers facing the camera.
  head.forEach((h) => transform(h, { pos: [0, 1.0, 0.06], rot: [1.05, 0, 0] }));
  return build([
    ...head,
    part(new THREE.CylinderGeometry(0.022, 0.03, 1.0, 5), RAMP.olive[5], { pos: [0, 0.5, 0] }),
    part(new THREE.OctahedronGeometry(0.13), [RAMP.olive[3], RAMP.olive[4]], {
      pos: [0.11, 0.38, 0],
      rot: [0, 0, 0.5],
      scale: [1, 0.12, 0.45],
    }),
    part(new THREE.OctahedronGeometry(0.12), [RAMP.olive[3], RAMP.olive[4]], {
      pos: [-0.1, 0.55, 0.02],
      rot: [0, 0.2, -0.5],
      scale: [1, 0.12, 0.45],
    }),
  ]);
};

// ------------------------------------------------------------------ special entities

const apple = () =>
  build([
    part(new THREE.DodecahedronGeometry(0.18, 0), [RAMP.accent[4], RAMP.accent[3]], {
      pos: [0, 0.17, 0],
      scale: [1, 0.9, 1],
    }),
    part(new THREE.CylinderGeometry(0.015, 0.02, 0.1, 4), RAMP.brown[4], { pos: [0, 0.36, 0], rot: [0, 0, 0.3] }),
    part(new THREE.ConeGeometry(0.05, 0.13, 3), RAMP.olive[2], {
      pos: [0.06, 0.37, 0],
      rot: [0, 0, -1.1],
      scale: [1, 1, 0.3],
    }),
  ]);

const dinosaur = () => {
  const white = [RAMP.white, RAMP.grey[0]];
  return build([
    part(new THREE.BoxGeometry(0.34, 0.3, 0.44), white, { pos: [0, 0.33, -0.02], seed: 1 }),
    part(new THREE.BoxGeometry(0.26, 0.22, 0.16), white, { pos: [0, 0.48, -0.24], rot: [0.6, 0, 0], seed: 2 }),
    part(new THREE.BoxGeometry(0.2, 0.24, 0.2), white, { pos: [0, 0.6, 0.2], seed: 3 }),
    part(new THREE.BoxGeometry(0.05, 0.08, 0.14), RAMP.accent[4], { pos: [0, 0.76, 0.2] }),
    part(new THREE.BoxGeometry(0.06, 0.08, 0.04), RAMP.accent[4], { pos: [0, 0.5, 0.31] }),
    part(new THREE.BoxGeometry(0.08, 0.05, 0.1), RAMP.orange[3], { pos: [0, 0.6, 0.34] }),
    part(new THREE.BoxGeometry(0.04, 0.17, 0.04), RAMP.orange[5], { pos: [-0.08, 0.09, 0] }),
    part(new THREE.BoxGeometry(0.04, 0.17, 0.04), RAMP.orange[5], { pos: [0.08, 0.09, 0] }),
    part(new THREE.BoxGeometry(0.04, 0.2, 0.28), RAMP.grey[1], { pos: [0.18, 0.34, -0.02] }),
    part(new THREE.BoxGeometry(0.04, 0.2, 0.28), RAMP.grey[1], { pos: [-0.18, 0.34, -0.02] }),
    part(new THREE.BoxGeometry(0.03, 0.04, 0.02), RAMP.grey[6], { pos: [0.1, 0.64, 0.3] }),
    part(new THREE.BoxGeometry(0.03, 0.04, 0.02), RAMP.grey[6], { pos: [-0.1, 0.64, 0.3] }),
  ]);
};

const hedge = () => {
  const rnd = mulberry32(21);
  const leaf = [RAMP.olive[4], RAMP.olive[5], RAMP.olive[6]];
  const parts = [part(new THREE.BoxGeometry(0.98, 0.9, 0.98), leaf, { pos: [0, 0.45, 0], seed: 2 })];
  for (let k = 0; k < 9; k++) {
    parts.push(
      part(new THREE.IcosahedronGeometry(0.13 + rnd() * 0.07, 0), [RAMP.olive[3], RAMP.olive[4], RAMP.olive[5]], {
        pos: [(rnd() - 0.5) * 0.8, 0.86 + rnd() * 0.06, (rnd() - 0.5) * 0.8],
        rot: [rnd() * 3, rnd() * 3, 0],
        seed: k + 30,
      }),
    );
  }
  return build(parts);
};

const treasure = () => {
  const gold = [RAMP.orange[0], RAMP.orange[1]];
  return build([
    part(new THREE.BoxGeometry(0.52, 0.28, 0.36), [RAMP.brown[3], RAMP.brown[4]], { pos: [0, 0.14, 0] }),
    part(new THREE.CylinderGeometry(0.18, 0.18, 0.52, 7, 1, false, 0, Math.PI), [RAMP.brown[2], RAMP.brown[3]], {
      pos: [0, 0.28, 0],
      rot: [0, 0, Math.PI / 2],
      scale: [1, 1, 1],
    }),
    part(new THREE.BoxGeometry(0.06, 0.3, 0.38), gold, { pos: [-0.17, 0.15, 0] }),
    part(new THREE.BoxGeometry(0.06, 0.3, 0.38), gold, { pos: [0.17, 0.15, 0] }),
    part(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 7, 1, false, 0, Math.PI), gold, {
      pos: [-0.17, 0.28, 0],
      rot: [0, 0, Math.PI / 2],
    }),
    part(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 7, 1, false, 0, Math.PI), gold, {
      pos: [0.17, 0.28, 0],
      rot: [0, 0, Math.PI / 2],
    }),
    part(new THREE.BoxGeometry(0.08, 0.1, 0.04), RAMP.orange[3], { pos: [0, 0.27, 0.19] }),
  ]);
};

// ------------------------------------------------------------------ drone

const droneBody = () => {
  const parts = [
    part(new THREE.CylinderGeometry(0.2, 0.24, 0.16, 8), [RAMP.orange[1], RAMP.orange[2]], { pos: [0, 0.08, 0] }),
    part(new THREE.CylinderGeometry(0.12, 0.2, 0.08, 8), RAMP.orange[0], { pos: [0, 0.2, 0] }),
    part(new THREE.CylinderGeometry(0.05, 0.12, 0.05, 8), RAMP.orange[3], { pos: [0, 0.265, 0] }),
    part(new THREE.CylinderGeometry(0.24, 0.16, 0.06, 8), RAMP.orange[5], { pos: [0, -0.03, 0] }),
  ];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    parts.push(
      part(new THREE.BoxGeometry(0.42, 0.035, 0.05), RAMP.grey[5], {
        pos: [Math.cos(a) * 0.36, 0.1, Math.sin(a) * 0.36],
        rot: [0, -a, 0.12],
      }),
      part(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 6), RAMP.grey[4], {
        pos: [Math.cos(a) * 0.56, 0.14, Math.sin(a) * 0.56],
      }),
    );
  }
  return build(parts);
};

/** Propellers centred on each motor; the renderer spins the whole set around each motor axis. */
export const DRONE_MOTORS = [0, 1, 2, 3].map((k) => {
  const a = Math.PI / 4 + (k * Math.PI) / 2;
  return [Math.cos(a) * 0.56, 0.19, Math.sin(a) * 0.56];
});

const droneProp = () =>
  build([part(new THREE.BoxGeometry(0.34, 0.012, 0.045), RAMP.grey[6]), part(new THREE.BoxGeometry(0.045, 0.012, 0.34), RAMP.grey[6])]);

// ------------------------------------------------------------------ registry

const BUILDERS = {
  "tile:Grassland": grasslandTile,
  "tile:Soil": soilTile,
  Grass: grass,
  Bush: bush,
  Tree: tree,
  Carrot: carrot,
  Pumpkin: pumpkin,
  PumpkinBig: pumpkinBig,
  Dead_Pumpkin: deadPumpkin,
  Cactus: () => cactus(false),
  Cactus_brown: () => cactus(true),
  Apple: apple,
  Dinosaur: dinosaur,
  Hedge: hedge,
  Treasure: treasure,
  "drone:body": droneBody,
  "drone:prop": droneProp,
};
for (let p = 7; p <= 15; p++) BUILDERS[`Sunflower:${p}`] = () => sunflower(p);

const cache = new Map();

/** Shared geometry by model key (built lazily, cached for the session). */
export const getGeometry = (key) => {
  let g = cache.get(key);
  if (!g) {
    const b = BUILDERS[key];
    if (!b) throw new Error(`Unknown model ${key}`);
    g = b();
    cache.set(key, g);
  }
  return g;
};

export const MODEL_KEYS = Object.keys(BUILDERS);

export const createMaterial = () =>
  new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.88, metalness: 0 });

/**
 * Model key + transform for a cell (shared by the 3D scene and anything else that needs it).
 * `sorted` only matters for cacti (unsorted grown cacti turn brown in the game).
 */
export const modelForCell = (cell, index, { cactusSorted = true } = {}) => {
  const rnd = mulberry32(index * 7919 + 17);
  const yawFree = rnd() * Math.PI * 2;
  switch (cell.entity) {
    case null:
    case undefined:
      return null;
    case "Cactus": {
      const s = cactusScale(cell.params?.cactusSize ?? 9);
      return { key: cactusSorted ? "Cactus" : "Cactus_brown", scale: [s, s, s], yaw: yawFree };
    }
    case "Sunflower":
      return { key: `Sunflower:${cell.params?.petals ?? 15}`, scale: [1, 1, 1], yaw: (rnd() - 0.5) * 0.6 };
    case "Hedge":
    case "Treasure":
    case "Dinosaur":
      return { key: cell.entity, scale: [1, 1, 1], yaw: 0 };
    case "Grass":
      return { key: "Grass", scale: [1, 0.9 + rnd() * 0.2, 1], yaw: Math.floor(rnd() * 4) * (Math.PI / 2) };
    default:
      return { key: cell.entity, scale: [1, 1, 1], yaw: yawFree };
  }
};
