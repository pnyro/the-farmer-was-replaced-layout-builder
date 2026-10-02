// Generated images (see scripts/render-icons.mjs). Icons: palette; sprites: 2D map.
const iconModules = import.meta.glob("./icons/*.webp", { eager: true, import: "default" });
const spriteModules = import.meta.glob("./sprites/*.webp", { eager: true, import: "default" });

const byName = (mods) =>
  Object.fromEntries(Object.entries(mods).map(([path, url]) => [path.replace(/^.*\/(.*)\.webp$/, "$1"), url]));

export const ICON_URLS = byName(iconModules);
export const SPRITE_URLS = byName(spriteModules);

const images = new Map();

/**
 * Load (once) and return an HTMLImageElement, or null while it isn't decoded yet.
 * `onReady` is called once the image becomes drawable.
 */
export const getImage = (url, onReady) => {
  let entry = images.get(url);
  if (!entry) {
    const img = new Image();
    entry = { img, ready: false, waiters: new Set() };
    images.set(url, entry);
    img.src = url;
    const done = () => {
      entry.ready = img.naturalWidth > 0;
      entry.waiters.forEach((fn) => fn());
      entry.waiters.clear();
    };
    img.decode().then(done, done);
  }
  if (entry.ready) return entry.img;
  if (onReady) entry.waiters.add(onReady);
  return null;
};

/** Sprite key for a cell, matching the 3D model choice. */
export const spriteKeyForCell = (cell, cactusSorted = true) => {
  switch (cell.entity) {
    case "Cactus":
      return cactusSorted ? "Cactus" : "Cactus_brown";
    case "Sunflower":
      return `Sunflower_${cell.params?.petals ?? 15}`;
    default:
      return cell.entity;
  }
};
