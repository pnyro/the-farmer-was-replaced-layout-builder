import "./GridCell.css";

// Import crop icons
import carrotIcon from "../assets/carrot.svg";
import pumpkinIcon from "../assets/pumpkin.svg";
import appleIcon from "../assets/apple.svg";

const cropIcons = {
  carrot: carrotIcon,
  pumpkin: pumpkinIcon,
  apple: appleIcon,
};

function GridCell({ cellData, index, isPainting, onCellUpdate }) {
  const handleMouseDown = (e) => {
    // Only paint on left-click (button 0)
    if (e.button === 0) {
      onCellUpdate(index);
    }
  };

  const handleMouseEnter = () => {
    if (isPainting) {
      onCellUpdate(index);
    }
  };

  const getCropDisplay = (crop) => {
    if (cropIcons[crop]) {
      return <img src={cropIcons[crop]} alt={crop} className="crop-icon-img" />;
    }
    // Fallback to first letter for crops without icons
    return <div className="crop-icon-text">{crop.charAt(0).toUpperCase()}</div>;
  };

  // Safety check: if cellData is undefined, render a default cell
  if (!cellData) {
    return <div className="grid-cell grass"></div>;
  }

  return (
    <div
      className={`grid-cell ${cellData.ground}`}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
    >
      {cellData.crop && (
        <div className="crop-icon">{getCropDisplay(cellData.crop)}</div>
      )}
    </div>
  );
}

export default GridCell;
