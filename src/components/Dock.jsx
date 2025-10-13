import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import ToolItem from "./ToolItem";
import "./Dock.css";

// Import crop icons
import carrotIcon from "../assets/carrot.svg";
import pumpkinIcon from "../assets/pumpkin.svg";
import appleIcon from "../assets/apple.svg";

function Dock({
  selectedTool,
  onToolSelect,
  gridSize,
  onGridSizeChange,
  gridData,
  mode,
  onModeChange,
  onReset,
}) {
  const [showExport, setShowExport] = useState(false);
  const [exportedData, setExportedData] = useState("");
  const [copied, setCopied] = useState(false);
  const [inputValue, setInputValue] = useState(gridSize.toString());
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Define experimental-only tools
  const experimentalOnlyTools = ["water"];

  // Ground types
  const groundTools = [
    { name: "soil", label: "Soil", shortcut: "S", icon: null },
    { name: "grass", label: "Grass", shortcut: "G", icon: null },
    { name: "water", label: "Water", shortcut: "W", icon: null },
  ];

  // Tools
  const utilityTools = [
    { name: "eraser", label: "Eraser", shortcut: "E", icon: null },
  ];

  // Crop types
  const cropTools = [
    { name: "carrot", label: "Carrot", shortcut: "C", icon: carrotIcon },
    { name: "pumpkin", label: "Pumpkin", shortcut: "P", icon: pumpkinIcon },
    { name: "apple", label: "Apple", shortcut: "A", icon: appleIcon },
    { name: "wheat", label: "Wheat", shortcut: "U", icon: null },
    { name: "hay", label: "Hay", shortcut: "H", icon: null },
    { name: "tree", label: "Tree", shortcut: "T", icon: null },
  ];

  // Filter ground tools based on mode
  const filteredGroundTools =
    mode === "vanilla"
      ? groundTools.filter((tool) => !experimentalOnlyTools.includes(tool.name))
      : groundTools;

  // Sync input value when gridSize changes externally
  useEffect(() => {
    setInputValue(gridSize.toString());
  }, [gridSize]);

  const validateAndApplySize = (value) => {
    const parsed = parseInt(value);

    // If empty or invalid, keep current gridSize
    if (!value || isNaN(parsed)) {
      setInputValue(gridSize.toString());
      return;
    }

    let newSize = parsed;

    // Clamp between 1 and 512
    newSize = Math.max(1, Math.min(512, newSize));

    // Ensure even numbers except for 1
    if (newSize > 1 && newSize % 2 !== 0) {
      newSize = newSize - 1; // Round down to nearest even number
    }

    setInputValue(newSize.toString());
    onGridSizeChange(newSize);
  };

  const handleSizeChange = (e) => {
    const newValue = e.target.value;
    const parsed = parseInt(newValue);

    // Check if this is a step change from browser buttons
    if (!isNaN(parsed) && parsed !== gridSize) {
      const diff = parsed - gridSize;

      // If the difference is exactly 1 or -1, it's likely a button click
      if (diff === 1) {
        e.preventDefault();
        incrementSize();
        return;
      } else if (diff === -1) {
        e.preventDefault();
        decrementSize();
        return;
      }
    }

    // Allow user to type freely, including empty string
    setInputValue(newValue);
  };

  const handleSizeBlur = () => {
    validateAndApplySize(inputValue);
  };

  const handleSizeKeyDown = (e) => {
    if (e.key === "Enter") {
      validateAndApplySize(inputValue);
      e.target.blur();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      incrementSize();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      decrementSize();
    }
  };

  const incrementSize = () => {
    let newSize;
    if (gridSize === 1) {
      newSize = 2; // Special case: 1 -> 2
    } else if (gridSize >= 512) {
      newSize = 512; // Already at max
    } else {
      newSize = gridSize + 2; // Increment by 2
      newSize = Math.min(512, newSize); // Cap at 512
    }
    setInputValue(newSize.toString());
    onGridSizeChange(newSize);
  };

  const decrementSize = () => {
    let newSize;
    if (gridSize === 2) {
      newSize = 1; // Special case: 2 -> 1
    } else if (gridSize <= 1) {
      newSize = 1; // Already at min
    } else {
      newSize = gridSize - 2; // Decrement by 2
      newSize = Math.max(1, newSize); // Cap at 1
    }
    setInputValue(newSize.toString());
    onGridSizeChange(newSize);
  };

  const handleExport = () => {
    const exportArray = gridData.map((cell) => {
      if (cell.crop) {
        return {
          ground: cell.ground,
          crop: cell.crop,
        };
      }
      return {
        ground: cell.ground,
      };
    });

    const exported = JSON.stringify(exportArray, null, 2);
    setExportedData(exported);
    setShowExport(true);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportedData);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleResetClick = () => {
    setShowResetConfirm(true);
  };

  const handleResetConfirm = () => {
    onReset();
    setShowResetConfirm(false);
  };

  const handleResetCancel = () => {
    setShowResetConfirm(false);
  };

  return (
    <>
      <div className="dock">
        <div className="dock-controls mode-toggle-container">
          <div className="mode-toggle">
            <span className="mode-label">Mode</span>
            <div className="mode-button-group">
              <button
                className={`mode-button ${mode === "vanilla" ? "active" : ""}`}
                onClick={() => onModeChange("vanilla")}
                title="Vanilla mode - only tools available in the current game"
              >
                V1
              </button>
              <button
                className={`mode-button ${
                  mode === "experimental" ? "active" : ""
                }`}
                onClick={() => onModeChange("experimental")}
                title="Experimental mode - all tools including prototypes"
              >
                V2
              </button>
            </div>
          </div>
        </div>

        <div className="dock-divider"></div>

        <div className="dock-scrollable">
          <div className="dock-section">
            <span className="section-label">Tools</span>
            <div className="dock-tools">
              {utilityTools.map((tool) => (
                <ToolItem
                  key={tool.name}
                  toolName={tool.name}
                  label={tool.label}
                  shortcut={tool.shortcut}
                  icon={tool.icon}
                  isSelected={selectedTool === tool.name}
                  onSelect={() => onToolSelect(tool.name)}
                />
              ))}
            </div>
          </div>

          <div className="dock-divider"></div>

          <div className="dock-section">
            <span className="section-label">Ground Types</span>
            <div className="dock-tools">
              {filteredGroundTools.map((tool) => (
                <ToolItem
                  key={tool.name}
                  toolName={tool.name}
                  label={tool.label}
                  shortcut={tool.shortcut}
                  icon={tool.icon}
                  isSelected={selectedTool === tool.name}
                  onSelect={() => onToolSelect(tool.name)}
                />
              ))}
            </div>
          </div>

          <div className="dock-divider"></div>

          <div className="dock-section">
            <span className="section-label">Crop Types</span>
            <div className="dock-tools">
              {cropTools.map((tool) => (
                <ToolItem
                  key={tool.name}
                  toolName={tool.name}
                  label={tool.label}
                  shortcut={tool.shortcut}
                  icon={tool.icon}
                  isSelected={selectedTool === tool.name}
                  onSelect={() => onToolSelect(tool.name)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="dock-divider"></div>

        <div className="dock-controls">
          <div className="grid-size-control">
            <label>
              Grid Size
              <input
                type="number"
                min="1"
                max="512"
                value={inputValue}
                onChange={handleSizeChange}
                onBlur={handleSizeBlur}
                onKeyDown={handleSizeKeyDown}
                onWheel={(e) => {
                  e.preventDefault();
                  if (e.deltaY < 0) {
                    incrementSize();
                  } else {
                    decrementSize();
                  }
                }}
              />
            </label>
            <span className="size-display">
              {gridSize}×{gridSize}
            </span>
          </div>

          <button onClick={handleResetClick} className="reset-button">
            Reset
          </button>

          <button onClick={handleExport} className="export-button">
            Export
          </button>
        </div>
      </div>

      {showExport &&
        createPortal(
          <div className="export-modal">
            <div className="export-modal-content">
              <div className="export-header">
                <h3>Export Layout</h3>
                <button
                  className="close-button"
                  onClick={() => setShowExport(false)}
                >
                  ✕
                </button>
              </div>
              <textarea
                className="export-textarea"
                value={exportedData}
                readOnly
                rows={15}
              />
              <button onClick={handleCopy} className="copy-button">
                {copied ? "✓ Copied!" : "Copy to Clipboard"}
              </button>
            </div>
          </div>,
          document.body
        )}

      {showResetConfirm &&
        createPortal(
          <div className="export-modal">
            <div className="export-modal-content">
              <div className="export-header">
                <h3>Reset Grid</h3>
                <button className="close-button" onClick={handleResetCancel}>
                  ✕
                </button>
              </div>
              <p style={{ padding: "20px", textAlign: "center" }}>
                Are you sure you want to reset the grid to default? This will
                clear all your work.
              </p>
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  justifyContent: "center",
                }}
              >
                <button
                  onClick={handleResetCancel}
                  className="copy-button"
                  style={{ background: "#666" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleResetConfirm}
                  className="copy-button"
                  style={{ background: "#d9534f" }}
                >
                  Reset
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

export default Dock;
