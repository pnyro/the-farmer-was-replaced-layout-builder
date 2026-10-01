// Imperative instanced layers for the 3D view: tiles, entities, giant pumpkins and overlays.
// Updating instance matrices directly keeps a 32×32 farm smooth while painting.

import * as THREE from "three";
import { ISSUE_TYPES } from "../core/validation.js";
import { OVERLAY } from "../core/overlay.js";
import { createMaterial, getGeometry, modelForCell, MODEL_KEYS } from "./models.js";
import { bigPumpkinScale } from "./scale.js";

const CAP = 32 * 32;
const BAR_CAP = 8192;
const _o = new THREE.Object3D();
const _c = new THREE.Color();

const ENTITY_KEYS = MODEL_KEYS.filter((k) => !k.startsWith("tile:") && !k.startsWith("drone:") && k !== "PumpkinBig");

/** World position of a tile centre. Tile (0,0) is south-west; north is −z. */
export const tileToWorld = (x, y, n) => [x - (n - 1) / 2, 0, (n - 1) / 2 - y];
export const worldToTile = (px, pz, n) => [Math.floor(px + n / 2), Math.floor(n / 2 - pz)];

const makeInstanced = (geo, mat, cap, { shadows = true } = {}) => {
  const m = new THREE.InstancedMesh(geo, mat, cap);
  m.count = 0;
  m.frustumCulled = false;
  m.castShadow = shadows;
  m.receiveShadow = shadows;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.raycast = () => {};
  return m;
};

export class FarmLayers {
  constructor(group) {
    this.group = group;
    this.material = createMaterial();
    this.tiles = {
      Grassland: makeInstanced(getGeometry("tile:Grassland"), this.material, CAP),
      Soil: makeInstanced(getGeometry("tile:Soil"), this.material, CAP),
    };
    this.tiles.Grassland.castShadow = false;
    this.tiles.Soil.castShadow = false;
    this.entities = {};
    for (const k of ENTITY_KEYS) this.entities[k] = makeInstanced(getGeometry(k), this.material, CAP);
    this.big = makeInstanced(getGeometry("PumpkinBig"), this.material, 256);

    // Overlays (unlit so they read the same as the 2D colours).
    const quadGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.quadMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.quads = makeInstanced(quadGeo, this.quadMat, CAP * 2, { shadows: false });
    this.quads.renderOrder = 2;
    this.barMat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.bars = makeInstanced(new THREE.BoxGeometry(1, 1, 1), this.barMat, BAR_CAP, { shadows: false });
    this.hoverMat = new THREE.MeshBasicMaterial({
      color: OVERLAY.hover,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      toneMapped: false,
    });
    this.hover = new THREE.Mesh(new THREE.BoxGeometry(1, 1.3, 1).translate(0, 0.65, 0), this.hoverMat);
    this.hover.visible = false;
    this.hover.raycast = () => {};

    for (const m of [
      ...Object.values(this.tiles),
      ...Object.values(this.entities),
      this.big,
      this.quads,
      this.bars,
      this.hover,
    ])
      group.add(m);
    this.last = {};
  }

  /** Rebuild tiles + entities when the displayed cells change. */
  updateContent(cells, n, analysis) {
    const counts = { Grassland: 0, Soil: 0 };
    for (let i = 0; i < cells.length; i++) {
      const x = i % n;
      const y = (i - x) / n;
      const [wx, , wz] = tileToWorld(x, y, n);
      _o.position.set(wx, 0, wz);
      _o.rotation.set(0, 0, 0);
      _o.scale.set(1, 1, 1);
      _o.updateMatrix();
      const g = this.tiles[cells[i].ground] ? cells[i].ground : "Grassland";
      this.tiles[g].setMatrixAt(counts[g]++, _o.matrix);
    }
    for (const g of Object.keys(this.tiles)) {
      this.tiles[g].count = counts[g];
      this.tiles[g].instanceMatrix.needsUpdate = true;
    }

    const ecount = {};
    for (const k of ENTITY_KEYS) ecount[k] = 0;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (!c.entity) continue;
      if (analysis.mergeOf[i] >= 0) continue; // drawn as a giant pumpkin
      const model = modelForCell(c, i, { cactusSorted: analysis.cactusSorted[i] === 1 });
      const mesh = model && this.entities[model.key];
      if (!mesh) continue;
      const x = i % n;
      const y = (i - x) / n;
      const [wx, , wz] = tileToWorld(x, y, n);
      _o.position.set(wx, 0, wz);
      _o.rotation.set(0, model.yaw, 0);
      _o.scale.set(...model.scale);
      _o.updateMatrix();
      mesh.setMatrixAt(ecount[model.key]++, _o.matrix);
    }
    for (const k of ENTITY_KEYS) {
      this.entities[k].count = ecount[k];
      this.entities[k].instanceMatrix.needsUpdate = true;
    }

