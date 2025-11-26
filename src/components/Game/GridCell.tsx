import { type Component, JSX } from 'solid-js';
import styles from './Board.module.css';

interface Position {
  x: number;
  y: number;
  worldX: number;
  worldY: number;
}

interface CellState {
  isBasePoint: boolean;
  isSelected: boolean;
  isHovered: boolean;
  isSaving: boolean;
}

interface GridCellProps {
  state: CellState;
  onHover: (isHovered: boolean) => void;
  onClick?: () => void; // Make this optional since we'll handle the click internally
}

export const GridCell: Component<GridCellProps> = (props) => {
  const { state, onHover, onClick } = props;
  const { isBasePoint, isSelected, isHovered, isSaving } = state;
  
  // Track if we should process the click
  let shouldProcessClick = true;
  let isMouseDown = false;
  let mouseDownTime = 0;
  const MAX_CLICK_DURATION = 300; // ms

  const handleMouseDown = (e: MouseEvent) => {
    // Only process left mouse button clicks
    shouldProcessClick = e.button === 0;
    isMouseDown = true;
    mouseDownTime = Date.now();
    e.preventDefault();
  };

  const handleMouseUp = (e: MouseEvent) => {
    const clickDuration = Date.now() - mouseDownTime;
    isMouseDown = false;
    
    // Only prevent click if mouseup happened outside the button and it was a quick click
    if (e.currentTarget && e.target && !(e.currentTarget as HTMLElement).contains(e.target as Node) && clickDuration < MAX_CLICK_DURATION) {
      shouldProcessClick = false;
    }
    e.preventDefault();
  };

  const handleMouseLeave = () => {
    onHover(false);
    
    // If mouse leaves while button is down, only cancel if it's a long press
    if (isMouseDown) {
      const pressDuration = Date.now() - mouseDownTime;
      if (pressDuration < MAX_CLICK_DURATION) {
      }
    }
  };

  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    
    // Don't process if we're in the middle of a drag or the cell is not clickable
    if (!shouldProcessClick || isSelected || isSaving || isBasePoint) {
      return;
    }
    
    // Call the onClick handler if provided
    if (onClick) {
      onClick();
    }
  };

  const squareClass = () => {
    const classes = [styles.square];
    if (isSelected) classes.push(styles.selected);
    if (isSaving && isHovered) classes.push(styles.loading);
    else if (isHovered) {
      classes.push((!isSelected && !isBasePoint) ? styles['valid-hover'] : styles['invalid-hover']);
    }
    return classes.join(' ');
  };

  return (
    <button
      class={squareClass()}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={() => onHover(true)}
      onContextMenu={(e) => {
        e.preventDefault();
        shouldProcessClick = false;
      }}
      classList={{
        [styles.gridCell]: true,
        [styles.basePoint]: isBasePoint,
        [styles.selected]: isSelected,
        [styles.hovered]: isHovered,
      }}
    >
      {isBasePoint ? (
        <div class={styles.basePointMarker} />
      ) : !isSelected ? (
        <div class={styles.emptyMarker}>×</div>
      ) : null}
    </button>
  );
};
