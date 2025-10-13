import { useState, useEffect, useRef } from "react";
import GridCell from "./GridCell";
import "./FarmGrid.css";

function FarmGrid({
  gridData,
  gridSize,
  onCellUpdate,
  isPainting,
  setIsPainting,
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);
  const gridRef = useRef(null);

  // Auto-fit zoom when grid size changes
  useEffect(() => {
    if (!containerRef.current || !gridRef.current) return;

    const container = containerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // Approximate grid size (60px per cell + 4px gap)
    const cellSize = 64;
    const gridWidth = gridSize.cols * cellSize;
    const gridHeight = gridSize.rows * cellSize;

    // Calculate zoom to fit with some padding
    const zoomX = (containerWidth * 0.8) / gridWidth;
    const zoomY = (containerHeight * 0.8) / gridHeight;
    const autoZoom = Math.min(zoomX, zoomY, 1); // Don't zoom in beyond 100%

    setZoom(autoZoom);
    setPan({ x: 0, y: 0 }); // Reset pan when grid size changes
  }, [gridSize.rows, gridSize.cols]);

  const handleMouseDown = (e) => {
    if (e.button === 1 || e.button === 2 || e.shiftKey) {
      // Middle click, right click, or shift+click for panning
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    } else {
      setIsPainting(true);
    }
  };

  const handleMouseMove = (e) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsPainting(false);
    setIsPanning(false);
  };

  const handleMouseLeave = () => {
    setIsPainting(false);
    setIsPanning(false);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((prevZoom) => Math.max(0.1, Math.min(2, prevZoom * delta)));
  };

  const handleContextMenu = (e) => {
    e.preventDefault(); // Prevent context menu on right click
  };

  const handleZoomIn = () => {
    setZoom((prevZoom) => Math.min(2, prevZoom * 1.2));
  };

  const handleZoomOut = () => {
    setZoom((prevZoom) => Math.max(0.1, prevZoom / 1.2));
  };

  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Keyboard shortcuts for zoom
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "+" || e.key === "=") {
        handleZoomIn();
        e.preventDefault();
      } else if (e.key === "-" || e.key === "_") {
        handleZoomOut();
        e.preventDefault();
      } else if (e.key === "0" && !e.shiftKey) {
        handleResetView();
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`farm-grid-container ${isPanning ? "panning" : ""}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
    >
      <div
        ref={gridRef}
        className="farm-grid"
        style={{
          gridTemplateColumns: `repeat(${gridSize.cols}, 1fr)`,
          transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${
            pan.y / zoom
          }px)`,
        }}
      >
        {Array.from({ length: gridSize.rows }, (_, rowIndex) => {
          // Reverse row order: start from bottom row (last row)
          const reversedRowIndex = gridSize.rows - 1 - rowIndex;
          return Array.from({ length: gridSize.cols }, (_, colIndex) => {
            const index = reversedRowIndex * gridSize.cols + colIndex;
            return (
              <GridCell
                key={index}
                cellData={gridData[index]}
                index={index}
                isPainting={isPainting && !isPanning}
                onCellUpdate={onCellUpdate}
              />
            );
          });
        })}
      </div>

      {/* Zoom Controls */}
      <div className="zoom-controls">
        <button
          className="zoom-button"
          onClick={handleZoomIn}
          title="Zoom In (+)"
        >
          +
        </button>
        <span className="zoom-level">{Math.round(zoom * 100)}%</span>
        <button
          className="zoom-button"
          onClick={handleZoomOut}
          title="Zoom Out (-)"
        >
          −
        </button>
        <button
          className="zoom-button reset"
          onClick={handleResetView}
          title="Reset View (0)"
        >
          ⟲
        </button>
      </div>

      {/* Pan hint */}
      <div className="pan-hint">
        Shift+drag or middle-click to pan • Scroll to zoom
      </div>
    </div>
  );
}

export default FarmGrid;
