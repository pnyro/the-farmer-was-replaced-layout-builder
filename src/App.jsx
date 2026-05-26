import { useState, useEffect } from "react";
import FarmGrid from "./components/FarmGrid";
import Dock from "./components/Dock";
import "./App.css";

// Utility function to create a new grid
const createGrid = (rows, cols) => {
  const totalCells = rows * cols;
  return Array.from({ length: totalCells }, () => ({
    ground: "grass",
    crop: null,
  }));
};

// Utility function to remap grid data when resizing
// This function preserves the exact position of existing cells
// Growing: adds new default cells at top and right edges
// Shrinking: removes cells beyond the new boundaries (top and right edges)
const remapGrid = (oldGridData, oldRows, oldCols, newRows, newCols) => {
  // Create a new blank grid with the target size
  const newGrid = createGrid(newRows, newCols);

  // If old grid is empty or has no data, return the new blank grid
  if (!oldGridData || oldGridData.length === 0) {
    return newGrid;
  }

  // Determine the overlap region (cells that exist in both old and new grids)
  const minRows = Math.min(oldRows, newRows);
  const minCols = Math.min(oldCols, newCols);

  // Copy existing cells to their exact same positions in the new grid
  // Optimize by reusing old cell objects when possible (no deep copy needed)
  for (let row = 0; row < minRows; row++) {
    for (let col = 0; col < minCols; col++) {
      const oldIndex = row * oldCols + col;
      const newIndex = row * newCols + col;

      // Reuse existing cell object instead of creating new one
      newGrid[newIndex] = oldGridData[oldIndex];
    }
  }

  return newGrid;
};

function App() {
  const [gridSize, setGridSize] = useState({ rows: 6, cols: 6 });
  const [gridData, setGridData] = useState([]);
  const [selectedTool, setSelectedTool] = useState("soil");
  const [isPainting, setIsPainting] = useState(false);
  const [mode, setMode] = useState("vanilla"); // 'vanilla' or 'experimental'

  // Initialize grid on mount only
  useEffect(() => {
    setGridData(createGrid(gridSize.rows, gridSize.cols));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle mode changes - reset tool if current tool is not available in new mode
  useEffect(() => {
    const experimentalOnlyTools = ["water"];
    if (mode === "vanilla" && experimentalOnlyTools.includes(selectedTool)) {
      setSelectedTool("soil"); // Default to soil if current tool is not available
    }
  }, [mode, selectedTool]);

  // Handle cell updates when user paints
  const handleCellUpdate = (index) => {
    setGridData((prevData) => {
      const newData = [...prevData];
      const cell = { ...newData[index] };

      // Apply the selected tool
      if (selectedTool === "eraser") {
        cell.ground = "grass";
        cell.crop = null;
      } else if (
        selectedTool === "soil" ||
        selectedTool === "grass" ||
        selectedTool === "water"
      ) {
        cell.ground = selectedTool;
      } else {
        // It's a crop tool
        cell.crop = selectedTool;
      }

      newData[index] = cell;
      return newData;
    });
  };

  // Handle tool selection from dock
  const handleToolSelect = (tool) => {
    setSelectedTool(tool);
  };

  // Handle grid size changes (always square) with layout preservation
  const handleGridSizeChange = (size) => {
    const oldRows = gridSize.rows;
    const oldCols = gridSize.cols;
    const newRows = size;
    const newCols = size;

    // Remap the existing grid data to the new size
    const remappedGrid = remapGrid(
      gridData,
      oldRows,
      oldCols,
      newRows,
      newCols
    );

    // Update both grid size and grid data
    setGridSize({ rows: newRows, cols: newCols });
    setGridData(remappedGrid);
  };

  // Handle grid reset
  const handleReset = () => {
    setGridData(createGrid(gridSize.rows, gridSize.cols));
  };

  // Keyboard shortcuts
  useEffect(() => {
    // Define experimental-only tools
    const experimentalOnlyTools = ["water"];

    // Check if a tool is available in current mode
    const isToolAvailable = (tool) => {
      if (mode === "vanilla") {
        return !experimentalOnlyTools.includes(tool);
      }
      return true; // All tools available in experimental mode
    };

    const handleKeyDown = (event) => {
      const key = event.key.toLowerCase();
      const shortcuts = {
        s: "soil",
        g: "grass",
        w: "water",
        e: "eraser",
        c: "carrot",
        p: "pumpkin",
        u: "wheat",
        h: "hay",
        t: "tree",
        a: "apple",
      };

      if (shortcuts[key] && isToolAvailable(shortcuts[key])) {
        setSelectedTool(shortcuts[key]);
        event.preventDefault();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mode]);

  return (
    <div className="app">
      <Dock
        selectedTool={selectedTool}
        onToolSelect={handleToolSelect}
        gridSize={gridSize.rows}
        onGridSizeChange={handleGridSizeChange}
        gridData={gridData}
        mode={mode}
        onModeChange={setMode}
        onReset={handleReset}
      />

      <div className="main-content">
        <FarmGrid
          gridData={gridData}
          gridSize={gridSize}
          onCellUpdate={handleCellUpdate}
          isPainting={isPainting}
          setIsPainting={setIsPainting}
        />
      </div>
    </div>
  );
}

export default App;
