import { 
  type Component, 
  createSignal,
  createEffect,
  onMount,
  onCleanup,
} from 'solid-js';

import { GridCell } from './GridCell';
import { parseFen4 } from '~/utils/fen4Utils';
import { getLegalMoves } from '~/utils/gameUtils';
import { calculateRestrictedSquares } from '~/utils/boardUtils';
import { 
  BOARD_CONFIG,
  isInNonPlayableCorner,
  PLAYER_COLORS,
  COLOR_TO_HEX,
} from '~/constants/game';

import { type Point, type BasePoint, type RestrictedSquareInfo, createPoint } from '../../types/board';

import styles from './Board.module.css';

interface TrainingBoardProps {
  fen4?: string;
  onMove?: (move: { fromX: number; fromY: number; toX: number; toY: number }) => void;
  readOnly?: boolean;
}

export const TrainingBoard: Component<TrainingBoardProps> = (props) => {
  const [basePoints, setBasePoints] = createSignal<BasePoint[]>([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = createSignal(0);
  const [restrictedSquaresInfo, setRestrictedSquaresInfo] = createSignal<RestrictedSquareInfo[]>([]);
  const [restrictedSquares, setRestrictedSquares] = createSignal<number[]>([]);
  const [pickedUpBasePoint, setPickedUpBasePoint] = createSignal<BasePoint | null>(null);
  const [isDragging, setIsDragging] = createSignal(false);
  const [hoveredCell, setHoveredCell] = createSignal<Point | null>(null);
  const [targetPosition, setTargetPosition] = createSignal<Point | null>(null);
  const [selectedCell, setSelectedCell] = createSignal<Point | null>(null);

  // Load FEN4 when it changes
  createEffect(() => {
    const fen4String = props.fen4;
    if (fen4String) {
      try {
        const parsed = parseFen4(fen4String);
        setBasePoints(parsed.basePoints);
        setCurrentPlayerIndex(parsed.currentPlayerIndex);
        updateRestrictedSquares(parsed.basePoints);
      } catch (error) {
        console.error('Error parsing FEN4:', error);
      }
    }
  });

  const updateRestrictedSquares = (pieces: BasePoint[]) => {
    const result = calculateRestrictedSquares(pieces, pieces);
    setRestrictedSquaresInfo(result.restrictedSquaresInfo);
    setRestrictedSquares(result.restrictedSquares);
  };

  const handleBasePointPickup = (point: Point) => {
    if (props.readOnly) return;
    
    const piece = basePoints().find(bp => bp.x === point[0] && bp.y === point[1]);
    if (!piece) return;

    const currentPlayerColor = PLAYER_COLORS[currentPlayerIndex()];
    if (piece.color !== currentPlayerColor) return;

    setPickedUpBasePoint(piece);
    setIsDragging(true);
    setSelectedCell(point);
  };

  const handleCellHover = (x: number, y: number, isHovered: boolean) => {
    if (isHovered) {
      setHoveredCell(createPoint(x, y));
    } else {
      setHoveredCell(null);
    }
  };

  const handleCellClick = (x: number, y: number) => {
    if (props.readOnly) return;

    const piece = basePoints().find(bp => bp.x === x && bp.y === y);
    const selected = selectedCell();

    // If clicking on same cell, deselect
    if (selected && selected[0] === x && selected[1] === y) {
      setSelectedCell(null);
      setPickedUpBasePoint(null);
      return;
    }

    // If no piece selected, select this piece
    if (!selected) {
      if (piece) {
        const currentPlayerColor = PLAYER_COLORS[currentPlayerIndex()];
        if (piece.color === currentPlayerColor) {
          setSelectedCell(createPoint(x, y));
          setPickedUpBasePoint(piece);
        }
      }
      return;
    }

    // If piece selected, try to move
    const selectedPiece = basePoints().find(bp => bp.x === selected[0] && bp.y === selected[1]);
    if (selectedPiece) {
      const legalMoves = getLegalMoves(selectedPiece, basePoints());
      const isValidMove = legalMoves.some(move => move.x === x && move.y === y);

      if (isValidMove) {
        makeMove(selectedPiece, x, y);
        setSelectedCell(null);
        setPickedUpBasePoint(null);
      } else {
        // If clicking on another piece of current player, select it instead
        if (piece && piece.color === PLAYER_COLORS[currentPlayerIndex()]) {
          setSelectedCell(createPoint(x, y));
          setPickedUpBasePoint(piece);
        } else {
          setSelectedCell(null);
          setPickedUpBasePoint(null);
        }
      }
    }
  };

  const makeMove = (piece: BasePoint, toX: number, toY: number) => {
    const fromX = piece.x;
    const fromY = piece.y;

    // Update base points
    const newBasePoints = basePoints().map(bp => {
      if (bp.x === fromX && bp.y === fromY) {
        return { ...bp, x: toX, y: toY, hasMoved: true };
      }
      // Remove captured piece
      if (bp.x === toX && bp.y === toY) {
        return null;
      }
      return bp;
    }).filter((bp): bp is BasePoint => bp !== null);

    setBasePoints(newBasePoints);
    updateRestrictedSquares(newBasePoints);

    // Update current player
    setCurrentPlayerIndex(prev => (prev + 1) % 4);

    // Call callback
    if (props.onMove) {
      props.onMove({ fromX, fromY, toX, toY });
    }
  };

  const handleMouseUp = () => {
    if (!isDragging() || !pickedUpBasePoint() || !hoveredCell()) {
      cleanupDragState();
      return;
    }

    const piece = pickedUpBasePoint()!;
    const target = hoveredCell()!;
    const legalMoves = getLegalMoves(piece, basePoints());
    const isValidMove = legalMoves.some(move => move.x === target[0] && move.y === target[1]);

    if (isValidMove) {
      makeMove(piece, target[0], target[1]);
    }

    cleanupDragState();
  };

  const cleanupDragState = () => {
    setIsDragging(false);
    setPickedUpBasePoint(null);
    setHoveredCell(null);
    setTargetPosition(null);
  };

  // Global mouse up handler for drag and drop
  onMount(() => {
    const handleGlobalMouseUp = () => {
      handleMouseUp();
    };

    document.addEventListener('mouseup', handleGlobalMouseUp);
    onCleanup(() => {
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    });
  });

  const getCellState = (x: number, y: number) => {
    const piece = basePoints().find(bp => bp.x === x && bp.y === y);
    const selected = selectedCell();
    const hovered = hoveredCell();
    const pickedUp = pickedUpBasePoint();

    const isBasePoint = !!piece;
    const isSelected = selected && selected[0] === x && selected[1] === y;
    const isHovered = hovered && hovered[0] === x && hovered[1] === y;
    const isNonPlayable = isInNonPlayableCorner(x, y);

    // Check if this is a valid drop target
    let isValidDrop = false;
    if (isDragging() && pickedUp && isHovered) {
      const legalMoves = getLegalMoves(pickedUp, basePoints());
      isValidDrop = legalMoves.some(move => move.x === x && move.y === y);
    }

    return {
      isBasePoint,
      isSelected,
      isHovered,
      isNonPlayable,
      id: piece?.id,
      color: piece?.color ? COLOR_TO_HEX[piece.color as keyof typeof COLOR_TO_HEX] : undefined,
      pieceType: piece?.pieceType,
    };
  };

  return (
    <div class={styles.boardContainer}>
      <div 
        class={styles.board}
        style={{
          'grid-template-columns': `repeat(${BOARD_CONFIG.GRID_SIZE}, 1fr)`,
          'grid-template-rows': `repeat(${BOARD_CONFIG.GRID_SIZE}, 1fr)`
        }}
      >
        {Array.from({ length: BOARD_CONFIG.GRID_SIZE }).map((_, y) =>
          Array.from({ length: BOARD_CONFIG.GRID_SIZE }).map((_, x) => {
            const state = getCellState(x, y);
            const pickedUp = pickedUpBasePoint();
            
            return (
              <GridCell
                key={`${x}-${y}`}
                x={x}
                y={y}
                state={state}
                isDragging={isDragging()}
                pickedUpBasePoint={pickedUp ? createPoint(pickedUp.x, pickedUp.y) : null}
                onHover={(isHovered) => handleCellHover(x, y, isHovered)}
                onClick={() => handleCellClick(x, y)}
                onBasePointPickup={(point) => handleBasePointPickup(point)}
              />
            );
          })
        )}
      </div>
    </div>
  );
};
