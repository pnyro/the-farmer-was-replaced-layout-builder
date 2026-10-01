// Keyboard shortcuts, shared by the key handler and the help overlay. View-independent.

import { ENTITIES, GROUNDS } from "./entities.js";
import { TOOLS } from "./tools.js";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? "⌘" : "Ctrl";

export const SHORTCUT_GROUPS = [
  {
    title: "Tools",
    items: TOOLS.map((t) => ({ keys: [t.shortcut.toUpperCase()], label: t.label })),
  },
  {
    title: "Brushes",
    items: [
      ...GROUNDS.map((g) => ({ keys: [g.shortcut.toUpperCase()], label: g.label })),
      ...ENTITIES.filter((e) => e.shortcut).map((e) => ({ keys: [e.shortcut.toUpperCase()], label: e.label })),
      { keys: ["E"], label: "Eraser" },
      { keys: ["[", "]"], label: "Cactus size / petals −/+" },
    ],
  },
  {
    title: "Edit",
    items: [
      { keys: [MOD, "Z"], label: "Undo" },
      { keys: [MOD, "Shift", "Z"], label: "Redo" },
      { keys: [MOD, "Y"], label: "Redo" },
      { keys: ["Shift"], label: "Line: snap 45° · Rect: outline" },
      { keys: ["Alt", "Click"], label: "Pick tile as brush" },
      { keys: ["Esc"], label: "Cancel stroke / close dialog" },
    ],
  },
  {
    title: "View",
    items: [
      { keys: ["V"], label: "Toggle 2D / 3D" },
      { keys: ["O"], label: "Toggle warnings overlay" },
      { keys: ["H"], label: "Toggle coordinates" },
      { keys: ["+", "−"], label: "Zoom in / out" },
      { keys: ["0"], label: "Fit farm to view" },
      { keys: ["Wheel"], label: "Zoom" },
      { keys: ["Right drag"], label: "Pan (2D) / orbit (3D)" },
      { keys: ["Middle drag"], label: "Pan" },
      { keys: ["Space", "Drag"], label: "Pan (2D) / orbit (3D)" },
      { keys: ["?"], label: "This help" },
    ],
  },
];

const BRUSH_KEYS = Object.fromEntries([
  ...GROUNDS.map((g) => [g.shortcut, `ground:${g.name}`]),
  ...ENTITIES.filter((e) => e.shortcut).map((e) => [e.shortcut, `entity:${e.name}`]),
  ["e", "erase"],
]);
const TOOL_KEYS = Object.fromEntries(TOOLS.map((t) => [t.shortcut, t.id]));

/**
 * Handle a keydown. `ui` provides { openHelp, viewApi } for non-editor actions.
 * Returns true if the key was handled.
 */
export const handleShortcut = (e, editor, ui) => {
  const t = e.target;
  if (t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable))
    return false;
  const key = e.key.toLowerCase();
  const mod = e.metaKey || e.ctrlKey;
  if (mod) {
    if (key === "z" && !e.shiftKey) editor.undo();
    else if ((key === "z" && e.shiftKey) || key === "y") editor.redo();
    else return false;
    return true;
  }
  if (e.altKey) return false;
  if (key === "escape") {
    editor.cancel();
    return true;
  }
  if (e.key === "?") ui.openHelp();
  else if (TOOL_KEYS[key]) editor.setTool(TOOL_KEYS[key]);
  else if (BRUSH_KEYS[key]) editor.setBrush(BRUSH_KEYS[key]);
  else if (key === "[") editor.nudgeParam(-1);
  else if (key === "]") editor.nudgeParam(1);
  else if (key === "v") editor.toggleView();
  else if (key === "o") editor.setShowIssues(!editor.getState().showIssues);
  else if (key === "h") editor.setShowGrid(!editor.getState().showGrid);
  else if (key === "0") ui.viewApi.current?.fit();
  else if (key === "+" || key === "=") ui.viewApi.current?.zoomIn();
  else if (key === "-" || key === "_") ui.viewApi.current?.zoomOut();
  else return false;
  return true;
};
