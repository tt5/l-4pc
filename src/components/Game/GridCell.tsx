import { type Component, JSX } from 'solid-js';
import styles from './Board.module.css';
import type { BasePoint } from '../../types/board';
import { King, Queen, Pawn, Bishop, Knight, Rook } from './ChessPieces';

type Point = [number, number];

interface CellState {
  isBasePoint: boolean;
  isSelected: boolean;
  isHovered: boolean;
  isSaving: boolean;
  isInCheck?: boolean;
  isNonPlayable?: boolean; // Indicates if the square is in a non-playable corner
  id?: number; // ID of the piece
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
  const { isBasePoint, isSelected, isHovered, isSaving, id, color, pieceType } = state;
  
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
    if (isBasePoint) classes.push(styles.basePoint);
    if (isSelected) classes.push(styles.selected);
    if (isSaving && isHovered) classes.push(styles.loading);
    else if (isHovered && !state.isNonPlayable) {
      classes.push((!isSelected && !isBasePoint) ? styles['valid-hover'] : styles['invalid-hover']);
    }
    if (isDraggingProp && pickedUpBasePoint && isBasePoint) {
      classes.push(styles.dragging);
    }
    if (isBasePoint && state.isInCheck) {
      classes.push(styles.inCheck);
    }
    if (state.isNonPlayable) {
      classes.push(styles.nonPlayable);
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
      {isBasePoint ? (
        <div 
          class={`${styles.basePoint} ${styles.basePointMarker}`}
          style={{ 'background-color': state.color || '#4CAF50', '--piece-color': state.color || '#4CAF50' }}
          data-piece={state.pieceType}
          data-x={x}
          data-y={y}
          data-color={state.color}
          data-testid={`piece-${x}-${y}`}
        >
          {pieceType === 'queen' && (
            <Queen class={styles.pieceIcon} color={state.color} data-piece-id={id} data-x={x} data-y={y} />
          )}
          {pieceType === 'king' && (
            <King class={styles.pieceIcon} color={state.color} data-piece-id={id} data-x={x} data-y={y} />
          )}
          {pieceType === 'pawn' && (
            <Pawn class={styles.pieceIcon} color={state.color} data-piece-id={id} data-x={x} data-y={y} />
          )}
          {pieceType === 'bishop' && (
            <Bishop class={styles.pieceIcon} color={state.color} data-piece-id={id} data-x={x} data-y={y} />
          )}
          {pieceType === 'knight' && (
            <Knight class={styles.pieceIcon} color={state.color} data-piece-id={id} data-x={x} data-y={y} />
          )}
          {pieceType === 'rook' && (
            <Rook class={styles.pieceIcon} color={state.color} data-piece-id={id} data-x={x} data-y={y} />
          )}
        </div>
      ) : !isSelected ? (
        <div class={styles.emptyMarker}>×</div>
      ) : null}
    </button>
  );
};
