import { type Component, JSX } from 'solid-js';
import styles from './TrainingGridCell.module.css';
import { createPoint, type Point } from '../../types/board';
import { King, Queen, Pawn, Bishop, Knight, Rook } from './ChessPieces';

interface TrainingCellState {
  isBasePoint: boolean;
  isSelected: boolean;
  isHovered: boolean;
  isInCheck?: boolean;
  isNonPlayable?: boolean;
  isBestMoveFrom?: boolean;
  isBestMoveTo?: boolean;
  isRestricted?: boolean;
  id?: number;
  color?: string;
  pieceType?: string;
}

interface TrainingGridCellProps {
  x: number;
  y: number;
  state: TrainingCellState;
  isDragging: boolean;
  pickedUpBasePoint: Point | null;
  onHover: (isHovered: boolean) => void;
  onClick?: () => void;
  onBasePointPickup: (point: Point) => void;
}

export const TrainingGridCell: Component<TrainingGridCellProps> = (props) => {
  const { state, x, y, isDragging: isDraggingProp, pickedUpBasePoint } = props;
  const { isBasePoint, isSelected, isHovered, id, color, pieceType } = state;
  
  const handleMouseDown = (e: MouseEvent) => {
    if (isBasePoint) {
      props.onBasePointPickup(createPoint(x, y));
      e.stopPropagation();
    }
  };

  const handleMouseEnter = () => {
    props.onHover(true);
  };

  const handleMouseUp = () => {};

  const squareClass = () => {
    const classes = [styles.square];
    if (isBasePoint) classes.push(styles.basePoint);
    if (isSelected) classes.push(styles.selected);
    if (state.isNonPlayable) classes.push(styles.nonPlayable);
    if (isDraggingProp && pickedUpBasePoint && isBasePoint) {
      classes.push(styles.dragging);
    }
    if (isBasePoint && state.isInCheck) {
      classes.push(styles.inCheck);
    }
    if (state.isBestMoveFrom) {
      classes.push(styles.bestMoveFrom);
    }
    if (state.isBestMoveTo) {
      classes.push(styles.bestMoveTo);
    }
    if (isHovered && isDraggingProp && pickedUpBasePoint !== null) {
      classes.push(styles['valid-drop']);
    }
    if (state.isRestricted) {
      classes.push(styles.restricted);
    }
    return classes.join(' ');
  };

  return (
    <button
      class={squareClass()}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => props.onHover(false)}
      onClick={props.onClick}
    >
      {isBasePoint ? (
        <div 
          class={`${styles.basePoint} ${styles.basePointMarker}`}
          style={{ 'background-color': state.color, '--piece-color': state.color}}
          data-piece={state.pieceType}
          data-x={x}
          data-y={y}
          data-testid={`piece-${x}-${y}`}
        >
          {pieceType === 'queen' && state.id != null && state.color && (
            <Queen 
              class={styles.pieceIcon} 
              color={state.color} 
              data-piece-id={state.id} 
              data-x={x} 
              data-y={y} 
              data-piece="queen"
            />
          )}
          {pieceType === 'king' && state.id != null && state.color && (
            <King 
              class={styles.pieceIcon} 
              color={state.color} 
              data-piece-id={state.id} 
              data-x={x} 
              data-y={y}
              data-piece="king"
            />
          )}
          {pieceType === 'pawn' && state.id != null && state.color && (
            <Pawn 
              class={styles.pieceIcon} 
              color={state.color} 
              data-piece-id={state.id} 
              data-x={x} 
              data-y={y}
              data-piece="pawn"
            />
          )}
          {pieceType === 'bishop' && state.id != null && state.color && (
            <Bishop 
              class={styles.pieceIcon} 
              color={state.color} 
              data-piece-id={state.id} 
              data-x={x} 
              data-y={y}
              data-piece="bishop"
            />
          )}
          {pieceType === 'knight' && state.id != null && state.color && (
            <Knight 
              class={styles.pieceIcon} 
              color={state.color} 
              data-piece-id={state.id} 
              data-x={x} 
              data-y={y}
              data-piece="knight"
            />
          )}
          {pieceType === 'rook' && state.id != null && state.color && (
            <Rook 
              class={styles.pieceIcon} 
              color={state.color} 
              data-piece-id={state.id} 
              data-x={x} 
              data-y={y}
              data-piece="rook"
            />
          )}
        </div>
      ) : !isSelected ? (
        <div class={styles.emptyMarker}>×</div>
      ) : null}
    </button>
  );
};