    let b = 0;
    for (const m of analysis.merges) {
      const [wx, , wz] = tileToWorld(m.x + (m.n - 1) / 2, m.y + (m.n - 1) / 2, n);
      _o.position.set(wx, 0, wz);
      _o.rotation.set(0, 0, 0);
      _o.scale.set(...bigPumpkinScale(m.n));
      _o.updateMatrix();
      this.big.setMatrixAt(b++, _o.matrix);
    }
    this.big.count = b;
    this.big.instanceMatrix.needsUpdate = true;
  }

  /** Overlays: shape preview, hover region, issues, merge outlines, hover box. */
  updateOverlays(st) {
    const n = st.size;
    const analysis = st.preview?.analysis ?? st.analysis;
    let q = 0;
    const quad = (i, color) => {
      const x = i % n;
      const y = (i - x) / n;
      const [wx, , wz] = tileToWorld(x, y, n);
      _o.position.set(wx, 0.02, wz);
      _o.rotation.set(0, 0, 0);
      _o.scale.set(1, 1, 1);
      _o.updateMatrix();
      this.quads.setMatrixAt(q, _o.matrix);
      this.quads.setColorAt(q, _c.set(color));
      q++;
    };
    if (st.preview?.indices) for (const i of st.preview.indices) quad(i, OVERLAY.preview);
    else if (st.hoverRegion && st.hoverRegion.size > 1) for (const i of st.hoverRegion) quad(i, OVERLAY.hover);
    if (st.showIssues) for (const is of analysis.issues) if (is.type === "wrongGround") quad(is.index, OVERLAY.error);
    this.quads.count = q;
    this.quads.instanceMatrix.needsUpdate = true;
    if (this.quads.instanceColor) this.quads.instanceColor.needsUpdate = true;

    let b = 0;
    const bar = (cx, cz, sx, sz, color, y = 0.03, h = 0.04) => {
      if (b >= BAR_CAP) return;
      _o.position.set(cx, y, cz);
      _o.rotation.set(0, 0, 0);
      _o.scale.set(sx, h, sz);
      _o.updateMatrix();
      this.bars.setMatrixAt(b, _o.matrix);
      this.bars.setColorAt(b, _c.set(color));
      b++;
    };
    // Rectangle outline covering tiles [x, x+w) × [y, y+h).
    const frame = (x, y, w, h, color, t = 0.06, inset = 0.03) => {
      const [x0, , z0] = tileToWorld(x - 0.5, y - 0.5, n); // south-west corner
      const xa = x0 + inset;
      const xb = x0 + w - inset;
      const za = z0 - inset;
      const zb = z0 - h + inset;
      bar((xa + xb) / 2, za - t / 2, xb - xa, t, color);
      bar((xa + xb) / 2, zb + t / 2, xb - xa, t, color);
      bar(xa + t / 2, (za + zb) / 2, t, za - zb, color);
      bar(xb - t / 2, (za + zb) / 2, t, za - zb, color);
    };
    if (st.showIssues) {
      for (const [index, list] of analysis.byIndex) {
        const x = index % n;
        const y = (index - x) / n;
        const err = list.some((l) => ISSUE_TYPES[l.type].severity === "error");
        frame(x, y, 1, 1, err ? OVERLAY.error : OVERLAY.warning, 0.07);
      }
      for (const m of analysis.merges) frame(m.x, m.y, m.n, m.n, OVERLAY.merge, 0.08, 0.06);
    }
    if (st.hover && !st.stroke) frame(st.hover[0], st.hover[1], 1, 1, OVERLAY.hover, 0.06, 0);
    this.bars.count = b;
    this.bars.instanceMatrix.needsUpdate = true;
    if (this.bars.instanceColor) this.bars.instanceColor.needsUpdate = true;

    if (st.hover && !st.stroke) {
      const [wx, , wz] = tileToWorld(st.hover[0], st.hover[1], n);
      this.hover.position.set(wx, 0, wz);
      this.hover.visible = true;
    } else this.hover.visible = false;
  }

  dispose() {
    for (const m of [...Object.values(this.tiles), ...Object.values(this.entities), this.big]) {
      this.group.remove(m);
      m.dispose();
    }
    for (const m of [this.quads, this.bars, this.hover]) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    this.material.dispose();
    this.quadMat.dispose();
    this.barMat.dispose();
    this.hoverMat.dispose();
  }
}
