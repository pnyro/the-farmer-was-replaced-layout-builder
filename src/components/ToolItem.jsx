import "./ToolItem.css";

function ToolItem({ toolName, label, shortcut, icon, color, isSelected, onSelect }) {
  return (
    <button
      className={`tool-item ${isSelected ? "selected" : ""} tool-${toolName}`}
      onClick={onSelect}
      title={`${label} (${shortcut})`}
    >
      {icon ? (
        <img src={icon} alt={label} className="tool-icon" />
      ) : color ? (
        <div className="tool-color-swatch" style={{ background: color }} />
      ) : (
        <div className="tool-text">{label}</div>
      )}
      <div className="tool-info">
        <div className="tool-shortcut">{shortcut}</div>
      </div>
    </button>
  );
}

export default ToolItem;
