import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { ConfirmDialog, ExportDialog, HelpDialog, ImportDialog } from "./components/Dialogs.jsx";
import Inspector from "./components/Inspector.jsx";
import Palette from "./components/Palette.jsx";
import TopBar from "./components/TopBar.jsx";
import Icon from "./components/UiIcons.jsx";
import { createEditor } from "./core/editor.js";
import { layoutFromHash, loadInitialState, scheduleSave, shareUrl } from "./core/persist.js";
import { createPlayer } from "./core/routine.js";
import { handleShortcut } from "./core/shortcuts.js";
import { TOOL_BY_ID } from "./core/tools.js";
import { EditorContext, useEditorState } from "./core/useEditor.js";
import FarmCanvas2D from "./render2d/FarmCanvas2D.jsx";
import "./App.css";

const Farm3D = lazy(() => import("./render3d/Farm3D.jsx"));

const bootEditor = () => {
  const { state, layout, source } = loadInitialState();
  const editor = createEditor(state);
  if (layout) editor.load(layout, { resetHistory: true });
  return { editor, source };
};

function ViewControls({ apiRef }) {
  return (
    <div className="view-controls">
      <button type="button" className="square-btn small" onClick={() => apiRef.current?.zoomIn()} title="Zoom in (+)" aria-label="Zoom in">
        <Icon name="plus" size={16} />
      </button>
      <button type="button" className="square-btn small" onClick={() => apiRef.current?.zoomOut()} title="Zoom out (−)" aria-label="Zoom out">
        <Icon name="minus" size={16} />
      </button>
      <button type="button" className="square-btn small" onClick={() => apiRef.current?.fit()} title="Fit (0)" aria-label="Fit farm to view">
        <Icon name="fit" size={16} />
      </button>
    </div>
  );
}

function StatusHint() {
  const tool = useEditorState((s) => s.tool);
  const view = useEditorState((s) => s.view);
  return (
    <div className="status-hint">
      <strong>{TOOL_BY_ID[tool].label}</strong> · {TOOL_BY_ID[tool].hint} ·{" "}
      {view === "3d" ? "Right-drag to orbit, middle-drag to pan" : "Right-drag to pan"}, wheel to zoom · <kbd>?</kbd> help
    </div>
  );
}

/** Caption a playing routine can show over the farm. */
function PlaybackNote() {
  const note = useEditorState((s) => s.playback?.note);
  if (!note) return null;
  return (
    <div className="playback-note" role="status">
      {note}
    </div>
  );
}

function Workspace({ viewApi }) {
  const view = useEditorState((s) => s.view);
  return (
    <main className="workspace">
      {view === "3d" ? (
        <Suspense fallback={<div className="farm-view loading">Loading 3D view…</div>}>
          <Farm3D apiRef={viewApi} />
        </Suspense>
      ) : (
        <FarmCanvas2D apiRef={viewApi} />
      )}
      <ViewControls apiRef={viewApi} />
      <PlaybackNote />
      <StatusHint />
    </main>
  );
}

export default function App() {
  const [{ editor, source }] = useState(bootEditor);
  const viewApi = useRef(null);
  const [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState(source === "link" ? "Loaded layout from link" : "");

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // Handy for debugging and for the screenshot/video scripts.
    window.__editor = editor;
    window.__createPlayer = (routine) => createPlayer(editor, routine, { view: () => viewApi.current });
  }, [editor]);

  // A layout opened from a link is now in the editor (and autosaved): drop the hash so a reload
  // doesn't overwrite later edits with the original link.
  useEffect(() => {
    if (source === "link") history.replaceState(null, "", location.pathname + location.search);
  }, [source]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // Autosave (layout + preferences) whenever the document or settings change.
  useEffect(() => {
    let last = null;
    return editor.subscribe(() => {
      const s = editor.getState();
      const key = [s.cells, s.size, s.view, s.tool, s.brushId, s.params, s.showIssues, s.showGrid];
      if (last && key.every((v, i) => v === last[i])) return;
      last = key;
      scheduleSave(s);
    });
  }, [editor]);

  // Load layouts from links pasted into the address bar while the app is open.
  useEffect(() => {
    const onHash = () => {
      const layout = layoutFromHash();
      if (layout) {
        editor.load(layout);
        setToast("Loaded layout from link");
        history.replaceState(null, "", location.pathname + location.search);
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [editor]);

  useEffect(() => {
    const onKey = (e) => {
      if (dialog) return;
      if (handleShortcut(e, editor, { openHelp: () => setDialog("help"), viewApi })) e.preventDefault();
    };
    const onUp = () => editor.pointerUp();
    const onShift = (e) => editor.setModifiers({ shift: e.shiftKey });
    window.addEventListener("keydown", onKey);
    window.addEventListener("keydown", onShift);
    window.addEventListener("keyup", onShift);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("blur", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keydown", onShift);
      window.removeEventListener("keyup", onShift);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("blur", onUp);
    };
  }, [editor, dialog]);

  const share = async () => {
    const url = shareUrl(editor.getState());
    try {
      await navigator.clipboard.writeText(url);
      setToast("Share link copied to clipboard");
    } catch {
      window.prompt("Copy this link:", url);
    }
  };

  const close = () => setDialog(null);

  return (
    <EditorContext.Provider value={editor}>
      <div className="app">
        <TopBar
          onImport={() => setDialog("import")}
          onExport={() => setDialog("export")}
          onShare={share}
          onClear={() => setDialog("clear")}
          onHelp={() => setDialog("help")}
        />
        <div className="body">
          <Palette />
          <Workspace viewApi={viewApi} />
          <Inspector />
        </div>
        {dialog === "export" && <ExportDialog onClose={close} />}
        {dialog === "import" && <ImportDialog onClose={close} onImported={() => setToast("Layout imported")} />}
        {dialog === "help" && <HelpDialog onClose={close} />}
        {dialog === "clear" && (
          <ConfirmDialog
            title="Clear the farm?"
            message="Every tile is reset to empty grassland. You can undo this."
            confirmLabel="Clear"
            onConfirm={() => editor.clear()}
            onClose={close}
          />
        )}
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </div>
    </EditorContext.Provider>
  );
}
