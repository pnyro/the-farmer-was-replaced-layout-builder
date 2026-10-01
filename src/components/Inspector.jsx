import { ICON_URLS } from "../assets/index.js";
import { ENTITIES, ENTITY_BY_NAME, GROUNDS, PARAMS } from "../core/entities.js";
import { OVERLAY } from "../core/overlay.js";
import { useEditor, useEditorState } from "../core/useEditor.js";
import { ISSUE_TYPES, pumpkinYield } from "../core/validation.js";

function HoverInfo() {
  const hover = useEditorState((s) => s.hover);
  const size = useEditorState((s) => s.size);
  const cells = useEditorState((s) => s.preview?.cells ?? s.cells);
  const analysis = useEditorState((s) => s.preview?.analysis ?? s.analysis);
  if (!hover) {
    return <p className="muted">Hover a tile to inspect it.</p>;
  }
  const [x, y] = hover;
  const i = y * size + x;
  const c = cells[i];
  if (!c) return null;
  const e = c.entity ? ENTITY_BY_NAME[c.entity] : null;
  const pk = e?.param;
  const issues = analysis.byIndex.get(i) ?? [];
  const merge = analysis.mergeOf[i] >= 0 ? analysis.merges[analysis.mergeOf[i]] : null;
  return (
    <div className="hover-info">
      <div className="hover-head">
        <img src={ICON_URLS[c.entity ?? c.ground]} alt="" />
        <div>
          <strong>{e ? e.label : "Empty"}</strong>
          <span>
            on {c.ground} · ({x}, {y}) · index {i}
          </span>
        </div>
      </div>
      {pk && (
        <p>
          {PARAMS[pk].label}: <strong>{c.params?.[pk]}</strong>
          {c.entity === "Cactus" && analysis.cactusSorted[i] === 0 && <em> · not sorted (brown)</em>}
        </p>
      )}
      {merge && (
        <p>
          Part of a {merge.n}×{merge.n} giant pumpkin (yield {pumpkinYield(merge.n)}).
        </p>
      )}
      {issues.map((is) => (
        <p key={is.type} className={`issue issue-${ISSUE_TYPES[is.type].severity}`}>
          {is.message}
        </p>
      ))}
    </div>
  );
}

function Summary() {
  const cells = useEditorState((s) => s.cells);
  const counts = {};
  for (const c of cells) {
    counts[c.ground] = (counts[c.ground] ?? 0) + 1;
    if (c.entity) counts[c.entity] = (counts[c.entity] ?? 0) + 1;
  }
  const rows = [...GROUNDS, ...ENTITIES].filter((r) => counts[r.name]);
  return (
    <ul className="summary">
      {rows.map((r) => (
        <li key={r.name}>
          <img src={ICON_URLS[r.name]} alt="" />
          <span>{r.label}</span>
          <strong>{counts[r.name]}</strong>
        </li>
      ))}
    </ul>
  );
}

function Checks() {
  const editor = useEditor();
  const analysis = useEditorState((s) => s.analysis);
  const showIssues = useEditorState((s) => s.showIssues);
  const showGrid = useEditorState((s) => s.showGrid);
  const byType = {};
  for (const is of analysis.issues) byType[is.type] = (byType[is.type] ?? 0) + 1;
  let unsorted = 0;
  for (const v of analysis.cactusSorted) if (v === 0) unsorted++;
  return (
    <>
      <div className="toggles">
        <label className="toggle">
          <input type="checkbox" checked={showIssues} onChange={(e) => editor.setShowIssues(e.target.checked)} />
          <span>Warnings overlay</span>
          <kbd>O</kbd>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={showGrid} onChange={(e) => editor.setShowGrid(e.target.checked)} />
          <span>Coordinates</span>
          <kbd>H</kbd>
        </label>
      </div>
      <ul className="checks">
        {Object.entries(ISSUE_TYPES).map(([type, t]) => (
          <li key={type}>
            <span className="swatch" style={{ borderColor: t.color }} />
            <span>{t.label}</span>
            <strong className={byType[type] ? `count-${t.severity}` : ""}>{byType[type] ?? 0}</strong>
          </li>
        ))}
        <li>
          <span className="swatch dashed" style={{ borderColor: OVERLAY.merge }} />
          <span>Giant pumpkins</span>
          <strong>
            {analysis.merges.length
              ? analysis.merges.map((m) => `${m.n}×${m.n}`).join(", ")
              : 0}
          </strong>
        </li>
        <li>
          <span className="swatch" style={{ background: "#7e5421", borderColor: "#7e5421" }} />
          <span>Unsorted cacti</span>
          <strong>{unsorted}</strong>
        </li>
      </ul>
    </>
  );
}

export default function Inspector() {
  return (
    <aside className="panel inspector" aria-label="Inspector">
      <section>
        <h2 className="panel-title">Tile</h2>
        <HoverInfo />
      </section>
      <section>
        <h2 className="panel-title">Checks</h2>
        <Checks />
      </section>
      <section>
        <h2 className="panel-title">Layout</h2>
        <Summary />
      </section>
    </aside>
  );
}
