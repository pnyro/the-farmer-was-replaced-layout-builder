import { useState } from "react";
import { MAX_SIZE, MIN_SIZE, SIZE_PRESETS } from "../core/entities.js";
import { MOD } from "../core/shortcuts.js";
import { useEditor, useEditorState } from "../core/useEditor.js";
import Icon from "./UiIcons.jsx";

function SizeControl() {
  const editor = useEditor();
  const size = useEditorState((s) => s.size);
  const [draft, setDraft] = useState(null);
  const commit = () => {
    if (draft !== null && draft !== "") editor.resize(Number(draft));
    setDraft(null);
  };
  return (
    <div className="size-control" title="Farm size (set_world_size accepts 3–32). Resizing keeps the south-west corner.">
      <span className="field-label">Size</span>
      <button type="button" className="square-btn small" onClick={() => editor.resize(size - 1)} aria-label="Smaller farm" disabled={size <= MIN_SIZE}>
        <Icon name="minus" size={16} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={MIN_SIZE}
        max={MAX_SIZE}
        value={draft ?? size}
        aria-label="Farm size"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
      />
      <button type="button" className="square-btn small" onClick={() => editor.resize(size + 1)} aria-label="Bigger farm" disabled={size >= MAX_SIZE}>
        <Icon name="plus" size={16} />
      </button>
      <select
        aria-label="Size presets"
        value={SIZE_PRESETS.includes(size) ? size : ""}
        onChange={(e) => e.target.value && editor.resize(Number(e.target.value))}
      >
        <option value="">Presets</option>
        {SIZE_PRESETS.map((n) => (
          <option key={n} value={n}>
            {n}×{n}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function TopBar({ onImport, onExport, onShare, onClear, onHelp }) {
  const editor = useEditor();
  const view = useEditorState((s) => s.view);
  const canUndo = useEditorState((s) => s.past.length > 0);
  const canRedo = useEditorState((s) => s.future.length > 0);
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <div>
          <h1>Layout Builder</h1>
          <p>for The Farmer Was Replaced</p>
        </div>
      </div>

      <div className="topbar-group">
        <SizeControl />
        <div className="segmented" role="radiogroup" aria-label="View">
          {["2d", "3d"].map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              className={view === v ? "is-active" : ""}
              onClick={() => editor.setView(v)}
              title="Toggle view (V)"
            >
              {v.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="topbar-group">
        <button type="button" className="square-btn" onClick={() => editor.undo()} disabled={!canUndo} title={`Undo (${MOD}+Z)`} aria-label="Undo">
          <Icon name="undo" />
        </button>
        <button type="button" className="square-btn" onClick={() => editor.redo()} disabled={!canRedo} title={`Redo (${MOD}+Shift+Z)`} aria-label="Redo">
          <Icon name="redo" />
        </button>
        <span className="divider" />
        <button type="button" className="text-btn" onClick={onImport} title="Import Python or JSON">
          <Icon name="import" size={18} />
          <span>Import</span>
        </button>
        <button type="button" className="text-btn primary" onClick={onExport} title="Export Python or JSON">
          <Icon name="export" size={18} />
          <span>Export</span>
        </button>
        <button type="button" className="square-btn" onClick={onShare} title="Copy a shareable link" aria-label="Copy share link">
          <Icon name="link" />
        </button>
        <button type="button" className="square-btn danger" onClick={onClear} title="Clear the farm" aria-label="Clear farm">
          <Icon name="trash" />
        </button>
        <button type="button" className="square-btn" onClick={onHelp} title="Keyboard shortcuts (?)" aria-label="Help">
          <Icon name="help" />
        </button>
      </div>
    </header>
  );
}
