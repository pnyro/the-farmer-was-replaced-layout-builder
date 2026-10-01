import { ICON_URLS } from "../assets/index.js";
import { ENTITIES, ENTITY_BY_NAME, GROUNDS, PARAMS } from "../core/entities.js";
import { TOOLS } from "../core/tools.js";
import { useEditor, useEditorState } from "../core/useEditor.js";
import Icon from "./UiIcons.jsx";

const TOOL_ICON = { pencil: "pencil", line: "line", rect: "rect", fill: "fill", picker: "picker" };

function BrushButton({ id, label, icon, shortcut, title, active, onSelect }) {
  return (
    <button
      type="button"
      className={`brush ${active ? "is-active" : ""}`}
      onClick={() => onSelect(id)}
      title={`${title}${shortcut ? ` (${shortcut.toUpperCase()})` : ""}`}
      aria-pressed={active}
    >
      <span className="brush-icon">{icon}</span>
      <span className="brush-label">{label}</span>
      {shortcut && <kbd className="brush-key">{shortcut.toUpperCase()}</kbd>}
    </button>
  );
}

export default function Palette() {
  const editor = useEditor();
  const tool = useEditorState((s) => s.tool);
  const brushId = useEditorState((s) => s.brushId);
  const params = useEditorState((s) => s.params);
  const select = (id) => editor.setBrush(id);

  const entityName = brushId.startsWith("entity:") ? brushId.slice(7) : null;
  const paramKey = entityName ? ENTITY_BY_NAME[entityName]?.param : null;
  const param = paramKey ? PARAMS[paramKey] : null;

  const entityButton = (e) => (
    <BrushButton
      key={e.name}
      id={`entity:${e.name}`}
      label={e.label}
      title={`${e.label}: ${e.description}`}
      shortcut={e.shortcut}
      icon={<img src={ICON_URLS[e.name]} alt="" draggable={false} />}
      active={brushId === `entity:${e.name}`}
      onSelect={select}
    />
  );

  return (
    <aside className="panel palette" aria-label="Tools and brushes">
      <section>
        <h2 className="panel-title">Tools</h2>
        <div className="tool-row" role="toolbar" aria-label="Tools">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`square-btn ${tool === t.id ? "is-active" : ""}`}
              onClick={() => editor.setTool(t.id)}
              title={`${t.label} (${t.shortcut.toUpperCase()}): ${t.hint}`}
              aria-label={t.label}
              aria-pressed={tool === t.id}
            >
              <Icon name={TOOL_ICON[t.id]} />
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="panel-title">Ground</h2>
        <div className="brush-grid">
          {GROUNDS.map((g) => (
            <BrushButton
              key={g.name}
              id={`ground:${g.name}`}
              label={g.label}
              title={`${g.label}: ${g.description}`}
              shortcut={g.shortcut}
              icon={<img src={ICON_URLS[g.name]} alt="" draggable={false} />}
              active={brushId === `ground:${g.name}`}
              onSelect={select}
            />
          ))}
          <BrushButton
            id="erase"
            label="Eraser"
            title="Eraser: reset tiles to empty grassland"
            shortcut="e"
            icon={
              <span className="brush-svg">
                <Icon name="erase" size={26} />
              </span>
            }
            active={brushId === "erase"}
            onSelect={select}
          />
        </div>
      </section>

      <section>
        <h2 className="panel-title">Plants</h2>
        <div className="brush-grid">{ENTITIES.filter((e) => e.category === "plant").map(entityButton)}</div>
        {param && (
          <label className="param-control">
            <span>
              {param.label} <strong>{params[paramKey]}</strong>
            </span>
            <input
              type="range"
              min={param.min}
              max={param.max}
              step={1}
              value={params[paramKey]}
              onChange={(e) => editor.setParam(paramKey, e.target.value)}
            />
            <small>
              {param.min}–{param.max} · <kbd>[</kbd> <kbd>]</kbd>
            </small>
          </label>
        )}
      </section>

      <section>
        <h2 className="panel-title">
          Special <span className="panel-note">spawned by the game</span>
        </h2>
        <div className="brush-grid">{ENTITIES.filter((e) => e.category === "special").map(entityButton)}</div>
      </section>
    </aside>
  );
}
