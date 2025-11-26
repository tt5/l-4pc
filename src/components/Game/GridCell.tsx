import { type Component, JSX } from 'solid-js';
import styles from './Board.module.css';

type Point = [number, number];

interface CellState {
  isBasePoint: boolean;
  isSelected: boolean;
  isHovered: boolean;
  isSaving: boolean;
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
    if (isDraggingProp && pickedUpBasePoint) {
      props.onBasePointPlacement([x, y]);
    }
  };

  const handleMouseUp = () => {
    if (isDraggingProp && pickedUpBasePoint) {
      props.onBasePointPlacement([x, y]);
    }
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

  return (
    <button
      class={squareClass()}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => props.onHover(false)}
      onClick={props.onClick}
      classList={{
        [styles.draggable]: isBasePoint,
        [styles['valid-drop']]: isHovered && isDraggingProp && pickedUpBasePoint,
      }}
    >
      {isBasePoint && <div class={styles.basePoint} />}
      {isBasePoint ? (
        <div class={styles.basePointMarker} />
      ) : !isSelected ? (
        <div class={styles.emptyMarker}>×</div>
      ) : null}
    </button>
  );
};
