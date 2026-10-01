// Renders our procedural models (src/render3d/models.js) to images.
//  - icons:   tightly framed 3/4 views for the tool palette
//  - sprites: fixed-scale views (one tile wide) that the 2D canvas draws on top of tiles
// Used by scripts/render-icons.mjs (headless Chrome). Open /scripts/icons/ in `pnpm dev` to preview.

import * as THREE from "three";
import { DRONE_MOTORS, createMaterial, getGeometry } from "../../src/render3d/models.js";
import { SPRITE_FRAME, ICON_SIZE, SPRITE_ELEVATION } from "../../src/render2d/spriteFrame.js";
import { bigPumpkinScale } from "../../src/render3d/scale.js";

const ICONS = {
  Grassland: ["tile:Grassland"],
  Soil: ["tile:Soil"],
  Grass: ["Grass"],
  Bush: ["Bush"],
  Tree: ["Tree"],
  Carrot: ["Carrot"],
  Pumpkin: ["Pumpkin"],
  Cactus: ["Cactus"],
  Sunflower: ["Sunflower:15"],
  Apple: ["Apple"],
  Dinosaur: ["Dinosaur"],
  Hedge: ["Hedge"],
  Treasure: ["Treasure"],
  Dead_Pumpkin: ["Dead_Pumpkin"],
  Drone: ["drone"],
};

const SPRITES = {
  Grass: "Grass",
  Bush: "Bush",
  Tree: "Tree",
  Carrot: "Carrot",
  Pumpkin: "Pumpkin",
  PumpkinBig: "PumpkinBig",
  Cactus: "Cactus",
  Cactus_brown: "Cactus_brown",
  Apple: "Apple",
  Dinosaur: "Dinosaur",
  Hedge: "Hedge",
  Treasure: "Treasure",
  Dead_Pumpkin: "Dead_Pumpkin",
  Drone: "drone",
};
for (let p = 7; p <= 15; p++) SPRITES[`Sunflower_${p}`] = `Sunflower:${p}`;

const material = createMaterial();
// Sprites sit on a tile in the 2D view, so anything below the ground (carrot roots) is clipped.
const spriteMaterial = createMaterial();
spriteMaterial.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.0)];

const objectFor = (key, mat = material) => {
  const group = new THREE.Group();
  if (key === "drone") {
    group.add(new THREE.Mesh(getGeometry("drone:body"), mat));
    for (const [x, y, z] of DRONE_MOTORS) {
      const prop = new THREE.Mesh(getGeometry("drone:prop"), mat);
      prop.position.set(x, y, z);
      prop.rotation.y = 0.4;
      group.add(prop);
    }
    group.position.y = 0.1;
  } else {
    const mesh = new THREE.Mesh(getGeometry(key), mat);
    if (key === "PumpkinBig") {
      const [sx, sy, sz] = bigPumpkinScale(3);
      mesh.scale.set(sx / 3, sy / 3, sz / 3); // 2D draws this scaled by n
    }
    group.add(mesh);
  }
  group.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return group;
};

const makeScene = () => {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#d6e0f0", "#5a4630", 1.3));
  const sun = new THREE.DirectionalLight("#ffe0b0", 2.8);
  sun.position.set(-2, 4, 3);
  scene.add(sun);
  const fill = new THREE.DirectionalLight("#b0c4ff", 0.5);
  fill.position.set(3, 1, -2);
  scene.add(fill);
  return scene;
};

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.localClippingEnabled = true;

const SS = 2; // supersampling factor

const downscale = (src, w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  return c;
};

const renderIcon = (key) => {
  const scene = makeScene();
  const obj = objectFor(key);
  scene.add(obj);
  const box = new THREE.Box3().setFromObject(obj);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const cam = new THREE.PerspectiveCamera(24, 1, 0.01, 100);
  const dir = new THREE.Vector3(0.45, 0.62, 1).normalize();
  const dist = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(12))) * 0.98;
  cam.position.copy(sphere.center).addScaledVector(dir, dist);
  cam.lookAt(sphere.center);
  renderer.setSize(ICON_SIZE * SS, ICON_SIZE * SS, false);
  renderer.render(scene, cam);
  return downscale(renderer.domElement, ICON_SIZE, ICON_SIZE).toDataURL("image/webp", 0.92);
};

const renderSprite = (key) => {
  const scene = makeScene();
  scene.add(objectFor(key, key === "drone" ? material : spriteMaterial));
  const { left, right, top, bottom, px } = SPRITE_FRAME;
  const cam = new THREE.OrthographicCamera(left, right, top, bottom, -20, 20);
  const el = THREE.MathUtils.degToRad(SPRITE_ELEVATION);
  cam.position.set(0, Math.sin(el) * 10, Math.cos(el) * 10);
  cam.lookAt(0, 0, 0);
  const w = Math.round((right - left) * px);
  const h = Math.round((top - bottom) * px);
  renderer.setSize(w * SS, h * SS, false);
  renderer.render(scene, cam);
  return downscale(renderer.domElement, w, h).toDataURL("image/webp", 0.92);
};

window.renderAll = () => {
  const icons = {};
  const sprites = {};
  for (const [name, [key]] of Object.entries(ICONS)) icons[name] = renderIcon(key);
  for (const [name, key] of Object.entries(SPRITES)) sprites[name] = renderSprite(key);
  return { icons, sprites };
};

// Preview when opened in a browser.
const { icons, sprites } = window.renderAll();
const out = document.getElementById("out");
for (const [name, url] of [...Object.entries(icons), ...Object.entries(sprites).map(([k, v]) => [`sprite ${k}`, v])]) {
  const f = document.createElement("figure");
  f.innerHTML = `<img src="${url}"><figcaption>${name}</figcaption>`;
  out.append(f);
}
window.renderDone = true;
