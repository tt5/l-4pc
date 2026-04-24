import { 
  type Component, 
  createSignal,
  createEffect,
  onMount,
  onCleanup,
} from 'solid-js';

import { TrainingGridCell } from './TrainingGridCell';
import { parseFen4 } from '~/utils/fen4Utils';
import { getLegalMoves, hasAnyLegalMoves, isKingInCheck } from '~/utils/gameUtils';
import { calculateRestrictedSquares } from '~/utils/boardUtils';
import { verifyCheckmateInOne as verifyCheckmateInOneUtil } from '~/utils/puzzleVerification';
import { 
  BOARD_CONFIG,
  isInNonPlayableCorner,
  PLAYER_COLORS,
  COLOR_TO_HEX,
} from '~/constants/game';

import { type Point, type BasePoint, type RestrictedSquareInfo, createPoint } from '../../types/board';

import styles from './TrainingBoard.module.css';

interface TrainingBoardProps {
  fen4?: string;
  onMove?: (move: { fromX: number; fromY: number; toX: number; toY: number; isCheckmate: boolean }) => void;
  onCheckmate?: (winnerColor: string) => void;
  onStalemate?: () => void;
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
  const [lastFen4, setLastFen4] = createSignal<string>('');

  // Load FEN4 when it changes
  createEffect(() => {
    const fen4String = props.fen4;
    if (fen4String && fen4String !== lastFen4()) {
      try {
        const parsed = parseFen4(fen4String);
        setBasePoints(parsed.basePoints);
        setCurrentPlayerIndex(parsed.currentPlayerIndex);
        updateRestrictedSquares(parsed.basePoints);
        setLastFen4(fen4String);
      } catch (error) {
        console.error('Error parsing FEN4:', error);
      }
    }
  });

  const verifyCheckmateInOne = (fen4?: string): { found: boolean; move?: { fromX: number; fromY: number; toX: number; toY: number } } => {
    // Use provided fen4 or construct from current board state
    if (fen4) {
      return verifyCheckmateInOneUtil(fen4);
    } else {
      // Construct FEN4 from current board state for verification
      // This is a simplified approach - in a real implementation you'd want a proper FEN4 serializer
      // For now, we'll just use the utility directly with the pieces and player index
      const pieces = basePoints();
      const playerIndex = currentPlayerIndex();
      
      const currentPlayerColor = PLAYER_COLORS[playerIndex];
      const currentPlayerPieces = pieces.filter(p => p.color === currentPlayerColor);
      
      // Try all pieces of the current player
      for (const piece of currentPlayerPieces) {
        const legalMoves = getLegalMoves(piece, pieces);
        
        // Try each legal move for this piece
        for (const move of legalMoves) {
          // Simulate the move
          const newBasePoints = pieces.map(bp => {
            if (bp.x === piece.x && bp.y === piece.y) {
              return { ...bp, x: move.x, y: move.y, hasMoved: true };
            }
            // Remove captured piece
            if (bp.x === move.x && bp.y === move.y) {
              return null;
            }
            return bp;
          }).filter((bp): bp is BasePoint => bp !== null);
          
          // Check if the next player is in checkmate
          const nextPlayerIndex = (playerIndex + 1) % 4;
          const nextPlayerColor = PLAYER_COLORS[nextPlayerIndex];
          const nextPlayerKing = newBasePoints.find(bp => bp.pieceType === 'king' && bp.color === nextPlayerColor);
          
          if (nextPlayerKing) {
            const hasLegalMoves = hasAnyLegalMoves(nextPlayerColor, newBasePoints);
            if (!hasLegalMoves) {
              const inCheck = isKingInCheck(nextPlayerKing, newBasePoints);
              if (inCheck) {
                // Checkmate found!
                return {
                  found: true,
                  move: { fromX: piece.x, fromY: piece.y, toX: move.x, toY: move.y }
                };
              }
            }
          }
        }
      }
      
      // No checkmate in one found
      return { found: false };
    }
  };

  const updateRestrictedSquares = (pieces: BasePoint[]) => {
    const currentPlayerColor = PLAYER_COLORS[currentPlayerIndex()];
    const currentPlayerPieces = pieces.filter(p => p.color === currentPlayerColor);
    const result = calculateRestrictedSquares(currentPlayerPieces, pieces);
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

    // Update current player
    setCurrentPlayerIndex(prev => (prev + 1) % 4);

    updateRestrictedSquares(newBasePoints);

    // Check for checkmate or stalemate
    const currentPlayerColor = PLAYER_COLORS[currentPlayerIndex()];
    const king = newBasePoints.find(bp => bp.pieceType === 'king' && bp.color === currentPlayerColor);
    let isCheckmate = false;

    if (king) {
      const hasLegalMoves = hasAnyLegalMoves(currentPlayerColor, newBasePoints);
      if (!hasLegalMoves) {
        const inCheck = isKingInCheck(king, newBasePoints);
        if (inCheck) {
          // Checkmate - previous player wins
          isCheckmate = true;
          const winnerIndex = (currentPlayerIndex() - 1 + 4) % 4;
          const winnerColor = PLAYER_COLORS[winnerIndex];
          if (props.onCheckmate) {
            props.onCheckmate(winnerColor);
          }
        } else {
          // Stalemate
          if (props.onStalemate) {
            props.onStalemate();
          }
        }
      }
    }

    // Call callback
    if (props.onMove) {
      props.onMove({ fromX, fromY, toX, toY, isCheckmate });
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
    const isSelected = !!(selected && selected[0] === x && selected[1] === y);
    const isHovered = !!(hovered && hovered[0] === x && hovered[1] === y);
    const isNonPlayable = isInNonPlayableCorner(x, y);

    // Check if this is a valid drop target
    let isValidDrop = false;
    if (isDragging() && pickedUp && isHovered) {
      const legalMoves = getLegalMoves(pickedUp, basePoints());
      isValidDrop = legalMoves.some(move => move.x === x && move.y === y);
    }

    // Check if this square is restricted - only show when dragging
    const index = y * BOARD_CONFIG.GRID_SIZE + x;
    let isRestricted = false;
    
    // When dragging, only show restricted squares for the dragged piece
    if (isDragging() && pickedUp) {
      isRestricted = restrictedSquaresInfo().some(info => 
        info.index === index && 
        info.restrictedBy.some(r => 
          r.basePointX === pickedUp.x && 
          r.basePointY === pickedUp.y
        )
      );
    }

    // Check if this is the current player's king
    const currentPlayerColor = PLAYER_COLORS[currentPlayerIndex()];
    const isCurrentPlayerKing = piece?.pieceType === 'king' && piece.color === currentPlayerColor;

    return {
      isBasePoint,
      isSelected,
      isHovered,
      isNonPlayable,
      isRestricted,
      isCurrentPlayerKing,
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
              <TrainingGridCell
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
