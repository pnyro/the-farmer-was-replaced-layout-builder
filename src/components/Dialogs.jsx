import { useEffect, useRef, useState } from "react";
import { exportJson, exportPython, parseLayout } from "../core/io.js";
import { SHORTCUT_GROUPS } from "../core/shortcuts.js";
import { useEditor } from "../core/useEditor.js";
import Icon from "./UiIcons.jsx";

export function Modal({ title, onClose, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="square-btn small" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

const download = (text, name, type) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export function ExportDialog({ onClose }) {
  const editor = useEditor();
  const [format, setFormat] = useState("python");
  const [copied, setCopied] = useState(false);
  const { size, cells } = editor.getState();
  const text = format === "python" ? exportPython({ size, cells }) : exportJson({ size, cells });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Modal title="Export layout" onClose={onClose} wide>
      <div className="segmented" role="tablist">
        {[
          ["python", "Python (game)"],
          ["json", "JSON"],
        ].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={format === id} className={format === id ? "is-active" : ""} onClick={() => setFormat(id)}>
            {label}
          </button>
        ))}
      </div>
      <p className="muted">
        {format === "python"
          ? "Paste into a code window in the game. grid[y * grid_size + x] is the tile at (x, y); the drone scripts in the README read exactly this."
          : "Lossless editor format. Import it back here or process it with your own tools."}
      </p>
      <pre className="code-window" tabIndex={0}>
        <code>{text}</code>
      </pre>
      <div className="modal-actions">
        <button type="button" className="text-btn" onClick={() => download(text, format === "python" ? "layout.py" : "layout.json", "text/plain")}>
          <Icon name="download" size={18} />
          <span>Download</span>
        </button>
        <button type="button" className="text-btn primary" onClick={copy}>
          <Icon name={copied ? "check" : "copy"} size={18} />
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
    </Modal>
  );
}

export function ImportDialog({ onClose, onImported }) {
  const editor = useEditor();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const apply = (src) => {
    try {
      const layout = parseLayout(src);
      editor.load(layout);
      onImported?.(layout);
      onClose();
    } catch (e) {
      setError(e.message || String(e));
    }
  };
  return (
    <Modal title="Import layout" onClose={onClose} wide>
      <p className="muted">Paste the Python exported by this app (or the game script grid), or JSON. Size is read from the data. Importing can be undone.</p>
      <textarea
        className="code-window"
        value={text}
        spellCheck={false}
        placeholder={'grid_size = 3\ngrid = [\n\t{"ground": Grounds.Soil, "entity": Entities.Carrot},\n\t...\n]'}
        onChange={(e) => {
          setText(e.target.value);
          setError("");
        }}
      />
      {error && (
        <p className="issue issue-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <label className="text-btn">
          <Icon name="import" size={18} />
          <span>Open file…</span>
          <input
            type="file"
            accept=".py,.json,.txt,text/plain,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                const t = await f.text();
                setText(t);
                apply(t);
              }
            }}
          />
        </label>
        <button type="button" className="text-btn primary" onClick={() => apply(text)} disabled={!text.trim()}>
          <Icon name="check" size={18} />
          <span>Import</span>
        </button>
      </div>
    </Modal>
  );
}

export function HelpDialog({ onClose }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} wide>
      <div className="help-grid">
        {SHORTCUT_GROUPS.map((g) => (
          <section key={g.title}>
            <h3>{g.title}</h3>
            <dl>
              {g.items.map((it, k) => (
                <div key={k} className="help-row">
                  <dt>
                    {it.keys.map((key, j) => (
                      <kbd key={j}>{key}</kbd>
                    ))}
                  </dt>
                  <dd>{it.label}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="muted">
        Both views share every tool and shortcut. Coordinates match the game: (0,0) is the south-west corner, x grows East,
        y grows North.
      </p>
    </Modal>
  );
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p>{message}</p>
      <div className="modal-actions">
        <button type="button" className="text-btn" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="text-btn danger"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
