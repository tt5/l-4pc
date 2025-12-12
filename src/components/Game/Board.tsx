import { 
  type Component, 
  type ParentProps,
  createEffect, 
  createSignal,
  batch, 
  createMemo,
  Show,
  onMount,
  onCleanup,
  on,
  For,
  createSelector,
  Accessor,
  Setter
} from 'solid-js';
import { COLOR_MAP } from '~/utils/gameUtils';
import type { PieceType } from '~/types/board';
import { useNavigate } from '@solidjs/router';
import { moveEventService } from '~/lib/server/events/move-events';
import { PLAYER_COLORS, type PlayerColor, isInNonPlayableCorner as isInNonPlayableCornerUtil, normalizeColor, getCurrentPlayerColor } from '~/constants/game';
import { basePointEventService } from '~/lib/server/events/base-point-events';
import { GridCell } from './GridCell';
import { useRestrictedSquares } from '../../contexts/RestrictedSquaresContext';
import { useFetchBasePoints } from '../../hooks/useFetchBasePoints';
import { useSSE } from '../../hooks/useSSE';
import BoardControls from './BoardControls';
import { 
  type Point, 
  type BasePoint,
  type Move,
  createPoint
} from '../../types/board';
import { 
  isBasePoint,
  gridToWorld,
  updateBasePoint,
  indicesToPoints
} from '../../utils/boardUtils';
import styles from './Board.module.css';

// Import shared board configuration
import { BOARD_CONFIG, DEFAULT_GAME_ID } from '~/constants/game';
import { useAuth } from '~/contexts/AuthContext';

// Type guard for PieceType
const isValidPieceType = (str: string): str is PieceType => {
  return ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'].includes(str);
};

// Import team-related utilities
import { getTeamByColor } from '~/constants/game';

const isSquareOccupied = (x: number, y: number, basePoints: BasePoint[]): boolean => {
  return basePoints.some(bp => bp.x === x && bp.y === y);
};

const isTeammate = (x: number, y: number, team: number, basePoints: BasePoint[]): boolean => {
  const point = basePoints.find(bp => bp.x === x && bp.y === y);
  return point ? getTeamByColor(point.color) === team : false;
};

const getSquaresInDirection = (
  startX: number,
  startY: number,
  dx: number,
  dy: number,
  basePoints: BasePoint[],
  currentTeam: number
): {x: number, y: number, canCapture: boolean}[] => {
  const result = [];
  let x = startX + dx;
  let y = startY + dy;
  
  while (x >= 0 && x < BOARD_CONFIG.GRID_SIZE && y >= 0 && y < BOARD_CONFIG.GRID_SIZE) {
    // Skip non-playable corner squares
    if (isInNonPlayableCorner(x, y)) {
      break;
    }
    
    const occupied = isSquareOccupied(x, y, basePoints);
    const piece = basePoints.find(p => p.x === x && p.y === y);
    const teammate = piece ? getTeamByColor(piece.color) === currentTeam : false;
    
    if (occupied) {
      if (!teammate) {
        // Can capture opponent's piece
        result.push({x, y, canCapture: true});
      }
      break;
    }
    
    // Add empty square
    result.push({x, y, canCapture: false});
    x += dx;
    y += dy;
  }
  
  return result;
};

// This is the main function that calculates legal moves for a piece
const getLegalMoves = (
  basePoint: BasePoint,
  allBasePoints: BasePoint[]
): {x: number, y: number, canCapture: boolean}[] => {
  const pieceType = basePoint.pieceType || 'pawn'; // Default to pawn if not specified
  const team = getTeamByColor(basePoint.color);
  
  if (pieceType === 'queen') {
    // Queen moves any number of squares in any direction
    const directions = [
      [0, 1],   // up
      [1, 0],   // right
      [0, -1],  // down
      [-1, 0],  // left
      [1, 1],   // up-right
      [1, -1],  // down-right
      [-1, -1], // down-left
      [-1, 1]   // up-left
    ];
    
    return directions.flatMap(([dx, dy]) => 
      getSquaresInDirection(basePoint.x, basePoint.y, dx, dy, allBasePoints, team)
    );
  } else if (pieceType === 'king') {
    // King moves one square in any direction
    const directions = [
      [0, 1],   // up
      [1, 0],   // right
      [0, -1],  // down
      [-1, 0],  // left
      [1, 1],   // up-right
      [1, -1],  // down-right
      [-1, -1], // down-left
      [-1, 1]   // up-left
    ];
    
    return directions.flatMap(([dx, dy]) => {
      const x = basePoint.x + dx;
      const y = basePoint.y + dy;
      
      // Skip if out of bounds
      if (x < 0 || x >= BOARD_CONFIG.GRID_SIZE || y < 0 || y >= BOARD_CONFIG.GRID_SIZE) {
        return [];
      }
      
      // Check if the square is occupied
      const targetPiece = allBasePoints.find(bp => bp.x === x && bp.y === y);
      
      // If occupied by a teammate, can't move there
      if (targetPiece && getTeamByColor(targetPiece.color) === team) {
        return [];
      }
      
      // If occupied by an enemy, can capture
      const canCapture = targetPiece ? getTeamByColor(targetPiece.color) !== team : false;
      
      return [{
        x,
        y,
        canCapture
      }];
    });
  } else if (pieceType === 'pawn') {
    const moves: {x: number, y: number, canCapture: boolean}[] = [];
    
    // Determine movement direction based on color
    let dx = 0;
    let dy = 0;
    let isVertical = true;
    let startPosition = 0;
    
    // Determine direction toward center based on starting position
    if (basePoint.color === '#F44336') { // Red - starts at bottom, moves up
      dy = -1; // Move up (decreasing y)
      startPosition = BOARD_CONFIG.GRID_SIZE - 2; // Start near bottom
    } else if (basePoint.color === '#FFEB3B') { // Yellow - starts at top, moves down
      dy = 1; // Move down (increasing y)
      startPosition = 1; // Start near top
    } else if (basePoint.color === '#2196F3') { // Blue - starts at left, moves right
      dx = 1; // Move right (increasing x)
      isVertical = false;
      startPosition = 1; // Start near left
    } else if (basePoint.color === '#4CAF50') { // Green - starts at right, moves left
      dx = -1; // Move left (decreasing x)
      isVertical = false;
      startPosition = BOARD_CONFIG.GRID_SIZE - 2; // Start near right
    }
    
    // Check one square forward
    const oneForward = {
      x: basePoint.x + dx,
      y: basePoint.y + dy,
      canCapture: false
    };
    
    // Skip if the target square is in a non-playable corner
    if (!isInNonPlayableCorner(oneForward.x, oneForward.y)) {
      // Check if one square forward is valid and not occupied
      if (oneForward.x >= 0 && oneForward.x < BOARD_CONFIG.GRID_SIZE &&
          oneForward.y >= 0 && oneForward.y < BOARD_CONFIG.GRID_SIZE &&
          !isSquareOccupied(oneForward.x, oneForward.y, allBasePoints)) {
        moves.push(oneForward);
        
        // Check two squares forward from starting position
        const isAtStartPosition = isVertical 
          ? (basePoint.y === startPosition) 
          : (basePoint.x === startPosition);
          
        if (isAtStartPosition) {
          const twoForward = {
            x: basePoint.x + (2 * dx),
            y: basePoint.y + (2 * dy),
            canCapture: false
          };
          
          if (twoForward.x >= 0 && twoForward.x < BOARD_CONFIG.GRID_SIZE &&
              twoForward.y >= 0 && twoForward.y < BOARD_CONFIG.GRID_SIZE &&
              !isSquareOccupied(twoForward.x, twoForward.y, allBasePoints)) {
            moves.push(twoForward);
          }
        }
      }
    }
    
    // Set up capture directions based on pawn movement
    let captureOffsets;
    
    // For vertically moving pawns (Red and Yellow)
    if (isVertical) {
      captureOffsets = [
        { dx: -1, dy: dy },  // Diagonal left
        { dx: 1, dy: dy }    // Diagonal right
      ];
    } 
    // For horizontally moving pawns (Blue and Green)
    else {
      captureOffsets = [
        { dx: dx, dy: -1 },  // Diagonal up
        { dx: dx, dy: 1 }    // Diagonal down
      ];
    }
    
    for (const offset of captureOffsets) {
      const targetX = basePoint.x + offset.dx;
      const targetY = basePoint.y + offset.dy;
      
      // Check if target square is within bounds
      if (targetX >= 0 && targetX < BOARD_CONFIG.GRID_SIZE && 
          targetY >= 0 && targetY < BOARD_CONFIG.GRID_SIZE) {
        
        // Skip non-playable corners
        if (isInNonPlayableCorner(targetX, targetY)) {
          continue;
        }
        
        // Check if there's an opponent's piece to capture
        const targetPiece = allBasePoints.find(p => p.x === targetX && p.y === targetY);
        if (targetPiece && getTeamByColor(targetPiece.color) !== team) {
          moves.push({
            x: targetX,
            y: targetY,
            canCapture: true
          });
        }
      }
    }
    
    return moves;
  } else if (pieceType === 'bishop') {
    // Bishop moves any number of squares diagonally
    const directions = [
      [1, 1],   // up-right
      [1, -1],  // down-right
      [-1, -1], // down-left
      [-1, 1]   // up-left
    ];
    
    return directions.flatMap(([dx, dy]) => 
      getSquaresInDirection(basePoint.x, basePoint.y, dx, dy, allBasePoints, team)
    );
  } else if (pieceType === 'knight') {
    // Knight moves in an L-shape: 2 squares in one direction and then 1 square perpendicular
    const moves = [
      [1, 2],   // right 1, up 2
      [2, 1],   // right 2, up 1
      [2, -1],  // right 2, down 1
      [1, -2],  // right 1, down 2
      [-1, -2], // left 1, down 2
      [-2, -1], // left 2, down 1
      [-2, 1],  // left 2, up 1
      [-1, 2]   // left 1, up 2
    ];

    return moves
      .map(([dx, dy]) => {
        const x = basePoint.x + dx;
        const y = basePoint.y + dy;
        
        // Skip if out of bounds
        if (x < 0 || x >= BOARD_CONFIG.GRID_SIZE || y < 0 || y >= BOARD_CONFIG.GRID_SIZE) {
          return null;
        }
        
        // Skip non-playable corners
        if (isInNonPlayableCorner(x, y)) {
          return null;
        }
        
        // Check if the square is occupied
        const targetPiece = allBasePoints.find(bp => bp.x === x && bp.y === y);
        
        // If occupied by a teammate, can't move there
        if (targetPiece && getTeamByColor(targetPiece.color) === team) {
          return null;
        }
        
        // If occupied by an enemy, can capture
        const canCapture = targetPiece ? getTeamByColor(targetPiece.color) !== team : false;
        
        return {
          x,
          y,
          canCapture
        };
      })
      .filter(Boolean) as {x: number, y: number, canCapture: boolean}[]; // Remove null values and assert type
  } else {
    // Default movement for any other piece type (like rook)
    const directions = [
      [0, 1],   // up
      [1, 0],   // right
      [0, -1],  // down
      [-1, 0]   // left
    ];
    
    return directions.flatMap(([dx, dy]) => 
      getSquaresInDirection(basePoint.x, basePoint.y, dx, dy, allBasePoints, team)
    );
  }
};

const isInNonPlayableCorner = isInNonPlayableCornerUtil;

interface BoardProps {
  gameId?: string;
}

