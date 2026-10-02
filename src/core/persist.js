// localStorage autosave + shareable URL hash (#layout=...).

import { DEFAULT_SIZE, clampParam } from "./entities.js";
import { initialState, isValidBrushId, isValidTool } from "./editor.js";
import { decodeLayout, encodeLayout } from "./io.js";

const KEY = "tfwr-layout-builder:v1";
const HASH_KEY = "layout";

const safeGet = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
};

export const layoutFromHash = (hash = location.hash) => {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const v = params.get(HASH_KEY);
  if (!v) return null;
  try {
    return decodeLayout(v);
  } catch {
    return null;
  }
};

export const shareUrl = (layout) => {
  const url = new URL(location.href);
  url.hash = `${HASH_KEY}=${encodeLayout(layout)}`;
  return url.toString();
};

/** Initial editor state: URL hash > autosave > defaults. Also returns where it came from. */
export const loadInitialState = () => {
  const st = initialState(DEFAULT_SIZE);
  const saved = safeGet();
  if (saved?.prefs) {
    const p = saved.prefs;
    if (["2d", "3d"].includes(p.view)) st.view = p.view;
    if (isValidTool(p.tool)) st.tool = p.tool;
    if (isValidBrushId(p.brushId)) st.brushId = p.brushId;
    for (const k of Object.keys(st.params)) {
      if (Number.isFinite(p.params?.[k])) st.params[k] = clampParam(k, p.params[k]);
    }
    if (typeof p.showIssues === "boolean") st.showIssues = p.showIssues;
    if (typeof p.showGrid === "boolean") st.showGrid = p.showGrid;
  }
  const fromHash = layoutFromHash();
  let layout = fromHash;
  if (!layout && saved?.layout) {
    try {
      layout = decodeLayout(saved.layout);
    } catch {
      layout = null;
    }
  }
  return { state: st, layout, source: fromHash ? "link" : layout ? "autosave" : "new" };
};

let timer = 0;
export const scheduleSave = (state) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          layout: encodeLayout(state),
          prefs: {
            view: state.view,
            tool: state.tool,
            brushId: state.brushId,
            params: state.params,
            showIssues: state.showIssues,
            showGrid: state.showGrid,
          },
        }),
      );
    } catch {
      /* storage full or disabled */
    }
  }, 300);
};
