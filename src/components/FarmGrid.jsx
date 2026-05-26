import { useState, useEffect, useRef, useCallback } from "react";
import "./FarmGrid.css";

// Import crop icons
import carrotIcon from "../assets/carrot.svg";
import pumpkinIcon from "../assets/pumpkin.svg";
import appleIcon from "../assets/apple.svg";
import wheatIcon from "../assets/wheat.png";
import hayIcon from "../assets/hay-roll.png";
import treeIcon from "../assets/tree.png";

const CELL_SIZE = 60;
const CELL_GAP = 4;
const CELL_TOTAL = CELL_SIZE + CELL_GAP;

// Ground type colors (matching GridCell.css)
const GROUND_COLORS = {
  grass: "#6a994e",
  soil: "#784f36",
  water: "#3d8fc8",
};

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
  const [cropImages, setCropImages] = useState({});
  const [lastPaintedCell, setLastPaintedCell] = useState(null);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [isIsometric, setIsIsometric] = useState(false);
  const containerRef = useRef(null);
  const canvasRef = useRef(null);

  // Load crop images
  useEffect(() => {
    const images = {};
    const imageSources = {
      carrot: carrotIcon,
      pumpkin: pumpkinIcon,
      apple: appleIcon,
      wheat: wheatIcon,
      hay: hayIcon,
      tree: treeIcon,
    };

    let loadedCount = 0;
    const totalImages = Object.keys(imageSources).length;

    Object.entries(imageSources).forEach(([crop, src]) => {
      const img = new Image();
      img.onload = () => {
        images[crop] = img;
        loadedCount++;
        if (loadedCount === totalImages) {
          setCropImages(images);
        }
      };
      img.src = src;
    });
  }, []);

  // Auto-fit zoom when grid size changes
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    const gridWidth = gridSize.cols * CELL_TOTAL;
    const gridHeight = gridSize.rows * CELL_TOTAL;

    // Calculate zoom to fit with some padding
    const zoomX = (containerWidth * 0.8) / gridWidth;
    const zoomY = (containerHeight * 0.8) / gridHeight;
    const autoZoom = Math.min(zoomX, zoomY, 1);

    setZoom(autoZoom);
    setPan({ x: 0, y: 0 });
  }, [gridSize.rows, gridSize.cols]);

  // Draw the grid on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const gridWidth = gridSize.cols * CELL_TOTAL;
    const gridHeight = gridSize.rows * CELL_TOTAL;

    // Chrome hard-limits canvas dimensions to 16384px.
    // Clamp DPR so the backing store never exceeds that, with a floor of 1.
    const MAX_CANVAS_PX = 16384;
    const maxDpr = Math.max(1, Math.floor(MAX_CANVAS_PX / Math.max(gridWidth, gridHeight)));
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);

    canvas.width = gridWidth * dpr;
    canvas.height = gridHeight * dpr;
    canvas.style.width = `${gridWidth}px`;
    canvas.style.height = `${gridHeight}px`;

    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, gridWidth, gridHeight);

    // Draw cells
    for (let row = 0; row < gridSize.rows; row++) {
      for (let col = 0; col < gridSize.cols; col++) {
        // Reverse row order to match original bottom-up rendering
        const reversedRow = gridSize.rows - 1 - row;
        const index = reversedRow * gridSize.cols + col;
        const cell = gridData[index];

        if (!cell) continue;

        const x = col * CELL_TOTAL;
        const y = row * CELL_TOTAL;
        const isHovered = index === hoveredCell;

        // Lift effect for hover
        // Draw ground
        ctx.fillStyle = GROUND_COLORS[cell.ground] || GROUND_COLORS.grass;
        ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);

        // Draw border
        ctx.strokeStyle = isHovered ? "rgba(255, 255, 255, 0.8)" : "rgba(0, 0, 0, 0.2)";
        ctx.lineWidth = isHovered ? 2 : 1;
        ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);

        // Hover overlay
        if (isHovered) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
          ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
        }

        // Draw crop
        if (cell.crop) {
          const img = cropImages[cell.crop];
          if (img) {
            const iconSize = CELL_SIZE * 0.8;
            const iconX = x + (CELL_SIZE - iconSize) / 2;
            const iconY = y + (CELL_SIZE - iconSize) / 2;
            ctx.drawImage(img, iconX, iconY, iconSize, iconSize);
          } else {
            ctx.fillStyle = "white";
            ctx.font = "bold 32px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(cell.crop.charAt(0).toUpperCase(), x + CELL_SIZE / 2, y + CELL_SIZE / 2);
          }
        }
      }
    }
  }, [gridData, gridSize, cropImages, hoveredCell]);

  // Convert mouse coordinates to grid cell index
  const getGridCellFromMouse = (e) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return null;

    // Get the wrapper element that has the transforms
    const wrapper = canvas.parentElement;
    if (!wrapper) return null;

    if (!isIsometric) {
      // Top-down mode: simple 2D calculation
      const rect = canvas.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left) / zoom;
      const mouseY = (e.clientY - rect.top) / zoom;

      const col = Math.floor(mouseX / CELL_TOTAL);
      const row = Math.floor(mouseY / CELL_TOTAL);

      if (col < 0 || col >= gridSize.cols || row < 0 || row >= gridSize.rows) {
        return null;
      }

      const reversedRow = gridSize.rows - 1 - row;
      return reversedRow * gridSize.cols + col;
    } else {
      // Isometric mode: 3D transform calculation
      const wrapperRect = wrapper.getBoundingClientRect();

      // Calculate mouse position relative to wrapper center
      const wrapperCenterX = wrapperRect.left + wrapperRect.width / 2;
      const wrapperCenterY = wrapperRect.top + wrapperRect.height / 2;

      // Get mouse position relative to wrapper center
      let relativeX = e.clientX - wrapperCenterX;
      let relativeY = e.clientY - wrapperCenterY;

      // Apply inverse of the 3D transform (rotateX(55deg) rotateZ(-45deg))
      // First, undo the scale from zoom
      relativeX /= zoom;
      relativeY /= zoom;

      // Inverse rotateZ(-45deg) = rotateZ(45deg)
      const angle = (45 * Math.PI) / 180;
      const cos45 = Math.cos(angle);
      const sin45 = Math.sin(angle);
      const x1 = relativeX * cos45 - relativeY * sin45;
      const y1 = relativeX * sin45 + relativeY * cos45;

      // Inverse rotateX(55deg) - this affects the Y coordinate
      const xAngle = (55 * Math.PI) / 180;
      const y2 = y1 / Math.cos(xAngle);

      // Get canvas dimensions
      const canvasWidth = gridSize.cols * CELL_TOTAL;
      const canvasHeight = gridSize.rows * CELL_TOTAL;

      // Convert from centered coordinates to canvas coordinates
      const canvasX = x1 + canvasWidth / 2;
      const canvasY = y2 + canvasHeight / 2;

      // Convert to grid coordinates (pan is already accounted for in wrapperRect)
      const col = Math.floor(canvasX / CELL_TOTAL);
      const row = Math.floor(canvasY / CELL_TOTAL);

      if (col < 0 || col >= gridSize.cols || row < 0 || row >= gridSize.rows) {
        return null;
      }

      const reversedRow = gridSize.rows - 1 - row;
      return reversedRow * gridSize.cols + col;
    }
  };

  const handleMouseDown = (e) => {
    if (e.button === 1 || e.button === 2 || e.shiftKey) {
      // Middle click, right click, or shift+click for panning
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    } else if (e.button === 0) {
      // Left click for painting
      setIsPainting(true);
      const cellIndex = getGridCellFromMouse(e);
      if (cellIndex !== null) {
        setLastPaintedCell(cellIndex);
        onCellUpdate(cellIndex);
      }
    }
  };

  const handleMouseMove = (e) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    } else if (isPainting) {
      const cellIndex = getGridCellFromMouse(e);
      if (cellIndex !== null && cellIndex !== lastPaintedCell) {
        setLastPaintedCell(cellIndex);
        onCellUpdate(cellIndex);
      }
      // Update hover state even while painting
      setHoveredCell(cellIndex);
    } else {
      // Track hover when not painting or panning
      const cellIndex = getGridCellFromMouse(e);
      setHoveredCell(cellIndex);
    }
  };

  const handleMouseUp = () => {
    setIsPainting(false);
    setIsPanning(false);
    setLastPaintedCell(null);
  };

  const handleMouseLeave = () => {
    setIsPainting(false);
    setIsPanning(false);
    setLastPaintedCell(null);
    setHoveredCell(null);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((prevZoom) => Math.max(0.1, Math.min(2, prevZoom * delta)));
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
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

  const toggleViewMode = useCallback(() => {
    setIsIsometric((prev) => !prev);
  }, []);

  // Keyboard shortcuts for zoom and view mode
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
      } else if (e.key.toLowerCase() === "v") {
        toggleViewMode();
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleViewMode]);

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
        className="farm-grid-canvas-wrapper"
        style={{
          transform: isIsometric
            ? `rotateX(55deg) rotateZ(-45deg) scale(${zoom}) translate(${
                pan.x / zoom
              }px, ${pan.y / zoom}px)`
            : `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
        }}
      >
        <canvas ref={canvasRef} className="farm-grid-canvas" />
      </div>

      {/* View Mode Toggle */}
      <div className="view-mode-toggle">
        <button
          className={`view-mode-button ${!isIsometric ? "active" : ""}`}
          onClick={toggleViewMode}
          title="Toggle View Mode (V)"
        >
          {isIsometric ? "📐 Isometric" : "⬇️ Top-Down"}
        </button>
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