const Board: Component<BoardProps> = (props) => {
  const { gameId: initialGameId = 'default' } = props;
  const auth = useAuth();
  const navigate = useNavigate();
  const [gameId, setGameId] = createSignal<string>(props.gameId || DEFAULT_GAME_ID);
  
  // Initial render setup
  
  // Fetch the latest game ID when the component mounts
  onMount(async () => {
    if (!props.gameId) {
      try {
        const response = await fetch('/api/game/latest');
        if (response.ok) {
          const data = await response.json();
          if (data.gameId) {
            setGameId(data.gameId);
            // Update the URL if we're not already on the game page
            if (!window.location.pathname.includes(data.gameId)) {
              navigate(`/game/${data.gameId}`, { replace: true });
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch latest game ID:', error);
      }
    }
  });
  
  // Track the last loaded game ID and user to prevent unnecessary reloads
  const [lastLoadedState, setLastLoadedState] = createSignal<{
    gameId: string | null;
    userId: string | null;
  }>({ gameId: null, userId: null });
  
  // Track last loaded state changes

  // Load moves when game ID or user changes
  createEffect(() => {
    const currentGameId = gameId();
    const currentUser = auth.user();
    const lastState = lastLoadedState();
    
    // Only load moves if we have a valid game ID and user is logged in
    if (currentGameId && currentUser) {
      if (currentGameId !== lastState.gameId || currentUser.id !== lastState.userId) {
        
        // Reset move history immediately to clear any stale data
        setMoveHistory([]);
        setFullMoveHistory([]);
        setCurrentMoveIndex(-1);
        setCurrentTurnIndex(0);
        
        // Load moves for the current game
        const loadMoves = async () => {
          try {
            const url = `/api/game/${currentGameId}/moves`;
            const headers: HeadersInit = {
              'Content-Type': 'application/json'
            };
            
            // Add auth token if available
            const userToken = auth.getToken();
            if (userToken) {
              headers['Authorization'] = `Bearer ${userToken}`;
            }
            
            const response = await fetch(url, {
              headers
            });
            
            if (response.ok) {
              const data = await response.json();
              const rawMoves = Array.isArray(data?.moves) ? data.moves : [];
              
              // Define the type for the move object from the API
              interface ApiMove {
                id: number;
                gameId: string;
                userId: string;
                pieceType: string;
                fromX: number;
                fromY: number;
                toX: number;
                toY: number;
                moveNumber: number;
                capturedPieceId: number | null;
                createdAtMs: number;
                isBranch?: boolean;
                branchName?: string | null;
              }
              
              // Transform moves to the format expected by updateBoardState
              const moves = rawMoves.map((move: ApiMove) => ({
                from: [move.fromX, move.fromY] as [number, number],
                to: [move.toX, move.toY] as [number, number],
                pieceType: move.pieceType,
                userId: move.userId,
                id: move.id,
                gameId: move.gameId,
                moveNumber: move.moveNumber,
                capturedPieceId: move.capturedPieceId,
                createdAtMs: move.createdAtMs,
                isBranch: move.isBranch || false,
                branchName: move.branchName || null
              }));
              
              // Set the full move history (all moves)
              setFullMoveHistory(moves);

              if (moves.length > 0) {
                // Find the latest move to determine which branch we're on
                const latestMove = moves.reduce((latest: Move, current: Move) => 
                  current.id > latest.id ? current : latest
                );
                
                let movesToApply: Move[] = [];
                
                // If we're on the main line, just show all main line moves
                if (!latestMove.branchName || latestMove.branchName === 'main') {
                  movesToApply = moves.filter((m: Move) => !m.branchName || m.branchName === 'main')
                    .sort((a: Move, b: Move) => a.moveNumber - b.moveNumber);
                } else {
                  // If we're on a branch, find all main line moves up to the branch point
                  const branchName = latestMove.branchName;
                  // Include all moves with this branchName, regardless of isBranch flag
                  const branchMoves = moves.filter((m: Move) => m.branchName === branchName);
                  const branchStartMoveNumber = Math.min(...branchMoves.map((m: Move) => m.moveNumber));
                  
                  // Get all main line moves before the branch starts
                  const mainLineMoves = moves
                    .filter((m: Move) => (!m.branchName || m.branchName === 'main') && m.moveNumber < branchStartMoveNumber)
                    .sort((a: Move, b: Move) => a.moveNumber - b.moveNumber);
                  
                  // Combine main line moves with the branch moves
                  movesToApply = [...mainLineMoves, ...branchMoves]
                    .sort((a, b) => {
                      // Sort by moveNumber first, then put main line moves before branch moves
                      if (a.moveNumber !== b.moveNumber) return a.moveNumber - b.moveNumber;
                      return a.branchName && a.branchName !== 'main' ? 1 : -1; // Main line first, then branch
                    });
                }
                
                // Update the board state with the calculated moves
                // Batch the state updates to prevent unnecessary re-renders
                batch(() => {
                  setMoveHistory(movesToApply);
                  // Only update the index if it's not already set to the correct value
                  const newIndex = movesToApply.length > 0 ? movesToApply.length - 1 : -1;
                  if (currentMoveIndex() !== newIndex) {
                    setCurrentMoveIndex(newIndex);
                  }
                  setCurrentTurnIndex(movesToApply.length % PLAYER_COLORS.length);
                  updateBoardState(movesToApply);
                });
              } else {
                // No moves, reset to initial position
                batch(() => {
                  setMoveHistory([]);
                  setCurrentMoveIndex(-1);
                  setCurrentTurnIndex(0);
                  setBasePoints([...INITIAL_BASE_POINTS]);
                });
              }
              
              // Update last loaded state
              const newState = {
                gameId: currentGameId,
                userId: currentUser.id
              };
              setLastLoadedState(newState);
            } else {
              const errorText = await response.text();
              console.error('[BOARD] Failed to load moves:', {
                status: response.status,
                statusText: response.statusText,
                error: errorText
              });
              setMoveHistory([]);
              setCurrentTurnIndex(0);
            }
          } catch (error) {
            console.error('[BOARD] Error loading moves:', {
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined
            });
            setMoveHistory([]);
            setCurrentTurnIndex(0);
          }
        };
        
        loadMoves();
      }
    } else {
      // Clear state if no game ID or user
      batch(() => {
        setMoveHistory([]);
        setFullMoveHistory([]);
        setCurrentMoveIndex(-1);
        setCurrentTurnIndex(0);
        setLastLoadedState({ gameId: null, userId: null });
      });
    }
  });

  // Listen for move events
  createEffect(() => {
    const handleMoveMade = (move: Move) => {
      // Only add the move if it's not already in the history
      setMoveHistory(prev => {
        const exists = prev.some(m => 
          m.id === move.id || 
          (m.fromX === move.fromX && 
           m.fromY === move.fromY && 
           m.toX === move.toX && 
           m.toY === move.toY &&
           m.timestamp === move.timestamp)
        );
        return exists ? prev : [...prev, move];
      });
    };

    // Subscribe to move events
    moveEventService.onMoveMade(handleMoveMade);

    // Cleanup on unmount
    onCleanup(() => {
      moveEventService.offMoveMade(handleMoveMade);
    });
  });

  // Clean up drag state
  const cleanupDragState = () => {
    setIsDragging(false);
    setPickedUpBasePoint(null);
    setHoveredCell(null);
    setTargetPosition(null);
    setDragStartPosition(null);
    setIsProcessingMove(false);
    setLastHoveredCell(null);
    setDragStartPosition(null);
    setTargetPosition(null);
    setError(null);
  };

  // Use the imported getTeamByColor from game constants
  const getTeam = getTeamByColor;
  
  // Track which squares have kings in check
  const [kingsInCheck, setKingsInCheck] = createSignal<{[key: string]: boolean}>({});
  
  // Check if the current player's king is in check
  const checkKingInCheck = (): void => {
    const allBasePoints = basePoints();
    const restrictedSquares = getRestrictedSquares();
    const restrictedInfo = restrictedSquaresInfo();
    const currentPlayer = currentPlayerColor();
    
    // Reset king in check state
    setKingInCheck(null);
    
    // Get all kings on the board
    const allKings = allBasePoints.filter(bp => bp.pieceType === 'king');
    
    // Map color names to hex codes for comparison
    const colorMap: Record<string, string> = {
      'red': '#f44336',
      'blue': '#2196f3',
      'yellow': '#ffeb3b',
      'green': '#4caf50'
    };
    
    // Find the current player's king
    const currentPlayerKing = allBasePoints.find(bp => {
      const isKing = bp.pieceType === 'king';
      const currentPlayerHex = colorMap[currentPlayer.toLowerCase()] || currentPlayer.toLowerCase();
      const matchesColor = bp.color.toLowerCase() === currentPlayerHex;
      
      return isKing && matchesColor;
    });
    
    if (!currentPlayerKing) {
      return;
    }
    
    const kingIndex = currentPlayerKing.y * BOARD_CONFIG.GRID_SIZE + currentPlayerKing.x;
    const kingTeam = getTeam(currentPlayerKing.color);
    const isKingOnRestrictedSquare = restrictedSquares.includes(kingIndex);
    
    if (!isKingOnRestrictedSquare) {
      return;
    }
    
    // Get all restrictions on the king's square
    const restrictions = restrictedInfo.filter(sq => sq.index === kingIndex);
    
    // Find all pieces that are restricting this square
    const threateningPieces = [];
    
    for (const restriction of restrictions) {
      for (const r of restriction.restrictedBy) {
        // Find the piece that's causing this restriction
        const attacker = allBasePoints.find(bp => 
          bp.x === r.basePointX && 
          bp.y === r.basePointY
        );
        
        if (attacker) {
          const attackerTeam = getTeam(attacker.color);
          const isOpponent = attackerTeam !== kingTeam;
          
          if (isOpponent) {
            threateningPieces.push({
              ...attacker,
              team: attackerTeam
            });
          }
        }
      }
    }
    
    if (threateningPieces.length > 0) {
      // King is in check
      
      setKingInCheck({
        team: kingTeam,
        position: [currentPlayerKing.x, currentPlayerKing.y]
      });
    } else {
      // King is not in check
    }
  };

  // Helper function to check if a square is under attack by any piece of the given team
  const isSquareUnderAttack = (x: number, y: number, attackingTeam: number): boolean => {
    return basePoints().some(attacker => {
      if (getTeam(attacker.color) !== attackingTeam) return false;
      return canPieceAttack(attacker, x, y);
    });
  };

  // Helper function to check if a piece can attack a specific square
  const canPieceAttack = (piece: BasePoint, targetX: number, targetY: number): boolean => {
    const dx = Math.abs(piece.x - targetX);
    const dy = Math.abs(piece.y - targetY);
    
    // King movement (1 square in any direction)
    if (piece.pieceType === 'king') {
      return dx <= 1 && dy <= 1;
    }
    
    // Queen movement (any number of squares in any direction)
    if (piece.pieceType === 'queen') {
      // Check if on same row, column, or diagonal
      if (piece.x === targetX || piece.y === targetY || dx === dy) {
        // Check if path is clear
        return isPathClear(piece.x, piece.y, targetX, targetY);
      }
      return false;
    }
    
    // Add other piece types as needed (rooks, bishops, knights, pawns)
    
    return false;
  };

  // Helper function to check if the path between two squares is clear
  const isPathClear = (x1: number, y1: number, x2: number, y2: number): boolean => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    
    // For each square along the path (excluding start and end)
    for (let i = 1; i < steps; i++) {
      const x = x1 + Math.sign(dx) * i;
      const y = y1 + Math.sign(dy) * i;
      
      // If we've reached the target square, the path is clear
      if (x === x2 && y === y2) break;
      
      // If there's a piece in the way, the path is not clear
      if (basePoints().some(p => p.x === x && p.y === y)) {
        return false;
      }
    }
    
    return true;
  };

  // Helper function to check if a square is between two other squares in a straight line
  const isSquareBetween = (from: BasePoint, to: BasePoint, x: number, y: number): boolean => {
    // Check if all three points are in a straight line
    const dx1 = to.x - from.x;
    const dy1 = to.y - from.y;
    const dx2 = x - from.x;
    const dy2 = y - from.y;
    
    // If not in a straight line, return false
    if (dx1 * dy2 !== dx2 * dy1) return false;
    
    // Check if (x,y) is between from and to
    const isBetweenX = (from.x <= x && x <= to.x) || (from.x >= x && x >= to.x);
    const isBetweenY = (from.y <= y && y <= to.y) || (from.y >= y && y >= to.y);
    
    return isBetweenX && isBetweenY && (x !== from.x || y !== from.y) && (x !== to.x || y !== to.y);
  };

  // Helper function to check if a move would resolve a check
  const wouldResolveCheck = (from: Point, to: Point, color: string): boolean => {
    const currentCheck = kingInCheck();
    if (!currentCheck) return true;
    
    // Only enforce check resolution for the current player's team
    if (getTeam(color) !== currentCheck.team) return true;
    
    const movingPiece = basePoints().find(bp => bp.x === from[0] && bp.y === from[1]);
    if (!movingPiece) return false;

    // If the piece being moved is the king, check if the new position is safe
    if (movingPiece.pieceType === 'king') {
      // For king moves, just check if the new position is under attack
      return !isSquareUnderAttack(to[0], to[1], getTeam(color) === 1 ? 2 : 1);
    }

    // For other pieces, they must block or capture the attacking piece
    const king = basePoints().find(bp => 
      bp.pieceType === 'king' && 
      getTeam(bp.color) === currentCheck.team
    );
    if (!king) return false;

    // Get all squares that are attacking the king
    const attackers = basePoints().filter(attacker => 
      getTeam(attacker.color) !== currentCheck.team &&
      canPieceAttack(attacker, king.x, king.y)
    );

    // If there are multiple attackers, only a king move can resolve check
    if (attackers.length > 1) {
      return false;
    }

    const attacker = attackers[0];
    // Check if the move captures the attacker
    if (to[0] === attacker.x && to[1] === attacker.y) {
      // If the attacker is a king, allow capturing it even if in check
      if (attacker.pieceType === 'king') {
        return true;
      }
      // For other pieces, check if this capture resolves the check
      return true;
    }

    // Check if the move blocks the attack
    if (isSquareBetween(attacker, king, to[0], to[1])) {
      return true;
    }

    return false;
  };

  // Helper function to validate square placement
  const validateSquarePlacementLocal = (index: number) => {
    // Get the current user's base points
    const userBasePoints = basePoints();
    const pickedUp = pickedUpBasePoint();
    
    // Get the target position in world coordinates
    const [gridX, gridY] = indicesToPoints([index])[0];
    
    // If we're moving a base point
    if (pickedUp) {
      const [startX, startY] = pickedUp;
      const movingPiece = userBasePoints.find(bp => bp.x === startX && bp.y === startY);
      
      if (!movingPiece) {
        return { isValid: false, reason: 'Piece not found' };
      }

      // First check if this is a valid capture move based on server response
      const restrictionInfo = restrictedSquaresInfo().find(sq => sq.index === index);
      const isRestrictedByPickedUp = restrictionInfo?.restrictedBy.some(
        restriction => 
          restriction.basePointX === pickedUp[0] && 
          restriction.basePointY === pickedUp[1]
      );

      // If this is a restricted square (including captures), check if it's a valid move
      if (isRestrictedByPickedUp) {
        // Check if the move captures an enemy king
        const targetPiece = basePoints().find(bp => bp.x === gridX && bp.y === gridY);
        const isCapturingEnemyKing = targetPiece?.pieceType === 'king' && getTeam(targetPiece.color) !== getTeam(movingPiece.color);
        
        // If not capturing an enemy king, apply normal check rules
        if (!isCapturingEnemyKing) {
          // If the piece being moved is a king, check if the target square is under attack
          if (movingPiece.pieceType === 'king') {
            const opponentTeam = getTeam(movingPiece.color) === 1 ? 2 : 1;
            if (isSquareUnderAttack(gridX, gridY, opponentTeam)) {
              return {
                isValid: false,
                reason: 'Cannot move king into check'
              };
            }
          }
          
          // If the current player's king is in check, verify the move resolves it
          const currentCheck = kingInCheck();
          if (currentCheck && getTeam(movingPiece.color) === currentCheck.team) {
            if (!wouldResolveCheck([startX, startY], [gridX, gridY], movingPiece.color)) {
              return { 
                isValid: false, 
                reason: 'You must move your king out of check, block the check, or capture the threatening piece' 
              };
            }
          }
        }
        
        return { isValid: true };
      }

      // If not a restricted square, check for friendly pieces
      if (userBasePoints.some(bp => 
        bp.x === gridX && 
        bp.y === gridY && 
        !(bp.x === pickedUp[0] && bp.y === pickedUp[1])
      )) {
        return { isValid: false, reason: 'You already have a base point here' };
      }
      
      // If we get here, it's not a restricted square and not occupied by a friendly piece
      return { 
        isValid: false, 
        reason: 'Base points can only be moved to squares they restrict' 
      };
    }
    
    // For new base points, check if the user already has a base point at the target position
    if (userBasePoints.some(bp => bp.x === gridX && bp.y === gridY)) {
      return { isValid: false, reason: 'You already have a base point here' };
    }
    
    // For new base points, they can only be placed on restricted squares
    if (!getRestrictedSquares().includes(index)) {
      return { 
        isValid: false, 
        reason: 'Base points can only be placed on restricted squares' 
      };
    }
    
    return { isValid: true };
  };
  // Refs
  let boardRef: HTMLDivElement | undefined;
  
  // Hooks
  const { user } = useAuth();
  
  // State with explicit types
  const currentUser = user();
  
  // Get restricted squares from context
  const {
    restrictedSquares: getRestrictedSquares,
    setRestrictedSquares
  } = useRestrictedSquares();
  
  // State variables
  const [isSaving, setIsSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [dragStartPosition, setDragStartPosition] = createSignal<[number, number] | null>(null);
  const [pickedUpBasePoint, setPickedUpBasePoint] = createSignal<[number, number] | null>(null);
  const [isDragging, setIsDragging] = createSignal(false);
  const [targetPosition, setTargetPosition] = createSignal<[number, number] | null>(null);
  const [isProcessingMove, setIsProcessingMove] = createSignal(false);
  const [hoveredCell, setHoveredCell] = createSignal<[number, number] | null>(null);
  
  // Full move history from the server
  const [fullMoveHistory, setFullMoveHistory] = createSignal<Move[]>([]);
  // Track the main line moves (original game line without branches)
  const [mainLineMoves, setMainLineMoves] = createSignal<Move[]>([]);
  // Current move history up to the current position
  const [moveHistory, setMoveHistory] = createSignal<Move[]>([]);
  // Current position in the move history (for going back/forward)
  const [currentMoveIndex, setCurrentMoveIndex] = createSignal(-1);
  // Branch name for the current move (if any)
  const [currentBranchName, setCurrentBranchName] = createSignal<string | null>(null);
  // Track the next main line move when returning from a branch
  const [currentMainLineMove, setCurrentMainLineMove] = createSignal<{index: number, move: Move} | null>(null);
  
  // Track branch points and their associated branches
  const [branchPoints, setBranchPoints] = createSignal<Record<number, Array<{
    branchName: string;
    firstMove: Move;
  }>>>({});


  // No longer logging board state after login

  // Generate a branch name with optional parent branch path
  const generateBranchName = (moveNumber: number, parentBranch: string | null = null): string => {
    const timestamp = Date.now().toString(36).slice(-4);
    const branchSuffix = `branch-${moveNumber}-${timestamp}`;
    return parentBranch ? `${parentBranch}/${branchSuffix}` : branchSuffix;
  };

  // Rebuild move history for a given target branch, handling nested branches
  const rebuildMoveHistory = (targetBranch: string | null): Move[] => {
    const branchPath = targetBranch?.split('/') || [];
    let history: Move[] = [];
    
    // Start with main line
    let currentHistory = fullMoveHistory().filter(m => !m.branchName || m.branchName === 'main');
    
    for (const branch of branchPath) {
      const branchMoves = fullMoveHistory().filter(m => 
        m.branchName && m.branchName.endsWith(branch)
      );
      
      if (branchMoves.length > 0) {
        const branchPoint = Math.min(...branchMoves.map(m => m.moveNumber));
        currentHistory = [
          ...currentHistory.filter(m => m.moveNumber < branchPoint),
          ...branchMoves
        ];
      }
    }
    
    return currentHistory;
  };

  // Track rendered moves to debug highlighting
  const renderedMoves = new Set<number>();
  
  // Clean up currentMove class when component unmounts or moves change
  onCleanup(() => {
    document.querySelectorAll(`.${styles.currentMove}`).forEach(el => {
      el.classList.remove(styles.currentMove);
      el.setAttribute('data-is-current', 'false');
    });
  });
  
  const [currentTurnIndex, setCurrentTurnIndex] = createSignal(0);
  const currentPlayerColor = () => PLAYER_COLORS[currentTurnIndex() % PLAYER_COLORS.length];
  
  // Update the base points based on the current move history
  const updateBoardState = (moves: Move[]) => {
    console.group('updateBoardState');
    console.log('Starting board state update with moves:', moves);
    
    // Always start with a fresh copy of the initial board state when replaying moves
    // This ensures consistent move replay from the initial position
    const currentBasePoints = JSON.parse(JSON.stringify(INITIAL_BASE_POINTS));
    
    // Clear any lingering currentMove classes
    document.querySelectorAll(`.${styles.currentMove}`).forEach(el => {
      el.classList.remove(styles.currentMove);
      el.setAttribute('data-is-current', 'false');
    });
    
    // Create a map of positions to pieces
    const positionMap = new Map<string, BasePoint>();
    currentBasePoints.forEach((point: BasePoint) => {
      positionMap.set(`${point.x},${point.y}`, { ...point });
    });
    
    // Apply each move in sequence
    moves.forEach((move, index) => {
      // Use flat coordinate format
      const fromX = move.fromX;
      const fromY = move.fromY;
      const toX = move.toX;
      const toY = move.toY;
      const pieceType = move.pieceType;
      
      const fromKey = `${fromX},${fromY}`;
      const toKey = `${toX},${toY}`;
      
      // Skip if we don't have valid coordinates
      if (fromX === undefined || fromY === undefined || toX === undefined || toY === undefined) {
        return;
      }
      
      // Find the piece being moved
      const piece = positionMap.get(fromKey);
      if (!piece) {
        return; // Skip this move if source piece not found
      }
      // Check for capture first (before we move the piece)
      if (positionMap.has(toKey)) {
        const capturedPiece = positionMap.get(toKey);
        if (capturedPiece) {
          positionMap.delete(toKey);
        }
      }
      
      // Create a new piece object with updated position and type
      const movedPiece: BasePoint = {
        ...piece,
        x: toX,
        y: toY,
        // Use the pieceType from the move if valid, otherwise keep the existing one
        pieceType: (pieceType && isValidPieceType(pieceType)) ? pieceType : piece.pieceType,
        hasMoved: true
      };
      
      // Remove the piece from its old position
      positionMap.delete(fromKey);
      
      // If there's a piece at the target position, remove it first (capture)
      if (positionMap.has(toKey)) {
        positionMap.delete(toKey);
      }
      
      // Place the moved piece in the new position
      positionMap.set(toKey, movedPiece);
    });
    
    // Update the base points with the new positions
    const updatedBasePoints = Array.from(positionMap.values());
    setBasePoints(updatedBasePoints);
  };
  
  // Initial board setup - matches the reset-board.ts configuration
  const INITIAL_BASE_POINTS: BasePoint[] = [
    // Yellow pieces (top)
    { id: 1, x: 7, y: 0, userId: 'system', color: '#FFEB3B', pieceType: 'queen', team: 1, createdAtMs: Date.now() },
    { id: 2, x: 8, y: 0, userId: 'system', color: '#FFEB3B', pieceType: 'bishop', team: 1, createdAtMs: Date.now() },
    { id: 3, x: 6, y: 0, userId: 'system', color: '#FFEB3B', pieceType: 'king', team: 1, createdAtMs: Date.now() },
    { id: 4, x: 5, y: 0, userId: 'system', color: '#FFEB3B', pieceType: 'bishop', team: 1, createdAtMs: Date.now() },
    { id: 5, x: 4, y: 0, userId: 'system', color: '#FFEB3B', pieceType: 'knight', team: 1, createdAtMs: Date.now() },
    { id: 6, x: 9, y: 0, userId: 'system', color: '#FFEB3B', pieceType: 'knight', team: 1, createdAtMs: Date.now() },
    { id: 7, x: 3, y: 0, userId: 'system', color: '#FFEB3B', pieceType: 'rook', team: 1, createdAtMs: Date.now() },
    { id: 8, x: 10, y: 0, userId: 'system', color: '#FFEB3B', pieceType: 'rook', team: 1, createdAtMs: Date.now() },
    { id: 9, x: 7, y: 1, userId: 'system', color: '#FFEB3B', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
    { id: 10, x: 6, y: 1, userId: 'system', color: '#FFEB3B', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
    { id: 11, x: 8, y: 1, userId: 'system', color: '#FFEB3B', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
    { id: 12, x: 5, y: 1, userId: 'system', color: '#FFEB3B', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
    { id: 13, x: 4, y: 1, userId: 'system', color: '#FFEB3B', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
    { id: 14, x: 9, y: 1, userId: 'system', color: '#FFEB3B', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
    { id: 15, x: 3, y: 1, userId: 'system', color: '#FFEB3B', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
    { id: 16, x: 10, y: 1, userId: 'system', color: '#FFEB3B', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
    
    // Red pieces (bottom)
    { id: 17, x: 6, y: 13, userId: 'system', color: '#F44336', pieceType: 'queen', team: 1, createdAtMs: Date.now() },
    { id: 18, x: 5, y: 13, userId: 'system', color: '#F44336', pieceType: 'bishop', team: 1, createdAtMs: Date.now() },
    { id: 19, x: 7, y: 13, userId: 'system', color: '#F44336', pieceType: 'king', team: 1, createdAtMs: Date.now() },
    { id: 20, x: 8, y: 13, userId: 'system', color: '#F44336', pieceType: 'bishop', team: 1, createdAtMs: Date.now() },
    { id: 21, x: 4, y: 13, userId: 'system', color: '#F44336', pieceType: 'knight', team: 1, createdAtMs: Date.now() },
    { id: 22, x: 9, y: 13, userId: 'system', color: '#F44336', pieceType: 'knight', team: 1, createdAtMs: Date.now() },
    { id: 23, x: 3, y: 13, userId: 'system', color: '#F44336', pieceType: 'rook', team: 1, createdAtMs: Date.now() },
    { id: 24, x: 10, y: 13, userId: 'system', color: '#F44336', pieceType: 'rook', team: 1, createdAtMs: Date.now() },
    { id: 25, x: 6, y: 12, userId: 'system', color: '#F44336', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
    { id: 26, x: 7, y: 12, userId: 'system', color: '#F44336', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
    { id: 27, x: 5, y: 12, userId: 'system', color: '#F44336', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
    { id: 28, x: 8, y: 12, userId: 'system', color: '#F44336', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
    { id: 29, x: 4, y: 12, userId: 'system', color: '#F44336', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
    { id: 30, x: 9, y: 12, userId: 'system', color: '#F44336', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
    { id: 31, x: 3, y: 12, userId: 'system', color: '#F44336', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
    { id: 32, x: 10, y: 12, userId: 'system', color: '#F44336', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
    
    // Blue pieces (left)
    { id: 33, x: 0, y: 6, userId: 'system', color: '#2196F3', pieceType: 'queen', team: 2, createdAtMs: Date.now() },
    { id: 34, x: 0, y: 5, userId: 'system', color: '#2196F3', pieceType: 'bishop', team: 2, createdAtMs: Date.now() },
    { id: 35, x: 0, y: 7, userId: 'system', color: '#2196F3', pieceType: 'king', team: 2, createdAtMs: Date.now() },
    { id: 36, x: 0, y: 8, userId: 'system', color: '#2196F3', pieceType: 'bishop', team: 2, createdAtMs: Date.now() },
    { id: 37, x: 0, y: 4, userId: 'system', color: '#2196F3', pieceType: 'knight', team: 2, createdAtMs: Date.now() },
    { id: 38, x: 0, y: 9, userId: 'system', color: '#2196F3', pieceType: 'knight', team: 2, createdAtMs: Date.now() },
    { id: 39, x: 0, y: 3, userId: 'system', color: '#2196F3', pieceType: 'rook', team: 2, createdAtMs: Date.now() },
    { id: 40, x: 0, y: 10, userId: 'system', color: '#2196F3', pieceType: 'rook', team: 2, createdAtMs: Date.now() },
    { id: 41, x: 1, y: 6, userId: 'system', color: '#2196F3', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
    { id: 42, x: 1, y: 7, userId: 'system', color: '#2196F3', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
    { id: 43, x: 1, y: 5, userId: 'system', color: '#2196F3', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
    { id: 44, x: 1, y: 8, userId: 'system', color: '#2196F3', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
    { id: 45, x: 1, y: 4, userId: 'system', color: '#2196F3', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
    { id: 46, x: 1, y: 9, userId: 'system', color: '#2196F3', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
    { id: 47, x: 1, y: 3, userId: 'system', color: '#2196F3', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
    { id: 48, x: 1, y: 10, userId: 'system', color: '#2196F3', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
    
    // Green pieces (right)
    { id: 49, x: 13, y: 7, userId: 'system', color: '#4CAF50', pieceType: 'queen', team: 2, createdAtMs: Date.now() },
    { id: 50, x: 13, y: 8, userId: 'system', color: '#4CAF50', pieceType: 'bishop', team: 2, createdAtMs: Date.now() },
    { id: 51, x: 13, y: 6, userId: 'system', color: '#4CAF50', pieceType: 'king', team: 2, createdAtMs: Date.now() },
    { id: 52, x: 13, y: 5, userId: 'system', color: '#4CAF50', pieceType: 'bishop', team: 2, createdAtMs: Date.now() },
    { id: 53, x: 13, y: 4, userId: 'system', color: '#4CAF50', pieceType: 'knight', team: 2, createdAtMs: Date.now() },
    { id: 54, x: 13, y: 9, userId: 'system', color: '#4CAF50', pieceType: 'knight', team: 2, createdAtMs: Date.now() },
    { id: 55, x: 13, y: 3, userId: 'system', color: '#4CAF50', pieceType: 'rook', team: 2, createdAtMs: Date.now() },
    { id: 56, x: 13, y: 10, userId: 'system', color: '#4CAF50', pieceType: 'rook', team: 2, createdAtMs: Date.now() },
    { id: 57, x: 12, y: 7, userId: 'system', color: '#4CAF50', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
    { id: 58, x: 12, y: 6, userId: 'system', color: '#4CAF50', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
    { id: 59, x: 12, y: 8, userId: 'system', color: '#4CAF50', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
    { id: 60, x: 12, y: 5, userId: 'system', color: '#4CAF50', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
    { id: 61, x: 12, y: 4, userId: 'system', color: '#4CAF50', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
    { id: 62, x: 12, y: 9, userId: 'system', color: '#4CAF50', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
    { id: 63, x: 12, y: 3, userId: 'system', color: '#4CAF50', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
    { id: 64, x: 12, y: 10, userId: 'system', color: '#4CAF50', pieceType: 'pawn', team: 2, createdAtMs: Date.now() }
  ];

  // Helper function to get initial base points
  const fetchInitialBasePoints = (): Promise<BasePoint[]> => {
    return Promise.resolve(JSON.parse(JSON.stringify(INITIAL_BASE_POINTS)));
  };

  // Helper function to find the next move in the current branch
  const findNextMoveInBranch = (
    history: Move[],
    currentIndex: number,
    currentBranch: string,
    allBranchPoints: Record<number, any[]>,
    getCurrentMoveIndex: () => number
  ): { nextIndex: number; nextMove: Move } | null => {
    // If not in a branch or on main, return the next move directly
    if (!currentBranch || currentBranch === 'main') {
      const nextIndex = currentIndex + 1;
      return nextIndex < history.length 
        ? { nextIndex, nextMove: history[nextIndex] } 
        : null;
    }

    // Find all moves in the current branch
    const branchMoves = history.filter(move => move.branchName === currentBranch);
    
    if (branchMoves.length === 0) {
      console.log('[Forward] No moves found in current branch, cannot go forward');
      return null;
    }

    // Find the current position in the branch
    let currentBranchIndex = -1;
    
    // First, try to find the current move in the branch using move ID for exact matching
    if (currentIndex >= 0 && currentIndex < history.length) {
      const currentMove = history[currentIndex];
      
      // First try to match by ID if available (most reliable)
      if (currentMove.id) {
        currentBranchIndex = branchMoves.findIndex(move => 
          move.id === currentMove.id
        );
      }
      
      // If not found by ID, try matching by coordinates and timestamp
      if (currentBranchIndex === -1) {
        currentBranchIndex = branchMoves.findIndex(move => 
          move.fromX === currentMove.fromX && 
          move.fromY === currentMove.fromY && 
          move.toX === currentMove.toX && 
          move.toY === currentMove.toY &&
          move.timestamp === currentMove.timestamp
        );
      }
      
      // If still not found, try matching just by coordinates (least reliable)
      if (currentBranchIndex === -1) {
        currentBranchIndex = branchMoves.findIndex(move => 
          move.fromX === currentMove.fromX && 
          move.fromY === currentMove.fromY && 
          move.toX === currentMove.toX && 
          move.toY === currentMove.toY
        );
      }
      
      console.log(`[Forward] Current move in branch: index=${currentBranchIndex}, move=`, 
        currentBranchIndex >= 0 ? branchMoves[currentBranchIndex] : 'not found');
    }
    
    // If current move not found in branch, use the last move before the branch point
    if (currentBranchIndex === -1) {
      // Get the current branch point from branchPoints if it exists
      const currentBranchPoints = allBranchPoints[getCurrentMoveIndex()];
      if (currentBranchPoints && currentBranchPoints.length > 0) {
        // Use the first branch point's first move as the reference
        const branchRefMove = currentBranchPoints[0].firstMove;
        // Find the index of the branch point in the branch
        currentBranchIndex = branchMoves.findIndex(move => 
          move.fromX === branchRefMove.fromX && 
          move.fromY === branchRefMove.fromY && 
          move.toX === branchRefMove.toX && 
          move.toY === branchRefMove.toY
        ) - 1; // Go to the move before the branch point
      } else {
        currentBranchIndex = -1; // Start from the beginning of the branch
      }
    }
    
    // If we're at the end of the branch, don't go further
    if (currentBranchIndex >= branchMoves.length - 1) {
      console.log('[Forward] Already at the latest move in this branch');
      return null;
    }
    
    // Get the next move in this branch
    const nextMoveInBranch = branchMoves[currentBranchIndex + 1];
    
    // Find the actual index of this move in the full history
    const nextIndex = history.findIndex(move => 
      move.fromX === nextMoveInBranch.fromX && 
      move.fromY === nextMoveInBranch.fromY && 
      move.toX === nextMoveInBranch.toX && 
      move.toY === nextMoveInBranch.toY &&
      move.branchName === currentBranch
    );
    
    if (nextIndex === -1) {
      console.error('[Forward] Could not find next move in full history');
      return null;
    }
    
    return { nextIndex, nextMove: history[nextIndex] };
  };

  // Helper function to apply a move to the board state
  const applyMoveToBoard = (
    basePoints: BasePoint[],
    move: Move
  ): { updatedBasePoints: BasePoint[]; capturedPiece: BasePoint | null } => {
    const updatedBasePoints = [...basePoints];
    const { fromX, fromY, toX, toY } = move;
    let capturedPiece: BasePoint | null = null;
    
    // Find and move the piece
    const pieceIndex = updatedBasePoints.findIndex(p => p.x === fromX && p.y === fromY);
    
    if (pieceIndex === -1) {
      console.warn(`[Move] No piece found at [${fromX},${fromY}] to move`);
      return { updatedBasePoints, capturedPiece: null };
    }

    const piece = updatedBasePoints[pieceIndex];
    console.log(`[Move] Moving piece ${piece.id} (${piece.pieceType}) from [${fromX},${fromY}] to [${toX},${toY}]`);
    
    // If this move captures a piece, remove it
    if (move.capturedPieceId) {
      const capturedPieceIndex = updatedBasePoints.findIndex(p => p.id === move.capturedPieceId);
      if (capturedPieceIndex !== -1) {
        capturedPiece = updatedBasePoints[capturedPieceIndex];
        console.log(`[Move] Capturing piece ${capturedPiece.id} (${capturedPiece.pieceType}) at [${toX},${toY}]`);
        updatedBasePoints.splice(capturedPieceIndex, 1);
      }
    }
    
    // Update the piece's position
    updatedBasePoints[pieceIndex] = {
      ...piece,
      x: toX,
      y: toY,
      hasMoved: true
    };

    return { updatedBasePoints, capturedPiece };
  };

  // Handle going forward one move in history
  const handleGoForward = async () => {
    console.log('[Forward] Forward button pressed');
    const currentIndex = currentMoveIndex();
    const history = fullMoveHistory();
    const currentBranch = currentBranchName();
    
    console.log(`[Forward] Current index: ${currentIndex}, Total moves: ${history.length - 1}, Branch: ${currentBranch || 'main'}`);
    
    if (currentIndex >= history.length - 1) {
      console.log('[Forward] Already at the latest move, cannot go forward');
      return;
    }

    const nextMoveInfo = findNextMoveInBranch(
      history,
      currentIndex,
      currentBranch || '',
      branchPoints(),
      currentMoveIndex
    );
    
    if (!nextMoveInfo) return;
    
    const { nextIndex, nextMove } = nextMoveInfo;
    
    try {
      const currentBasePoints = [...basePoints()];
      
      // Apply the move to get new board state
      const { updatedBasePoints } = applyMoveToBoard(currentBasePoints, nextMove);
      
      // Update the board state and move index
      setBasePoints(updatedBasePoints);
      setCurrentMoveIndex(nextIndex);
      console.log(`[Forward] Move index updated to ${nextIndex}`);
      
      // Update the current branch if this move is part of a branch
      if (nextMove.branchName && nextMove.branchName !== currentBranch) {
        setCurrentBranchName(nextMove.branchName);
        console.log(`[Forward] Switched to branch: ${nextMove.branchName}`);
      }
      
      // Update turn to the next player
      const newTurnIndex = (nextIndex + 1) % PLAYER_COLORS.length;
      setCurrentTurnIndex(newTurnIndex);
      console.log(`[Forward] Turn updated to player ${newTurnIndex} (${PLAYER_COLORS[newTurnIndex]})`);
      
      // Recalculate legal moves for the current player
      const currentPlayerPieces = currentBasePoints.filter(p => {
        // Get the expected color for the current turn
        const expectedColor = PLAYER_COLORS[newTurnIndex];
        // Get the mapped color if it exists
        const mappedColor = {
          'blue': '#2196F3',
          'red': '#F44336',
          'yellow': '#FFEB3B',
          'green': '#4CAF50'
        }[expectedColor.toLowerCase()] || expectedColor;
        
        // Compare with both the direct color and the mapped color
        return p.color && (p.color === expectedColor || p.color === mappedColor);
      });
      
      const newRestrictedSquares: number[] = [];
      const newRestrictedSquaresInfo: Array<{
        index: number;
        x: number;
        y: number;
        restrictedBy: Array<{ 
          basePointId: string; 
          basePointX: number; 
          basePointY: number; 
          direction?: string;
        }>;
      }> = [];
      
      // Calculate restricted squares and their info
      for (const piece of currentPlayerPieces) {
        const moves = getLegalMoves(piece, currentBasePoints);
        
        for (const move of moves) {
          const { x, y } = move;
          const index = y * BOARD_CONFIG.GRID_SIZE + x;
          
          if (!newRestrictedSquares.includes(index)) {
            newRestrictedSquares.push(index);
          }
          
          // Find if we already have info for this square
          const existingInfo = newRestrictedSquaresInfo.find(info => 
            info.x === x && info.y === y
          );
          
          if (existingInfo) {
            existingInfo.restrictedBy.push({
              basePointId: piece.id.toString(),
              basePointX: piece.x,
              basePointY: piece.y,
              direction: undefined // Optional, so we can omit or set as undefined
            });
          } else {
            newRestrictedSquaresInfo.push({
              index,
              x,
              y,
              restrictedBy: [{
                basePointId: piece.id.toString(),
                basePointX: piece.x,
                basePointY: piece.y,
                direction: undefined // Optional, so we can omit or set as undefined
              }]
            });
          }
        }
      }
      
      setRestrictedSquares(newRestrictedSquares);
      setRestrictedSquaresInfo(newRestrictedSquaresInfo);
      
      // Clear any previous errors
      setError('');
      
    } catch (error) {
      console.error('Error in handleGoForward:', error);
      setError('Failed to go forward. Please try again.');
    }
  };

  // Reset the board to its initial state
  const resetBoardToInitialState = () => {
    setBasePoints(JSON.parse(JSON.stringify(INITIAL_BASE_POINTS)));
    setCurrentMoveIndex(-1);
    setCurrentBranchName(null);
    setCurrentTurnIndex(0);
  };

  // Handle going back one move in history
  const handleGoBack = async () => {
    const currentIndex = currentMoveIndex();
    const history = fullMoveHistory();
    
    if (history.length === 0 || currentIndex === -1) {
      return;
    }

    const newIndex = currentIndex - 1;
    const currentMove = history[currentIndex];
    const targetMove = newIndex >= 0 ? history[newIndex] : null;
    
    if (!targetMove) {
      // Reset to initial state when going back to the beginning
      resetBoardToInitialState();
      return;
    }
    
    try {
      // Start with a fresh copy of the initial board state
      const newBasePoints = JSON.parse(JSON.stringify(INITIAL_BASE_POINTS));
      const positionMap = new Map<string, BasePoint>();
      
      // Initialize position map with initial pieces from the fresh copy
      newBasePoints.forEach((point: BasePoint) => {
        positionMap.set(`${point.x},${point.y}`, { ...point });
      });
      
      // Replay each move up to the new index
      for (let i = 0; i <= newIndex; i++) {
        const move = history[i];
        
        // Skip if move is undefined
        if (!move) {
          console.warn(`[BackNav] Missing move at index ${i}`);
          continue;
        }
        
        // Use flat coordinates with null checks
        const fromX = move.fromX;
        const fromY = move.fromY;
        const toX = move.toX;
        const toY = move.toY;
        const pieceType = move.pieceType;
        
        // Skip if we don't have valid coordinates
        if (fromX === undefined || fromY === undefined || toX === undefined || toY === undefined) {
          console.error('[BackNav] Invalid move coordinates:', { 
            move, 
            index: i,
            id: move.id,
            moveNumber: move.moveNumber
          });
          continue;
        }
        
        const fromKey = `${fromX},${fromY}`;
        const toKey = `${toX},${toY}`;
        
        // Find the piece being moved
        const piece = positionMap.get(fromKey);
        if (!piece) {
          console.error(`[BackNav] No piece found at source position (${fromX},${fromY}) in move:`, { 
            move,
            index: i,
            id: move.id,
            moveNumber: move.moveNumber,
            positionMap: Array.from(positionMap.entries())
          });
          continue;
        }
        
        // Check for capture first (before we move the piece)
        if (positionMap.has(toKey)) {
          const capturedPiece = positionMap.get(toKey);
          console.log(`[BackNav] Capturing piece at [${toX},${toY}]:`, capturedPiece);
          positionMap.delete(toKey);
        }
        
        // Create a new piece object with updated position and type
        const movedPiece: BasePoint = {
          ...piece,
          x: toX,
          y: toY,
          pieceType: (pieceType && isValidPieceType(pieceType)) ? pieceType : piece.pieceType,
          hasMoved: true
        };
        
        // Remove the piece from its old position and place it in the new position
        positionMap.delete(fromKey);
        positionMap.set(toKey, movedPiece);
        
        console.log(`[BackNav] Applied move ${i+1}/${newIndex+1}: [${fromX},${fromY}]→[${toX},${toY}]`);
      }
      
      // Update the board state with the final positions
      const updatedBasePoints = Array.from(positionMap.values());
      
      // Update the board state
      setBasePoints(updatedBasePoints);
      setCurrentMoveIndex(newIndex);
      
      // Update the current branch name based on the move we're going to
      if (newIndex >= 0) {
        const targetMove = history[newIndex];
        const newBranch = targetMove.branchName || 'main';
        const isReturningToMain = !targetMove.branchName || targetMove.branchName === 'main';
        
        // Find next main line move after the target move
        const isReturningFromBranch = currentBranchName() && (!targetMove.branchName || targetMove.branchName === 'main');
        
        // Find the next main line move, which could be after some branch moves
        let nextMainLineMove;
        let nextMainLineIndex = -1;
        
        // Look ahead in history for the next main line move
        for (let i = newIndex + 1; i < history.length; i++) {
          const move = history[i];
          if (!move.branchName || move.branchName === 'main') {
            nextMainLineMove = move;
            nextMainLineIndex = i;
            break;
          }
        }
        
        // If we're returning to main line, store the next main line move
        if (isReturningFromBranch && nextMainLineMove) {
          console.log('[BackNav] Returning to main line, next main line move is at index', nextMainLineIndex, {
            move: nextMainLineMove
          });
          // Store the next main line move info for use in move validation
          setCurrentMainLineMove({
            index: nextMainLineIndex,
            move: nextMainLineMove
          });
        }
        
        setCurrentBranchName(targetMove.branchName || null);
      } else {
        setCurrentBranchName(null);
      }
      
      // Update turn index - next player's turn (since the move at newIndex was just applied)
      const newTurnIndex = (newIndex + 1) % PLAYER_COLORS.length;
      setCurrentTurnIndex(newTurnIndex);
      
      // Use the shared color map from gameUtils

      // Get the current player's color, converting from color name to hex if needed
      const playerColorName = PLAYER_COLORS[newTurnIndex].toLowerCase();
      const currentPlayerColor = COLOR_MAP[playerColorName] || playerColorName;
      
      // Get current player's pieces - use the replayed base points instead of the current state
      let currentPlayerPieces = updatedBasePoints.filter((p: BasePoint) => {
        // Normalize both colors for comparison
        const pieceColor = p.color?.toLowerCase();
        const targetColor = currentPlayerColor.toLowerCase();
        const colorName = playerColorName.toLowerCase();
        
        return pieceColor && (pieceColor === targetColor || pieceColor === colorName);
      });

      
      
      const newRestrictedSquares: number[] = [];
      const newRestrictedSquaresInfo: Array<{
        index: number;
        x: number;
        y: number;
        restrictedBy: Array<{
          basePointId: string;
          basePointX: number;
          basePointY: number;
          direction?: string;
        }>;
      }> = [];

      // Calculate restricted squares for current player's pieces
      for (const piece of currentPlayerPieces) {
        const moves = getLegalMoves(piece, basePoints());
        
        for (const move of moves) {
          const { x, y } = move;
          const index = y * BOARD_CONFIG.GRID_SIZE + x;
          
          if (!newRestrictedSquares.includes(index)) {
            newRestrictedSquares.push(index);
          }
          
          const existingInfo = newRestrictedSquaresInfo.find((info: { x: number; y: number }) => 
            info.x === x && info.y === y
          );
          
          if (existingInfo) {
            existingInfo.restrictedBy.push({
              basePointId: String(piece.id),
              basePointX: piece.x,
              basePointY: piece.y
            });
          } else {
            newRestrictedSquaresInfo.push({
              index,
              x,
              y,
              restrictedBy: [{
                basePointId: String(piece.id),
                basePointX: piece.x,
                basePointY: piece.y
              }]
            });
          }
        }
      }

      // Update the restricted squares state
      setRestrictedSquares(newRestrictedSquares);
      setRestrictedSquaresInfo(newRestrictedSquaresInfo);

      // Log the calculated restricted squares

      // Force a re-render to ensure the UI updates with the new restricted squares
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Re-fetch the latest base points to ensure we have the most up-to-date state
      const latestBasePoints = basePoints();
      
      // Recalculate restricted squares again to ensure they're in sync with the UI
      const recalculatedRestrictedSquares: number[] = [];
      const recalculatedRestrictedSquaresInfo: typeof newRestrictedSquaresInfo = [];
      
      for (const piece of currentPlayerPieces) {
        const moves = getLegalMoves(piece, latestBasePoints);
        
        for (const move of moves) {
          const { x, y } = move;
          const index = y * BOARD_CONFIG.GRID_SIZE + x;
          
          if (!recalculatedRestrictedSquares.includes(index)) {
            recalculatedRestrictedSquares.push(index);
          }
          
          const existingInfo = recalculatedRestrictedSquaresInfo.find(info => 
            info.x === x && info.y === y
          );
          
          if (existingInfo) {
            existingInfo.restrictedBy.push({
              basePointId: String(piece.id),
              basePointX: piece.x,
              basePointY: piece.y
            });
          } else {
            recalculatedRestrictedSquaresInfo.push({
              index,
              x,
              y,
              restrictedBy: [{
                basePointId: String(piece.id),
                basePointX: piece.x,
                basePointY: piece.y
              }]
            });
          }
        }
      }
      
      // Update with the final calculated restricted squares
      setRestrictedSquares(recalculatedRestrictedSquares);
      setRestrictedSquaresInfo(recalculatedRestrictedSquaresInfo);

      
    } catch (error) {
      console.error('Error in handleGoBack:', error);
      console.error('[BackNav] Error during back navigation:', error);
      setError('Failed to go back. Please try again.');
      
      // Try to restore to a consistent state
      setCurrentMoveIndex(-1);
      setMoveHistory([]);
      setBasePoints([...INITIAL_BASE_POINTS]);
      setCurrentTurnIndex(0);
      setRestrictedSquares([]);
      setRestrictedSquaresInfo([]);
    }
  };
  const [hoveredSquare, setHoveredSquare] = createSignal<number | null>(null);
  const [kingInCheck, setKingInCheck] = createSignal<{team: 1 | 2, position: [number, number]} | null>(null);
  
  // Track restricted squares with their origin information
  const [restrictedSquaresInfo, setRestrictedSquaresInfo] = createSignal<Array<{
    index: number;
    x: number;
    y: number;
    restrictedBy: Array<{
      basePointId: string;
      basePointX: number;
      basePointY: number;
      direction?: string;
    }>;
  }>>([]);
  const [lastHoveredCell, setLastHoveredCell] = createSignal<[number, number] | null>(null);

  
  // Base points fetching
  const { 
    basePoints, 
    fetchBasePoints,
    setBasePoints
  } = useFetchBasePoints({
    user,
  });
  
  // Initialize board on mount
  onMount(async () => {
    // Set up CSS variable for grid size
    document.documentElement.style.setProperty('--grid-size', BOARD_CONFIG.GRID_SIZE.toString());

    // Set up mouse event listeners
    window.addEventListener('mouseup', handleGlobalMouseUp as EventListener);
    
    try {
      // Set initial position to (0, 0) if not set
      // Call calculate-squares API to get initial restricted squares
      try {
        const response = await fetch('/api/calculate-squares', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            borderIndices: [],
            currentPosition: createPoint(0,0),
            destination: createPoint(0,0),
            gameId: gameId()
          })
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.statusText}`);
        }

        const result = await response.json();
        if (result.success) {
          setRestrictedSquares(result.data.squares || []);
          setRestrictedSquaresInfo(result.data.squaresWithOrigins || []);
        }
      } catch (error) {
        console.error('Failed to fetch initial restricted squares:', error);
        setError('Failed to load restricted squares. Please refresh the page.');
        setRestrictedSquares([]);
        setRestrictedSquaresInfo([]);
      }
      
      // Base points fetch removed
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Failed to initialize game: ${error.message}`);
      } else {
        console.error('Failed to initialize game: Unknown error occurred');
      }
    }
  });


  // Handle square hover
  const handleSquareHover = (index: number | null) => {
    setHoveredSquare(index);
    if (index === null) {
      setError(null);
    } else {
      const validation = validateSquarePlacementLocal(index);
      if (!validation.isValid) {
        setError(validation.reason || 'Invalid placement');
      } else {
        setError(null);
      }
    }
  };
  
  // Wrapper to handle the fetch with error handling
  const handleFetchBasePoints = async () => {
    try {
      await fetchBasePoints();
    } catch (error) {
      console.error('Error in fetchBasePoints:', error);
    }
  };

  // Effect to handle user changes
  createEffect(on(
    () => user(),
    (currentUser) => {
      if (currentUser === undefined) return;
      
      // Clear state on logout
      if (!currentUser) {
        setRestrictedSquares([]);
        setRestrictedSquaresInfo([]);
      }
      // Base points are not automatically fetched on login
    },
    { defer: true }
  ));

  // Check for king in check when restricted squares or base points change
  createEffect(() => {
    const squares = getRestrictedSquares();
    const points = basePoints();
    checkKingInCheck();
    
    // Clear previous check highlights
    setKingsInCheck({});
    
    // Check each king
    const allBasePoints = basePoints();
    const restrictedSquares = getRestrictedSquares();
    const restrictedInfo = restrictedSquaresInfo();
    
    allBasePoints
      .filter(bp => bp.pieceType === 'king')
      .forEach(king => {
        const kingIndex = king.y * BOARD_CONFIG.GRID_SIZE + king.x;
        if (restrictedSquares.includes(kingIndex)) {
          // Check if any opponent pieces are threatening this king
          const restrictions = restrictedInfo.filter(sq => sq.index === kingIndex);
          const isInCheck = restrictions.some(restriction => 
            restriction.restrictedBy.some(r => {
              const attacker = allBasePoints.find(bp => 
                bp.x === r.basePointX && 
                bp.y === r.basePointY
              );
              return attacker && getTeam(attacker.color) !== getTeam(king.color);
            })
          );
          
          if (isInCheck) {
            setKingsInCheck(prev => ({
              ...prev,
              [`${king.x},${king.y}`]: true
            }));
          }
        }
      });
  });
  
  // Set up SSE for real-time updates
  useSSE('/api/sse', (message) => {
    // The point data might be in message.point or message.basePoint or the message itself
    const point = message.point || message.basePoint || message;
    
    if (point && point.id) {
      setBasePoints(prev => {
        // Check if there's a base point at the target position that's different from the moving one
        const capturedBasePoint = prev.find(bp => 
          bp.x === point.x && 
          bp.y === point.y && 
          bp.id !== point.id
        );
        
        // If we found a base point at the target position (a capture), remove it
        if (capturedBasePoint) {
          const filtered = prev.filter(bp => bp.id !== capturedBasePoint.id);
          
          // Now update the moving base point
          const movingIndex = filtered.findIndex(bp => bp.id === point.id);
          if (movingIndex !== -1) {
            filtered[movingIndex] = {
              ...filtered[movingIndex],
              ...point
            };
          } else {
            // If the moving base point doesn't exist yet, add it
            filtered.push(point);
          }
          
          return filtered;
        }
        
        // If no capture, just update the base point normally
        const index = prev.findIndex(bp => bp.id === point.id);
        if (index !== -1) {
          const newBasePoints = [...prev];
          newBasePoints[index] = {
            ...newBasePoints[index],
            ...point
          };
          return newBasePoints;
        }
        
        return prev;
      });
    }
  });

  // Handle mouse move for dragging
  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging() || !pickedUpBasePoint()) return;

    const board = boardRef;
    if (!board) return;

    const rect = board.getBoundingClientRect();
    const gridX = Math.floor((e.clientX - rect.left) / (rect.width / BOARD_CONFIG.GRID_SIZE));
    const gridY = Math.floor((e.clientY - rect.top) / (rect.height / BOARD_CONFIG.GRID_SIZE));

    // Check if we're still within the grid
    if (gridX < 0 || gridX >= BOARD_CONFIG.GRID_SIZE || gridY < 0 || gridY >= BOARD_CONFIG.GRID_SIZE) {
      return;
    }

    const currentCell: [number, number] = [gridX, gridY];
    
    // Always update the hovered cell during drag
    setHoveredCell(currentCell);
    
    // Get the current last hovered cell
    const lastCell = lastHoveredCell();
    
    // If we don't have a last hovered cell or it's different from current cell
    if (!lastCell || (lastCell[0] !== currentCell[0] || lastCell[1] !== currentCell[1])) {
      // Only update the target position and UI, don't make API calls yet
      setTargetPosition([...currentCell]);
      updateBasePointUI(currentCell);
      // Update the last hovered cell
      setLastHoveredCell([...currentCell]);
    }
  };

  // Handle base point pickup
  const handleBasePointPickup = (point: Point) => {
    const [x, y] = point;
    
    // Find the base point being picked up
    const basePoint = basePoints().find(bp => bp.x === x && bp.y === y);
    if (!basePoint) return;
    
    // Map color names to hex codes for comparison
    const colorMap: Record<string, string> = {
      'red': '#f44336',
      'blue': '#2196f3',
      'yellow': '#ffeb3b',
      'green': '#4caf50'
    };
    
    const currentTurnColorName = currentPlayerColor();
    const currentTurnHexColor = colorMap[currentTurnColorName] || currentTurnColorName;
    const pieceColor = basePoint.color.toLowerCase();
    
    // Check if it's this player's turn to move (based on piece color)
    if (pieceColor !== currentTurnHexColor) {
      return; // Don't allow picking up opponent's pieces or moving out of turn
    }
    
    setPickedUpBasePoint([x, y]);
    setDragStartPosition([x, y]);
    setIsDragging(true);
    
    // Get all restricted squares and base points
    const restrictedSquares = getRestrictedSquares();
    const restrictedInfo = restrictedSquaresInfo();
    
    // Get all base points that can be captured (enemy base points)
    const enemyBasePoints = basePoints()
      .filter(bp => bp.color.toLowerCase() !== currentTurnHexColor)
      .map(bp => ({
        index: bp.y * BOARD_CONFIG.GRID_SIZE + bp.x,
        x: bp.x,
        y: bp.y,
        isBasePoint: true,
        restrictedBy: [{ basePointX: x, basePointY: y }]
      }));
    
    // Get restricted squares that are visible (restricted by the picked up base point)
    const visibleRestrictedSquares = [
      ...restrictedInfo.filter(sq => 
        sq.restrictedBy.some(r => r.basePointX === x && r.basePointY === y)
      ),
      ...enemyBasePoints.filter(bp => 
        // Only include enemy base points that are in the restricted squares list
        // or are being restricted by the current base point
        restrictedSquares.includes(bp.index) ||
        restrictedInfo.some(sq => 
          sq.index === bp.index && 
          sq.restrictedBy.some(r => r.basePointX === x && r.basePointY === y)
        )
      )
    ];
  };

  // Helper function to update base point UI during drag
  const updateBasePointUI = (target: [number, number]): boolean => {
    const basePoint = pickedUpBasePoint();
    if (!basePoint) return false;

    const [targetX, targetY] = target;
    const index = targetY * BOARD_CONFIG.GRID_SIZE + targetX;
    
    // Validate the target position
    const validation = validateSquarePlacementLocal(index);
    if (!validation.isValid) {
      setError(`Invalid placement: ${validation.reason || 'Unknown reason'}`);
      return false;
    }

    // Clear any previous errors if validation passed
    setError(null);

    // Don't do anything if we're already at the target position
    if (basePoint[0] === targetX && basePoint[1] === targetY) {
      return false;
    }

    // Find the base point being moved
    const dragPos = dragStartPosition();
    const pointToMove = basePoints().find(bp => 
      dragPos && bp.x === dragPos[0] && bp.y === dragPos[1]
    ) || basePoints().find(bp => 
      bp.x === basePoint[0] && bp.y === basePoint[1]
    );

    if (!pointToMove) {
      setError(`Base point not found at position (${basePoint[0]}, ${basePoint[1]})`);
      return false;
    }

    // Optimistically update the UI
    setBasePoints(prev => 
      prev.map(bp => 
        bp.id === pointToMove.id 
          ? { ...bp, x: targetX, y: targetY } 
          : bp
      )
    );

    // Update the drag start position to the new position
    setDragStartPosition([targetX, targetY]);
    
    return true;
  };

  // Validate a move and handle the necessary state updates
  const validateMoveWithState = (startX: number, startY: number, targetX: number, targetY: number) => {
    const validation = validateMove(startX, startY, targetX, targetY);
    if (!validation.isValid) {
      setError(validation.error || 'Invalid move');
      cleanupDragState();
      return null;
    }

    const pointToMove = validation.pointToMove;
    if (!pointToMove) {
      setError('No piece found to move');
      cleanupDragState();
      return null;
    }

    return pointToMove;
  };

  // Validates a move from start to target coordinates
  const validateMove = (startX: number, startY: number, targetX: number, targetY: number) => {
    const index = targetY * BOARD_CONFIG.GRID_SIZE + targetX;
    const validation = validateSquarePlacementLocal(index);
    
    if (!validation.isValid) {
      return { 
        isValid: false, 
        error: `Invalid placement: ${validation.reason || 'Unknown reason'}` 
      };
    }

    const pointToMove = basePoints().find(bp => bp.x === startX && bp.y === startY);
    if (!pointToMove) {
      return { 
        isValid: false, 
        error: `No piece found at (${startX}, ${startY})` 
      };
    }

    // Check if it's this color's turn
    const currentColor = pointToMove.color.toLowerCase();
    const currentTurn = currentPlayerColor().toLowerCase();
    const normalizedCurrentColor = normalizeColor(currentColor);
    const normalizedTurnColor = normalizeColor(currentTurn);

    if (normalizedCurrentColor !== normalizedTurnColor) {
      return { 
        isValid: false, 
        error: `It's not ${currentColor}'s turn. Current turn: ${currentTurn}`
      };
    }

    return { 
      isValid: true, 
      pointToMove 
    };
  };

  // Helper function to get the target position for a move
  const getMoveTarget = (): [number, number] | null => {
    // Try to get the target from the target position state
    const target = targetPosition();
    if (target) return target;

    // Fall back to the hovered cell if no explicit target
    const hovered = hoveredCell();
    if (hovered) {
      const newTarget: [number, number] = [...hovered];
      setTargetPosition(newTarget);
      return newTarget;
    }

    return null;
  };

  // Handle mouse up anywhere on the document to complete dragging
  const handleGlobalMouseUp = async (e?: MouseEvent | Event) => {
    // Prevent multiple simultaneous move processing
    if (isProcessingMove()) {
      return;
    }

    // Convert to MouseEvent if it's a standard Event
    const mouseEvent = e && 'clientX' in e ? e : undefined;
    
    if (!isDragging() || !pickedUpBasePoint()) {
      return;
    }

    // Set processing flag
    setIsProcessingMove(true);

    // Get the target position for the move
    const target = getMoveTarget();
    if (!target) {
      cleanupDragState();
      return;
    }

    const [targetX, targetY] = target;
    const startPos = dragStartPosition();
    if (!startPos) {
      cleanupDragState();
      return;
    }

    const [startX, startY] = startPos;
    
    // Only proceed if we actually moved to a new cell
    if (startX !== targetX || startY !== targetY) {
      const pointToMove = validateMoveWithState(startX, startY, targetX, targetY);
      if (!pointToMove) return;
      
      // Save the current state for potential rollback
      const originalBasePoints = [...basePoints()];
      const originalRestrictedSquares = [...getRestrictedSquares()];
      const originalRestrictedSquaresInfo = [...restrictedSquaresInfo()];
      
      try {

        // Check if we're making a move from a historical position (not the latest move)
        const isAtHistoricalPosition = currentMoveIndex() < fullMoveHistory().length - 1;
        let isBranching = false;
        let branchName: string | null = null;
        
        if (isAtHistoricalPosition) {
          const currentIndex = currentMoveIndex();
          const history = fullMoveHistory();
          const remainingMoves = history.slice(currentIndex + 1);
          
          console.log(`[Branch] Current position: move ${currentIndex + 1} of ${history.length}`);
          console.log(`[Branch] Current branch: ${currentBranchName() || 'main'}`);
          
          // Log all remaining moves for debugging
          console.log(`[Branch] Remaining moves (${remainingMoves.length}):`, 
            JSON.stringify(remainingMoves.map((m, i) => ({
              index: currentIndex + 1 + i,
              from: [m.fromX, m.fromY],
              to: [m.toX, m.toY],
              branch: m.branchName || 'main',
              moveNum: m.moveNumber,
              type: m.pieceType,
              id: m.id,
              basePointId: m.basePointId
            })), null, 2)
          );
          
          // Find the next move in the main line
          const nextMoveInMainLine = remainingMoves.find(move => 
            !move.branchName || move.branchName === 'main'
          );
          const nextMoveIdx = nextMoveInMainLine ? history.indexOf(nextMoveInMainLine) : -1;
          
          console.log(`[Branch] Next main line move at index: ${nextMoveIdx} (${nextMoveInMainLine ? 'found' : 'not found'})`);
          
          if (nextMoveInMainLine) {
            console.log(`[Branch] Next main line move:`, {
              from: [nextMoveInMainLine.fromX, nextMoveInMainLine.fromY],
              to: [nextMoveInMainLine.toX, nextMoveInMainLine.toY],
              branch: nextMoveInMainLine.branchName || 'main',
              moveNumber: nextMoveInMainLine.moveNumber,
              indexInHistory: nextMoveIdx
            });
          }
          
          console.log(`[Branch] Attempting move:`, {
            from: [startX, startY],
            to: [targetX, targetY],
            currentBranch: currentBranchName() || 'main',
            isBranching: isBranching
          });

          // Check if the current move matches the main line move at this position
          // We need to find the next main line move that would come after the current position
          const nextMainLineMove = mainLineMoves().find(move => 
            move.moveNumber > (fullMoveHistory()[currentIndex]?.moveNumber || 0) &&
            move.branchName === 'main'
          );
          
          const isMainLineMove = nextMainLineMove && 
            nextMainLineMove.fromX === startX &&
            nextMainLineMove.fromY === startY &&
            nextMainLineMove.toX === targetX &&
            nextMainLineMove.toY === targetY;
            
          console.log('[Branch] Checking against main line move:', {
            currentMoveNumber: fullMoveHistory()[currentIndex]?.moveNumber || 0,
            nextMainLineMove: nextMainLineMove ? {
              moveNumber: nextMainLineMove.moveNumber,
              from: [nextMainLineMove.fromX, nextMainLineMove.fromY],
              to: [nextMainLineMove.toX, nextMainLineMove.toY],
              piece: nextMainLineMove.pieceType
            } : 'No main line move found',
            actualMove: {
              from: [startX, startY],
              to: [targetX, targetY],
              piece: pointToMove.pieceType
            },
            isMatch: isMainLineMove ? '✅' : '❌',
            mainLineMoves: mainLineMoves().map(m => ({
              moveNumber: m.moveNumber,
              from: [m.fromX, m.fromY],
              to: [m.toX, m.toY],
              branch: m.branch
            }))
          });
          
          if (isMainLineMove) {
            console.log(`[Branch] ✅ Move matches main line at index ${currentIndex + 1}`);
            
            // Get the next main line move
            const nextMainLineMove = mainLineMoves().find(move => 
              move.moveNumber > (fullMoveHistory()[currentIndex]?.moveNumber || 0)
            );
            
            if (!nextMainLineMove) {
              console.error('[Branch] No main line move found after current position');
              cleanupDragState();
              return;
            }
            
            console.log(`[Branch] Executing main line move:`, {
              from: [nextMainLineMove.fromX, nextMainLineMove.fromY],
              to: [nextMainLineMove.toX, nextMainLineMove.toY],
              moveNumber: nextMainLineMove.moveNumber
            });
            
            // Update the current branch to main
            setCurrentBranchName('main');
            
            // Update the base points to reflect the move
            const updatedBasePoints = [...basePoints()];
            const pieceIndex = updatedBasePoints.findIndex(p => 
              p.x === nextMainLineMove.fromX && p.y === nextMainLineMove.fromY
            );
            
            if (pieceIndex !== -1) {
              // Move the piece in the UI
              updatedBasePoints[pieceIndex] = {
                ...updatedBasePoints[pieceIndex],
                x: nextMainLineMove.toX,
                y: nextMainLineMove.toY
              };
              setBasePoints(updatedBasePoints);
              
              // Update turn to the next player
              const newTurnIndex = (currentTurnIndex() + 1) % PLAYER_COLORS.length;
              setCurrentTurnIndex(newTurnIndex);
              
              // Recalculate restricted squares for the new player
              const currentPlayerPieces = updatedBasePoints.filter(p => {
                const pieceColor = p.color?.toLowerCase();
                const expectedColor = PLAYER_COLORS[newTurnIndex].toLowerCase();
                const mappedColor = {
                  'blue': '#2196f3',
                  'red': '#f44336',
                  'yellow': '#ffeb3b',
                  'green': '#4caf50'
                }[expectedColor] || expectedColor;
                return pieceColor && (pieceColor === expectedColor || pieceColor === mappedColor);
              });
              
              const newRestrictedSquares: number[] = [];
              const newRestrictedSquaresInfo: Array<{
                index: number;
                x: number;
                y: number;
                restrictedBy: Array<{ 
                  basePointId: string; 
                  basePointX: number; 
                  basePointY: number;
                }>;
              }> = [];
              
              // Calculate restricted squares for current player's pieces
              for (const piece of currentPlayerPieces) {
                const moves = getLegalMoves(piece, updatedBasePoints);
                
                for (const move of moves) {
                  const { x, y } = move;
                  const index = y * BOARD_CONFIG.GRID_SIZE + x;
                  
                  if (!newRestrictedSquares.includes(index)) {
                    newRestrictedSquares.push(index);
                  }
                  
                  const existingInfo = newRestrictedSquaresInfo.find(info => 
                    info.x === x && info.y === y
                  );
                  
                  if (existingInfo) {
                    existingInfo.restrictedBy.push({
                      basePointId: piece.id.toString(),
                      basePointX: piece.x,
                      basePointY: piece.y
                    });
                  } else {
                    newRestrictedSquaresInfo.push({
                      index,
                      x,
                      y,
                      restrictedBy: [{
                        basePointId: piece.id.toString(),
                        basePointX: piece.x,
                        basePointY: piece.y
                      }]
                    });
                  }
                }
              }
              
              // Update the restricted squares state
              setRestrictedSquares(newRestrictedSquares);
              setRestrictedSquaresInfo(newRestrictedSquaresInfo);
            }
            
            // Update the move history
            setMoveHistory(prev => {
              const newHistory = [...prev, nextMainLineMove];
              return newHistory;
            });
            
            // Update the current move index
            setCurrentMoveIndex(prev => prev + 1);
            
            cleanupDragState();
            return;
          } else {
            console.log(`[Branch] ❌ Move does not match main line at index ${currentIndex + 1}`);

            const currentMove = fullMoveHistory()[currentIndex];
            const currentMoveNumber = currentMove?.moveNumber || 0;
            const nextMoveNumber = currentMoveNumber + 1;
            
            // 1. First check if this matches the main line
            const nextMainLineMove = mainLineMoves().find(m => m.moveNumber === nextMoveNumber);
            const isMainLineMove = nextMainLineMove && 
                                 nextMainLineMove.fromX === startX &&
                                 nextMainLineMove.fromY === startY &&
                                 nextMainLineMove.toX === targetX &&
                                 nextMainLineMove.toY === targetY;
            
            if (isMainLineMove) {
              console.log('[Branch] Following main line move');
              branchName = 'main';
              setCurrentBranchName('main');
              isBranching = false;
              
              // Find the rest of the main line moves to append
              const remainingMainLineMoves = mainLineMoves()
                .filter(m => m.moveNumber >= nextMoveNumber)
                .sort((a, b) => a.moveNumber - b.moveNumber);
                
              setFullMoveHistory(prev => [
                ...prev.slice(0, currentIndex + 1),
                ...remainingMainLineMoves
              ]);
              setCurrentMoveIndex(currentIndex + remainingMainLineMoves.length);
              
              // Update board state
              const newBasePoints = [...basePoints()];
              remainingMainLineMoves.forEach(move => {
                const pieceIndex = newBasePoints.findIndex(p => 
                  p.x === move.fromX && p.y === move.fromY
                );
                if (pieceIndex !== -1) {
                  newBasePoints[pieceIndex] = {
                    ...newBasePoints[pieceIndex],
                    x: move.toX,
                    y: move.toY
                  };
                }
              });
              setBasePoints(newBasePoints);
              
              cleanupDragState();
              return;
            }
            
            // 2. Check if this matches an existing branch from this position
            const currentBranches = branchPoints()[currentIndex] || [];
            
            // Enhanced logging with collapsible groups
            console.group(`[Branch] Move ${currentIndex + 1} of ${moveHistory().length} (${currentBranchName() || 'main'})`);
            console.log('Current position:', [startX, startY], '→', [targetX, targetY]);
            console.log('Available branches:', currentBranches.map(b => ({
              branch: b.branchName,
              from: [b.firstMove.fromX, b.firstMove.fromY],
              to: [b.firstMove.toX, b.firstMove.toY]
            })));
            console.groupEnd();
            
            // Find a matching branch for this move
            const matchingBranch = currentBranches.find(branch => {
              const move = branch.firstMove;
              return move.fromX === startX && 
                     move.fromY === startY &&
                     move.toX === targetX && 
                     move.toY === targetY;
            });
            
            if (matchingBranch) {
              const { branchName: matchedBranchName } = matchingBranch;
              console.log(`[Branch] Found matching branch '${matchedBranchName}' for move`, {
                from: [startX, startY],
                to: [targetX, targetY]
              });
              
              // Set the current branch
              setCurrentBranchName(matchedBranchName);
              isBranching = false;
              
              // Get all moves in this branch, sorted by move number
              const branchMoves = fullMoveHistory()
                .filter(move => move && move.branchName === matchedBranchName)
                .sort((a, b) => a.moveNumber - b.moveNumber);

              if (branchMoves.length === 0) {
                console.error(`[Branch] No moves found in branch '${matchedBranchName}'`);
                cleanupDragState();
                return; // Exit without making a move if no moves are found
              }
              
              console.log(`[Branch] Found ${branchMoves.length} moves in branch '${matchedBranchName}'`);
              
              // Get the current move number from the main line at the branch point
              const currentMove = fullMoveHistory()[currentIndex];
              const currentMoveNumber = currentMove?.moveNumber || 0;
              
              // Adjust branch move numbers to be relative to game start
              const branchMovesToFollow = branchMoves.map((move, index) => ({
                ...move,
                moveNumber: currentMoveNumber + index + 1
              }));
              
              // Only take the first move in the branch
              const firstBranchMove = branchMovesToFollow[0];
              
              console.log(`[Branch] Will execute first move only:`, {
                from: [firstBranchMove.fromX, firstBranchMove.fromY],
                to: [firstBranchMove.toX, firstBranchMove.toY],
                moveNumber: firstBranchMove.moveNumber,
                originalMoveNumber: branchMoves[0].moveNumber,
                adjusted: true
              });
              
              console.log(`[Branch] Following ${1} move in branch '${matchedBranchName}'`);
              console.log('[Branch] Current move history:', JSON.stringify(fullMoveHistory().map(m => ({
                from: [m.fromX, m.fromY],
                to: [m.toX, m.toY],
                moveNumber: m.moveNumber,
                branch: m.branchName || 'main',
                id: m.id
              })), null, 2));
              
              // Get the branch point move to use as reference for move numbers
              const branchPointMove = fullMoveHistory()[currentIndex];
              const branchPointMoveNumber = branchPointMove?.moveNumber || 0;
              
              // Adjust branch move numbers to be relative to the branch point
              const adjustedBranchMoves = branchMovesToFollow.map((move, index) => ({
                ...move,
                moveNumber: branchPointMoveNumber + index + 1
              }));
              
              console.log('[Branch] Adjusted branch move numbers:', JSON.stringify({
                branchPointMoveNumber,
                adjustedMoves: adjustedBranchMoves.map(m => ({
                  from: [m.fromX, m.fromY],
                  to: [m.toX, m.toY],
                  moveNumber: m.moveNumber
                }))
              }, null, 2));
              
              // Keep the original move numbers in fullMoveHistory
              // Only update the current move history with adjusted move numbers
              
              // First, update the move history
              setMoveHistory(prev => {
                const newHistory = [
                  ...prev.slice(0, currentIndex + 1),
                  ...adjustedBranchMoves
                ];
                
                console.log('[Branch] Added branch moves to history:', {
                  branchPoint: currentIndex,
                  branchMoves: adjustedBranchMoves.length,
                  totalMoves: newHistory.length
                });
                
                console.log('[Branch] Move history after update:', 
                  JSON.stringify(newHistory.map(m => ({
                    from: [m.fromX, m.fromY],
                    to: [m.toX, m.toY],
                    moveNumber: m.moveNumber,
                    branch: m.branchName || 'main'
                  })), null, 2)
                );
                
                // Execute only the first move of the branch
                const firstMove = adjustedBranchMoves[0];
                if (firstMove) {
                  const updatedBasePoints = [...basePoints()];
                  const pieceIndex = updatedBasePoints.findIndex(p => 
                    p.x === firstMove.fromX && p.y === firstMove.fromY
                  );
                  
                  if (pieceIndex !== -1) {
                    console.log(`[Branch] Moving piece from [${firstMove.fromX},${firstMove.fromY}] to [${firstMove.toX},${firstMove.toY}]`);
                    updatedBasePoints[pieceIndex] = {
                      ...updatedBasePoints[pieceIndex],
                      x: firstMove.toX,
                      y: firstMove.toY
                    };
                    setBasePoints(updatedBasePoints);
                    
                    // Update turn to the next player
                    const newTurnIndex = (currentTurnIndex() + 1) % PLAYER_COLORS.length;
                    setCurrentTurnIndex(newTurnIndex);
                    console.log(`[Branch] Turn updated to player ${newTurnIndex} (${PLAYER_COLORS[newTurnIndex]})`);
                    
                    // Recalculate restricted squares for the new player
                    const currentPlayerPieces = updatedBasePoints.filter(p => {
                      const pieceColor = p.color?.toLowerCase();
                      const expectedColor = PLAYER_COLORS[newTurnIndex].toLowerCase();
                      const mappedColor = {
                        'blue': '#2196f3',
                        'red': '#f44336',
                        'yellow': '#ffeb3b',
                        'green': '#4caf50'
                      }[expectedColor] || expectedColor;
                      return pieceColor && (pieceColor === expectedColor || pieceColor === mappedColor);
                    });
                    
                    const newRestrictedSquares: number[] = [];
                    const newRestrictedSquaresInfo: Array<{
                      index: number;
                      x: number;
                      y: number;
                      restrictedBy: Array<{ 
                        basePointId: string; 
                        basePointX: number; 
                        basePointY: number;
                      }>;
                    }> = [];
                    
                    // Calculate restricted squares for current player's pieces
                    for (const piece of currentPlayerPieces) {
                      const moves = getLegalMoves(piece, updatedBasePoints);
                      
                      for (const move of moves) {
                        const { x, y } = move;
                        const index = y * BOARD_CONFIG.GRID_SIZE + x;
                        
                        if (!newRestrictedSquares.includes(index)) {
                          newRestrictedSquares.push(index);
                        }
                        
                        const existingInfo = newRestrictedSquaresInfo.find(info => 
                          info.x === x && info.y === y
                        );
                        
                        if (existingInfo) {
                          existingInfo.restrictedBy.push({
                            basePointId: piece.id.toString(),
                            basePointX: piece.x,
                            basePointY: piece.y
                          });
                        } else {
                          newRestrictedSquaresInfo.push({
                            index,
                            x,
                            y,
                            restrictedBy: [{
                              basePointId: piece.id.toString(),
                              basePointX: piece.x,
                              basePointY: piece.y
                            }]
                          });
                        }
                      }
                    }
                    
                    // Update the restricted squares state
                    setRestrictedSquares(newRestrictedSquares);
                    setRestrictedSquaresInfo(newRestrictedSquaresInfo);
                  }
                  
                  // Only increment move index by 1 since we're only doing one move
                  setCurrentMoveIndex(currentIndex + 1);
                } else {
                  setCurrentMoveIndex(currentIndex);
                }
                
                return newHistory;
              });
              
              cleanupDragState();
              return; // Exit early since we've handled the branch following
            }
            
            // Only proceed to branch creation if we didn't find a matching branch
            if (!matchingBranch) {
              // Get just the next move in this branch
              const nextMoveInBranch = (fullMoveHistory() || []).find(move => 
                move && 
                move.branchName === branchName && 
                move.moveNumber === nextMoveNumber
              );

              if (nextMoveInBranch) {
                // Update state to follow this branch
                setCurrentBranchName(branchName);
                
                // Only add the next move to history
                setFullMoveHistory(prev => {
                  const currentHistory = prev || [];
                  return [
                    ...currentHistory.slice(0, currentIndex + 1),
                    nextMoveInBranch
                  ];
                });
                
                setCurrentMoveIndex(currentIndex + 1);
                setMoveHistory(prev => [...prev, nextMoveInBranch]);
                
                // Update board state with just this move
                const newBasePoints = [...basePoints()];
                const pieceIndex = newBasePoints.findIndex(p => 
                  p.x === nextMoveInBranch.fromX && p.y === nextMoveInBranch.fromY
                );
                
                if (pieceIndex !== -1) {
                  newBasePoints[pieceIndex] = {
                    ...newBasePoints[pieceIndex],
                    x: nextMoveInBranch.toX,
                    y: nextMoveInBranch.toY
                  };
                  setBasePoints(newBasePoints);
                }
                
                cleanupDragState();
                return;
              }
            }

            // If we get here, it's a new branch
            console.log(`[Branch] Creating new branch from move ${currentIndex + 1}`);
            console.log(`[Branch] Current branch state:\n${
              JSON.stringify({
                currentMoveIndex: currentIndex,
                currentBranch: currentBranchName() || 'main',
                mainLineMoves: mainLineMoves().map(m => ({
                  moveNumber: m.moveNumber,
                  from: [m.fromX, m.fromY],
                  to: [m.toX, m.toY],
                  piece: m.pieceType
                }))
              }, null, 2)
            }`);
            isBranching = true;
            const parentBranch = currentBranchName() || 'main';
            branchName = generateBranchName(nextMoveIdx, parentBranch) || `branch-${Date.now()}`;
            
            // Track this branch point
            console.log(`[Branch] Creating new branch point at move ${currentIndex + 1} with branch name: ${branchName}\n${
              JSON.stringify({
                from: [startX, startY],
                to: [targetX, targetY],
                branchName,
                parentBranch,
                currentIndex
              }, null, 2)
            }`);
            
            setBranchPoints(prev => {
              // Ensure branchName is never null or undefined
              const safeBranchName = branchName || `branch-${Date.now()}`;
              
              const newPoints = {
                ...prev,
                [currentIndex]: [
                  ...(prev[currentIndex] || []),
                  { 
                    branchName: safeBranchName, 
                    firstMove: {
                      fromX: startX,
                      fromY: startY,
                      toX: targetX,
                      toY: targetY,
                      id: Date.now(),
                      basePointId: '',
                      timestamp: Date.now(),
                      playerId: '',
                      color: currentPlayerColor(),
                      moveNumber: nextMoveIdx,
                      isBranch: true,
                      branchName: safeBranchName,
                      parentBranchName: parentBranch || 'main',
                      pieceType: 'pawn' // This should be the actual piece type
                    } as Move
                  }
                ]
              };
              
              console.log(`[Branch] Updated branch points:\n${
                JSON.stringify({
                  allBranchPoints: newPoints,
                  currentBranches: newPoints[currentIndex] || []
                }, null, 2)
              }`);
              
              // Log the complete branch points state
              console.log('[Branch] Current branchPoints state:', 
                JSON.stringify(newPoints, (key, value) => 
                  key === 'firstMove' ? 
                    `[Move ${value.moveNumber}: ${value.fromX},${value.fromY}→${value.toX},${value.toY}${value.branchName ? ` (${value.branchName})` : ''}]` : 
                    value,
                2));
              
              return newPoints;
            });
            setCurrentBranchName(branchName);
          }
        }
        
        // 2. Add move to history before updating position
        // Get the current branch name from context or previous move
        const currentBranch = branchName || currentBranchName() || 
                            (fullMoveHistory()[currentMoveIndex()]?.branchName) ||
                            'main';
                            
        console.log(`[Move] Current branch set to: ${currentBranch}`);
                            
        // Calculate the move number based on the current branch's move count
        const currentBranchMoves = fullMoveHistory().filter(
          move => move.branchName === currentBranch
        );
        const branchMoveNumber = currentBranchMoves.length + 1;
        
        console.log(`[Move] Branch '${currentBranch}' has ${currentBranchMoves.length} moves, next will be #${branchMoveNumber}`);
        
        const newMove: Move = {
          id: Date.now(),
          basePointId: pointToMove.id,
          fromX: startX,
          fromY: startY,
          toX: targetX,
          toY: targetY,
          timestamp: Date.now(),
          playerId: pointToMove.userId,
          color: pointToMove.color.toLowerCase(),
          branchName: currentBranch,
          parentBranchName: currentBranch === 'main' ? null : currentBranch.split('/').slice(0, -1).join('/') || null,
          moveNumber: branchMoveNumber,  // Use the branch-aware move number
          isBranch: isBranching,
          pieceType: pointToMove.pieceType
        };
        
        // If this is a branching move, update the current branch name
        if (isBranching && branchName) {
          setCurrentBranchName(branchName);
        }
        
        // Move number is already calculated and stored in newMove object
        
        // If this is a main line move, add it to mainLineMoves
        if (!isBranching && (!currentBranchName() || currentBranchName() === 'main')) {
          console.log('[MainLine] Adding move to main line:', {
            moveNumber: newMove.moveNumber,
            from: [newMove.fromX, newMove.fromY],
            to: [newMove.toX, newMove.toY],
            piece: newMove.pieceType
          });
          setMainLineMoves(prev => {
            const updated = [...prev, newMove];
            console.log(`[MainLine] Main line now has ${updated.length} moves`);
            return updated;
          });
        }
        
        // Add the new move to the full history
        let newFullHistory;
        if (isBranching) {
          // If branching, keep the history up to the current move and add the new branch move
          newFullHistory = [
            ...fullMoveHistory().slice(0, currentMoveIndex() + 1),
            newMove
          ];
          console.log(`[Branch] Created branch '${branchName}' at move ${currentMoveIndex() + 1}`, {
            branchPoint: currentMoveIndex(),
            newMove: {
              from: [startX, startY],
              to: [targetX, targetY],
              moveNumber: branchMoveNumber,
              branch: branchName
            },
            historyLength: newFullHistory.length
          });
        } else {
          // Normal case - just append to the end
          newFullHistory = [...fullMoveHistory(), newMove];
          console.log(`[Move] Appended move to history (total: ${newFullHistory.length})`, {
            from: [startX, startY],
            to: [targetX, targetY],
            moveNumber: branchMoveNumber,
            branch: currentBranch
          });
        }
        
        
        setFullMoveHistory(newFullHistory);
        setCurrentMoveIndex(newFullHistory.length - 1);
        // Update moveHistory to include all moves up to the current one
        setMoveHistory(newFullHistory);
        
        console.log(`[Move] Updated history - total moves: ${newFullHistory.length}, current index: ${newFullHistory.length - 1}`);
        console.log(`[Move] Current branch after update: ${currentBranchName() || 'main'}`);
        
        // History update complete
        
        // Update turn to next player
        setCurrentTurnIndex(prev => (prev + 1) % PLAYER_COLORS.length);

        // 3. Update the base points in the UI
        const updatedBasePoints = basePoints().map(bp => 
          bp.id === pointToMove.id
            ? { ...bp, x: targetX, y: targetY }
            : bp
        );
        // Updating base points in UI
        setBasePoints(updatedBasePoints);

        if (!pointToMove) {
          throw new Error(`Base point not found at position (${startX}, ${startY})`);
        }

        // Updating base point in database
        const result = await updateBasePoint(
          pointToMove.id, 
          targetX, 
          targetY, 
          newMove.moveNumber,  // Use the move number from newMove
          newMove.branchName,
          Boolean(newMove.isBranch),  // Explicitly convert to boolean
          gameId(),         // Pass the current game ID
          startX,           // fromX (source X coordinate)
          startY            // fromY (source Y coordinate)
        );
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to update base point');
        }

        // 5. Calculate new restricted squares from the server
        // Calling /api/calculate-squares
        // Use the moveNumber from newMove which is already calculated correctly
        const moveNumber = newMove.moveNumber;

        try {
          const response = await fetch('/api/calculate-squares', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              currentPosition: [startX, startY],
              destination: [targetX, targetY],
              pieceType: pointToMove.pieceType,
              moveNumber,
              gameId: gameId(),
              branchName: newMove.branchName || null
            })
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error:', response.status, response.statusText, errorText);
            throw new Error(`API error: ${response.status} ${response.statusText}`);
          }

          const result2 = await response.json();
          
          if (result2.success) {
            // Update with server-calculated values
            setRestrictedSquares(result2.data?.squares || []);
            setRestrictedSquaresInfo(result2.data?.squaresWithOrigins || []);
          } else {
            console.warn('API call was not successful, using optimistic update');
          }
        } catch (apiError) {
          console.error('Error in calculate-squares API call:', apiError);
          // Continue with the optimistic update even if the API call fails
          console.log('Continuing with optimistic update after API error');
        }
      } catch (error) {
        // Handle errors and revert to original state
        console.error('Error during move:', error);
        setBasePoints(originalBasePoints);
        setRestrictedSquares(originalRestrictedSquares);
        setRestrictedSquaresInfo(originalRestrictedSquaresInfo);
        setError(error instanceof Error ? error.message : 'Failed to place base point');
        throw error; // Re-throw to trigger the finally block
      } finally {
        // Always clean up and reset the processing flag
        setIsProcessingMove(false);
        cleanupDragState();
      }
    } else {
      console.log('No movement detected, cleaning up');
      setIsProcessingMove(false);
      cleanupDragState();
    }
  };

  /**
   * Handles placing a base point at the target coordinates
   * @param target The target [x, y] coordinates where the base point should be placed
   */
  const handleBasePointPlacement = async (target: [number, number]) => {
    const basePoint = pickedUpBasePoint();
    if (!basePoint) {
      console.log('[handleBasePointPlacement] No base point is currently picked up');
      return;
    }

    const [targetX, targetY] = target;
    const index = targetY * BOARD_CONFIG.GRID_SIZE + targetX;
    
    console.log(`[handleBasePointPlacement] Previewing base point at (${targetX}, ${targetY})`);
    
    // Validate the target position
    const validation = validateSquarePlacementLocal(index);
    if (!validation.isValid) {
      const errorMsg = `Invalid placement: ${validation.reason || 'Unknown reason'}`;
      console.error('[handleBasePointPlacement]', errorMsg);
      setError(errorMsg);
      return;
    }

    // Clear any previous errors if validation passed
    setError(null);

    // Don't do anything if we're already at the target position
    if (basePoint[0] === targetX && basePoint[1] === targetY) {
      return;
    }

    let pointToMove: BasePoint | undefined;
    
    try {
      setIsSaving(true);
      setError(null);
      
      // Find the base point being moved, first check the drag start position, then the current position
      let pointToCheck = null;
      const dragPos = dragStartPosition();
      
      if (dragPos) {
        // First try to find the point at the drag start position
        pointToCheck = basePoints().find(bp => 
          bp.x === dragPos[0] && bp.y === dragPos[1]
        );
        
        // If not found, try the current position (in case this is a continuation of a drag)
        if (!pointToCheck) {
          pointToCheck = basePoints().find(bp => 
            bp.x === basePoint[0] && bp.y === basePoint[1]
          );
        }
      } else {
        // If no drag position, use the current position
        pointToCheck = basePoints().find(bp => 
          bp.x === basePoint[0] && bp.y === basePoint[1]
        );
      }

      if (!pointToCheck) {
        const errorMsg = `Base point not found at position (${basePoint[0]}, ${basePoint[1]})`;
        console.error('[handleBasePointPlacement]', errorMsg, { 
          basePoints: basePoints(),
          dragStartPosition: dragPos,
          targetPosition: [targetX, targetY]
        });
        setError(errorMsg);
        return;
      }
      
      pointToMove = pointToCheck;

      console.log(`[handleBasePointPlacement] Moving base point ${pointToMove.id} from (${pointToMove.x}, ${pointToMove.y}) to (${targetX}, ${targetY})`);
      
      // Optimistically update the UI
      setBasePoints(prev => 
        prev.map(bp => 
          bp.id === pointToMove!.id 
            ? { ...bp, x: targetX, y: targetY } 
            : bp
        )
      );
      
      // Update the drag start position to the new position after successful move
      setDragStartPosition([targetX, targetY]);
      
      // Note: calculate-squares API call has been moved to handleGlobalMouseUp
      // to only trigger once after drag ends

      // Update the base point in the database
      const moveNumber = fullMoveHistory().length + 1;
      // Debug: Log current branch name sources
      console.log('Current branch name sources:', {
        currentBranchName: currentBranchName(),
        historyBranchName: fullMoveHistory()[currentMoveIndex()]?.branchName,
        default: 'main'
      });
      
      // Get the current move from the history to check if it's a branch move
      const currentMove = fullMoveHistory()[currentMoveIndex()];
      const isBranchMove = currentMove?.isBranch || false;
      
      // If we're on a branch move, use its branch name, otherwise use the current branch name
      const branchName = isBranchMove 
        ? currentMove.branchName 
        : currentBranchName() || 'main';
      
      console.log('Final branch name before updateBasePoint:', branchName);
      
      // Debug log
      console.log('=== DEBUG: Before updateBasePoint ===');
      console.log('Current branch name:', branchName);
      console.log('Is branch move:', isBranchMove);
      console.log('Move number:', moveNumber);
      console.log('Point to move ID:', pointToMove.id);
      console.log('Target position:', { x: targetX, y: targetY });
      
      // Call updateBasePoint with the correct branch name and isNewBranch flag
      const result = await updateBasePoint(
        pointToMove.id, 
        targetX, 
        targetY, 
        moveNumber, 
        branchName,
        Boolean(isBranchMove),  // Explicitly convert to boolean for isNewBranch flag
        gameId(),
        pointToMove.x,
        pointToMove.y
      );
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to update base point');
      }

      console.log('[handleBasePointPlacement] Successfully updated base point, waiting for WebSocket update...');
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to update base point';
      console.error('[handleBasePointPlacement]', errorMsg, error);
      setError(errorMsg);
      
      // Revert the optimistic update on error
      const currentPointToMove = pointToMove; // Create a local constant
      if (currentPointToMove) {
        setBasePoints(prev => 
          prev.map(bp => 
            bp.id === currentPointToMove.id 
              ? { ...bp, x: basePoint[0], y: basePoint[1] } 
              : bp
          )
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Setup and cleanup event listeners
  onMount(() => {
    const handleMouseUp = (e: Event) => {
      // Only process if we're currently dragging
      if (isDragging() && pickedUpBasePoint()) {
        handleGlobalMouseUp(e as MouseEvent);
      }
    };

    const handleMouseMoveWrapper = (e: Event) => {
      const mouseEvent = e as MouseEvent;
      // Only process if we're currently dragging
      if (isDragging() && pickedUpBasePoint()) {
        mouseEvent.preventDefault();
        mouseEvent.stopPropagation();
        handleMouseMove(mouseEvent);
      }
    };

    const handleMouseLeave = (e: Event) => {
      // Only process if we're currently dragging
      if (isDragging() && pickedUpBasePoint()) {
        handleGlobalMouseUp(e as MouseEvent);
      }
    };

    // Add event listeners with passive: false for better performance
    window.addEventListener('mouseup', handleMouseUp, { capture: true, passive: false });
    window.addEventListener('mousemove', handleMouseMoveWrapper, { capture: true, passive: false });
    window.addEventListener('mouseleave', handleMouseLeave, { capture: true, passive: true });
    
    // Cleanup function to remove event listeners and reset state
    return () => {
      window.removeEventListener('mouseup', handleMouseUp, true);
      window.removeEventListener('mousemove', handleMouseMoveWrapper, true);
      window.removeEventListener('mouseleave', handleMouseLeave, true);
      
      // Clean up drag state
      setIsDragging(false);
      setPickedUpBasePoint(null);
      setHoveredCell(null);
      setLastHoveredCell(null);
    };
  });
  
  const handleSquareClick = async (index: number) => {
    // Prevent handling clicks during drag operations
    if (isSaving() || isDragging()) return;
    
    // Base point placement has been removed
    console.log('Square clicked, but base point placement is disabled');
  };
  
  // Reset board functionality has been moved to BoardControls component

  console.log('Rendering Board. Kings in check:', Object.keys(kingsInCheck()));
  
  return (
    <div class={styles.board}>
      
      <div class={styles.boardContent}>
        <BoardControls 
          gameId={gameId()}
          canGoBack={currentMoveIndex() >= 0}
          canGoForward={currentMoveIndex() < fullMoveHistory().length - 1}
          onGoBack={handleGoBack}
          onGoForward={handleGoForward}
          onReset={async () => {
            // Log the current move history before reset
            console.log('Resetting board. Current move history:', JSON.stringify(fullMoveHistory(), null, 2));
            
            // Get branch points before clearing state
            const branchPoints = fullMoveHistory().filter(move => move.isBranch);
            
            // Clear all state
            setFullMoveHistory([]);
            setCurrentMoveIndex(-1);
            setMoveHistory([]);
            setCurrentTurnIndex(0);
            setCurrentBranchName(null);
            setBranchPoints({});
            
            // Force a state update to ensure the state is cleared
            await new Promise(resolve => setTimeout(resolve, 0));
            
            // Log branch points after reset
            console.log('Branch points after reset:', JSON.stringify({
              count: branchPoints.length,
              branches: branchPoints.map(bp => ({
                id: bp.id,
                moveNumber: bp.moveNumber,
                branchName: bp.branchName,
                from: [bp.fromX, bp.fromY],
                to: [bp.toX, bp.toY],
                pieceType: bp.pieceType,
              }))
            }, null, 2));
            
            // Log the clean state after reset
            console.log('Board reset complete. New clean state:', JSON.stringify({
              fullMoveHistory: [],
              currentMoveIndex: -1,
              moveHistory: [],
              currentTurnIndex: 0,
              currentBranchName: null
            }, null, 2));
            
            // Refresh the base points
            await fetchBasePoints();
            
            // Force another state update
            await new Promise(resolve => setTimeout(resolve, 0));
            
            // Log the next move number
            console.log('Next move number will be:', fullMoveHistory().length + 1);
            
            // Refresh the restricted squares
            const squaresResponse = await fetch('/api/calculate-squares', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                currentPosition: [0, 0],
                destination: [0, 0],
                gameId: gameId(),
                branchName: currentBranchName() || null
              })
            });

            if (squaresResponse.ok) {
              const result = await squaresResponse.json();
              if (result.success) {
                setRestrictedSquares(result.data.squares || []);
                setRestrictedSquaresInfo(result.data.squaresWithOrigins || []);
              }
            }
          }}
        />
        
        <div class={styles.grid}>
          {Array.from({ length: BOARD_CONFIG.GRID_SIZE * BOARD_CONFIG.GRID_SIZE }).map((_, index) => {
          const [x, y] = [index % BOARD_CONFIG.GRID_SIZE, Math.floor(index / BOARD_CONFIG.GRID_SIZE)];
          // Find if there's a base point at these coordinates and get its color
          const basePoint = basePoints().find(bp => bp.x === x && bp.y === y);
          const isBP = !!basePoint;
          const isNonPlayable = isInNonPlayableCorner(x, y);
          
          // Only show restricted squares when dragging and they originate from the dragged base point
          const draggedBasePoint = pickedUpBasePoint();
          const isSelected = isDragging() && 
            getRestrictedSquares().includes(index) && 
            (draggedBasePoint 
              ? restrictedSquaresInfo().some(info => 
                  info.index === index && 
                  info.restrictedBy.some(r => 
                    r.basePointX === draggedBasePoint[0] && 
                    r.basePointY === draggedBasePoint[1]
                  )
                )
              : true
            );
          
          // Check if this cell has a king in check
          const isKingInCheck = basePoint?.pieceType === 'king' && kingsInCheck()[`${x},${y}`];
          
          // Update the cell state to include the new hover state and base point properties
          const cellState = {
            isBasePoint: isBP,
            isSelected,
            isHovered: !!(hoveredSquare() === index || (hoveredCell() && hoveredCell()![0] === x && hoveredCell()![1] === y)),
            isSaving: isSaving(),
            isInCheck: isKingInCheck,
            isNonPlayable,
            id: basePoint?.id,
            color: basePoint?.color,
            pieceType: basePoint?.pieceType
          };

          return (
            <GridCell
              x={x}
              y={y}
              state={cellState}
              isDragging={isDragging()}
              pickedUpBasePoint={pickedUpBasePoint()}
              onHover={(hovered) => {
                if (hovered) {
                  handleSquareHover(index);
                  setHoveredCell([x, y]);
                } else if (hoveredCell()?.[0] === x && hoveredCell()?.[1] === y) {
                  handleSquareHover(null);
                  setHoveredCell(null);
                }
              }}
              onBasePointPickup={handleBasePointPickup}
              onBasePointPlacement={handleBasePointPlacement}
              setBasePoints={setBasePoints}
              onClick={() => {
                handleSquareClick(index)
                  .catch(err => {
                    console.error('Error processing click:', err);
                    setError('Failed to process your action. Please try again.');
                  });
              }}
            />
          );
        })}
      </div>
      {error() && (
        <div class={styles.error} classList={{ [styles.visible]: !!error() }}>
          {error()}
        </div>
      )}
      </div>
      
      {/* Move History Sidebar */}
      <div class={styles.moveHistoryContainer}>
        <div class={`${styles.turnIndicator} ${styles[currentPlayerColor()]}`}>
          {currentPlayerColor()}'s turn
        </div>
        <h3>Move History</h3>
        <div class={styles.moveHistory}>
          <Show when={moveHistory().length > 0} fallback={<div>No moves yet</div>}>
            <For each={[...moveHistory()].reverse()}>
              {(move, index) => {
                // Use flat coordinates
                const fromX = move.fromX;
                const fromY = move.fromY;
                const toX = move.toX;
                const toY = move.toY;
                const moveNumber = move.moveNumber ?? (index() + 1);
                const moveTime = move.timestamp ? new Date(move.timestamp).toLocaleTimeString() : 'Unknown time';
                const currentMove = moveHistory()[currentMoveIndex()];
                const isNextMove = move.moveNumber === ((currentMove?.moveNumber ?? -1) + 1);
                
                // Log a warning if we're missing required coordinates
                if (fromX === undefined || fromY === undefined || toX === undefined || toY === undefined) {
                  console.warn('Move data is missing required coordinates', move);
                }
                
                return (
                  <div 
                    class={`${styles.moveItem} ${isNextMove ? styles.nextMove : ''}`}
                    data-move-number={moveNumber}
                    data-move-index={index()}
                    data-is-next-move={isNextMove}
                  >
                    <div 
                      class={styles.colorSwatch} 
                      style={{ 'background-color': move.color }}
                      title={`Player: ${move.playerId || 'Unknown'}\nColor: ${move.color}`}
                    />
                    <div class={styles.moveDetails}>
                      <div class={styles.moveHeader}>
                        <span class={styles.moveNumber}>Move {moveNumber}</span>
                        <span class={styles.moveTime}>{moveTime}</span>
                      </div>
                      <div class={styles.moveCoords}>
                        {String.fromCharCode(97 + fromX)}{fromY + 1} → {String.fromCharCode(97 + toX)}{toY + 1}
                      </div>
                      {move.playerId && (
                        <div class={styles.movePlayer} title={move.playerId}>
                          Player: {move.playerId.substring(0, 6)}...
                        </div>
                      )}
                    </div>
                  </div>
                );
              }}
            </For>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default Board;
