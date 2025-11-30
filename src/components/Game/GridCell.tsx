import { type Component, JSX } from 'solid-js';
import styles from './Board.module.css';
import type { BasePoint } from '../../types/board';

type Point = [number, number];

interface CellState {
  isBasePoint: boolean;
  isSelected: boolean;
  isHovered: boolean;
  isSaving: boolean;
  color?: string; // Optional color for the base point
  pieceType?: string; // Type of the piece (e.g., 'pawn', 'queen')
}

interface GridCellProps {
  x: number;
  y: number;
  state: CellState;
  isDragging: boolean;
  pickedUpBasePoint: Point | null;
  onHover: (isHovered: boolean) => void;
  onClick: () => void;
  onBasePointPickup: (point: Point) => void;
  onBasePointPlacement: (point: Point) => void;
  setBasePoints: (updater: (prev: BasePoint[]) => BasePoint[]) => void;
}

export const GridCell: Component<GridCellProps> = (props) => {
  const { state, x, y, isDragging: isDraggingProp, pickedUpBasePoint } = props;
  const { isBasePoint, isSelected, isHovered, isSaving } = state;
  
  const handleMouseDown = (e: MouseEvent) => {
    if (isBasePoint) {
      props.onBasePointPickup([x, y]);
      e.stopPropagation();
    }
  };

  const handleMouseEnter = () => {
    props.onHover(true);
    // Don't call onBasePointPlacement during drag - we'll handle it in handleGlobalMouseUp
  };

  const handleMouseUp = () => {
    // Don't call onBasePointPlacement here - we'll handle it in handleGlobalMouseUp
  };

  const squareClass = () => {
    const classes = [styles.square];
    if (isSelected) classes.push(styles.selected);
    if (isSaving && isHovered) classes.push(styles.loading);
    else if (isHovered) {
      classes.push((!isSelected && !isBasePoint) ? styles['valid-hover'] : styles['invalid-hover']);
    }
    if (isDraggingProp && pickedUpBasePoint && isBasePoint) {
      classes.push(styles.dragging);
    }
    return classes.join(' ');
  };

  // Create class list with proper typing
  const classList = {
    [styles.draggable]: isBasePoint,
    [styles['valid-drop']]: isHovered && isDraggingProp && pickedUpBasePoint !== null,
  } as Record<string, boolean>;

  return (
    <button
      class={squareClass()}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => props.onHover(false)}
      onClick={props.onClick}
      classList={classList}
    >
      {isBasePoint && <div class={styles.basePoint} style={{ 'background-color': state.color || '#4CAF50' }}>
        {state.pieceType === 'queen' && (
          <div class={styles.pieceIcon}>♕</div>
        )}
      </div>}
      {isBasePoint ? (
        <div 
          class={styles.basePointMarker}
          style={{ 'background-color': state.color || '#4CAF50' }}
        >
          {state.pieceType === 'queen' && (
            <div class={styles.pieceIcon}>♕</div>
          )}
        </div>
      ) : !isSelected ? (
        <div class={styles.emptyMarker}>×</div>
      ) : null}
    </button>
  );
};
