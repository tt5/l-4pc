import { 
  type Component, 
  type ParentProps,
  createEffect, 
  createSignal, 
  createMemo,
  Show,
  onMount,
  onCleanup,
  on,
  batch,
  For,
  createSelector
} from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { moveEventService } from '~/lib/server/events/move-events';
import { PLAYER_COLORS, type PlayerColor, isInNonPlayableCorner } from '~/constants/game';
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

interface BoardProps {
  gameId?: string;
}

const Board: Component<BoardProps> = (props) => {
  const auth = useAuth();
  const navigate = useNavigate();
  const [gameId, setGameId] = createSignal<string>(props.gameId || DEFAULT_GAME_ID);
  
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
  
  // Log game ID changes and load moves
  createEffect(() => {
    const currentGameId = gameId();
    const currentUser = auth.user();
    
    console.log('Current game ID:', currentGameId, 'User:', currentUser?.id);
    
    // Load moves for the current game
    const loadMoves = async () => {
      try {
        console.log('Fetching moves for game:', currentGameId);
        const response = await fetch(`/api/game/${currentGameId}/moves`);
        if (response.ok) {
          const { moves } = await response.json();
          const moveList = moves || [];
          console.log('Loaded moves:', moveList.length);
          setFullMoveHistory(moveList);
          setCurrentMoveIndex(moveList.length - 1);
          setMoveHistory(moveList);
          // Update the current turn index based on the number of moves
          // This ensures the correct player's turn is shown after loading
          setCurrentTurnIndex(moveList.length % PLAYER_COLORS.length);
        } else {
          console.error('Failed to load moves:', await response.text());
          setMoveHistory([]);
          setCurrentTurnIndex(0); // Reset to first player if no moves
        }
      } catch (error) {
        console.error('Failed to load moves:', error);
        setMoveHistory([]);
        setCurrentTurnIndex(0); // Reset to first player on error
      }
    };
    
    // Only load moves if we have a valid game ID and user is logged in
    if (currentGameId && currentUser) {
      loadMoves();
    } else {
      setMoveHistory([]);
    }
  });
  // Listen for move events
  createEffect(() => {
    const handleMoveMade = (move: Move) => {
      // Only add the move if it's not already in the history
      setMoveHistory(prev => {
        const exists = prev.some(m => 
          m.id === move.id || 
          (m.from[0] === move.from[0] && 
           m.from[1] === move.from[1] && 
           m.to[0] === move.to[0] && 
           m.to[1] === move.to[1] &&
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

  // Helper function to determine team based on color
  const getTeam = (color: string): 1 | 2 => {
    // Normalize color to lowercase for case-insensitive comparison
    const normalizedColor = color.toLowerCase();
    // Team 1: red (#f44336) or yellow (#ffeb3b)
    if (normalizedColor === '#f44336' || normalizedColor === '#ffeb3b') {
      return 1;
    }
    // Team 2: blue (#2196f3) or green (#4caf50)
    return 2;
  };
  
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
  // Current position in the move history (for going back/forward)
  const [currentMoveIndex, setCurrentMoveIndex] = createSignal(-1);
  // Current move history up to the current position
  const [moveHistory, setMoveHistory] = createSignal<Move[]>([]);
  
  const [currentTurnIndex, setCurrentTurnIndex] = createSignal(0);
  const currentPlayerColor = () => PLAYER_COLORS[currentTurnIndex() % PLAYER_COLORS.length];
  
  // Update the base points based on the current move history
  const updateBoardState = (moves: Move[]) => {
    // Get the current base points and create a deep copy with proper typing
    const currentBasePoints: BasePoint[] = JSON.parse(JSON.stringify(basePoints()));
    
    // Create a map of base point positions for quick lookup
    const basePointMap = new Map(
      currentBasePoints.map((bp) => [`${bp.x},${bp.y}`, bp])
    );
    
    // Apply each move in sequence
    moves.forEach(move => {
      const fromKey = `${move.from[0]},${move.from[1]}`;
      const basePoint = basePointMap.get(fromKey);
      
      if (basePoint) {
        // Remove the old position from the map
        basePointMap.delete(fromKey);
        
        // Create a new base point object with updated position
        const updatedBasePoint = {
          ...basePoint,
          x: move.to[0],
          y: move.to[1]
        };
        
        // Add the new position to the map
        basePointMap.set(`${move.to[0]},${move.to[1]}`, updatedBasePoint);
      }
    });
    
    // Update the base points state with a new array
    setBasePoints(Array.from(basePointMap.values()));
  };
  
  // Helper function to fetch initial base points
  const fetchInitialBasePoints = async (): Promise<BasePoint[]> => {
    try {
      const response = await fetch(`/api/game/${gameId()}/base-points`);
      if (response.ok) {
        const data = await response.json();
        return data.basePoints || [];
      }
      return [];
    } catch (error) {
      console.error('Failed to fetch initial base points:', error);
      return [];
    }
  };

  // Handle going back one move
  const handleGoBack = async () => {
    if (currentMoveIndex() < 0) return;
    
    const newIndex = currentMoveIndex() - 1;
    const newHistory = fullMoveHistory().slice(0, newIndex + 1);
    
    console.log('Going back - new index:', newIndex, 'history length:', newHistory.length);
    
    // Update the move history first
    setCurrentMoveIndex(newIndex);
    setMoveHistory(newHistory);
    
    // Reset to initial base points and reapply moves up to the new index
    const initialBasePoints = await fetchInitialBasePoints();
    setBasePoints(initialBasePoints);
    
    // Apply all moves up to the new index
    updateBoardState(newHistory);
    
    // Update turn index based on the number of moves
    setCurrentTurnIndex(newHistory.length % PLAYER_COLORS.length);
    
    console.log('After going back - base points:', basePoints());
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
      
      // Fetch base points
      await fetchBasePoints();
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

  // Effect to handle user changes and fetch base points
  createEffect(on(
    () => user(),
    (currentUser) => {
      if (currentUser === undefined) return;
      
      // Clear state on logout
      if (!currentUser) {
        setRestrictedSquares([]);
        setRestrictedSquaresInfo([]);
        return;
      }
      
      // Only fetch base points on login
      handleFetchBasePoints();
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
  

  // Effect to handle user changes and fetch base points
  createEffect(() => {
    const currentUser = user();
    if (currentUser) {
      handleFetchBasePoints();
    }
  });
  // Effect to check king in check when base points change
  createEffect(() => {
    if (basePoints().length > 0) {
      checkKingInCheck();
    }
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
    
    // Log visible restricted squares including capturable base points
    const visibleSquaresStr = visibleRestrictedSquares.length > 0
      ? visibleRestrictedSquares.map(sq => {
          const row = Math.floor(sq.index / BOARD_CONFIG.GRID_SIZE);
          const col = sq.index % BOARD_CONFIG.GRID_SIZE;
          const isBasePoint = 'isBasePoint' in sq ? sq.isBasePoint : basePoints().some(bp => bp.x === col && bp.y === row);
          return `(${col},${row})${isBasePoint ? ' (base point)' : ''}`;
        }).join(', ')
      : 'None';
    
    console.log(`Drag started from position: (${x},${y})`);
    console.log(`Visible restricted squares (${visibleRestrictedSquares.length}): ${visibleSquaresStr}`);
    
    // Log detailed visible restricted squares info
    if (visibleRestrictedSquares.length > 0) {
      console.log('Visible restricted squares details:');
      visibleRestrictedSquares.forEach(sq => {
        const row = Math.floor(sq.index / BOARD_CONFIG.GRID_SIZE);
        const col = sq.index % BOARD_CONFIG.GRID_SIZE;
        const isBasePoint = 'isBasePoint' in sq ? sq.isBasePoint : basePoints().some(bp => bp.x === col && bp.y === row);
        
        if (isBasePoint) {
          console.log(`- Base point (${col},${row}) - Can be captured`);
        } else {
          const sources = sq.restrictedBy
            .filter(r => r.basePointX === x && r.basePointY === y)
            .map(r => `(${r.basePointX},${r.basePointY})`)
            .join(', ');
          if (sources) {
            console.log(`- Square (${col},${row}) - Restricted by: ${sources}`);
          }
        }
      });
    }
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

  // Handle mouse up anywhere on the document to complete dragging
  const handleGlobalMouseUp = async (e?: MouseEvent | Event) => {
    // Prevent multiple simultaneous move processing
    if (isProcessingMove()) {
      console.log('Already processing a move, ignoring duplicate event');
      return;
    }

    // Convert to MouseEvent if it's a standard Event
    const mouseEvent = e && 'clientX' in e ? e : undefined;
    
    console.log('handleGlobalMouseUp triggered', { 
      isDragging: isDragging(),
      pickedUpBasePoint: pickedUpBasePoint(),
      targetPosition: targetPosition(),
      eventTarget: mouseEvent?.target?.toString(),
      currentTurnIndex: currentTurnIndex(),
      currentPlayerColor: currentPlayerColor(),
      allBasePoints: basePoints(),
      isAlreadyProcessing: isProcessingMove()
    });
    
    if (!isDragging() || !pickedUpBasePoint()) {
      console.log('Not dragging or no picked up base point, returning early');
      return;
    }

    // Set processing flag
    setIsProcessingMove(true);

    // If we don't have a target position, try to get it from the hovered cell
    let target = targetPosition();
    if (!target) {
      console.log('No target position, trying to get from hovered cell');
      const hovered = hoveredCell();
      if (hovered) {
        console.log('Using hovered cell as target position');
        target = [...hovered];
        setTargetPosition(target);
      } else {
        console.log('No hovered cell available, cleaning up');
        cleanupDragState();
        return;
      }
    }

    const [targetX, targetY] = target;
    const index = targetY * BOARD_CONFIG.GRID_SIZE + targetX;
    
    console.log('Target position:', { targetX, targetY, index });
    
    // Final validation - pass the index of the target position
    const validation = validateSquarePlacementLocal(index);
    if (!validation.isValid) {
      console.log('Validation failed:', validation.reason);
      setError(`Invalid placement: ${validation.reason || 'Unknown reason'}`);
      cleanupDragState();
      return;
    }

    const startPos = dragStartPosition();
    if (!startPos) {
      console.log('No start position, cleaning up');
      cleanupDragState();
      return;
    }

    const [startX, startY] = startPos;
    console.log('Start position:', { startX, startY });
    
    // Only proceed if we actually moved to a new cell
    if (startX !== targetX || startY !== targetY) {
      console.log('Processing move from', { startX, startY }, 'to', { targetX, targetY });
      
      // Save the current state for potential rollback
      const originalBasePoints = [...basePoints()];
      const originalRestrictedSquares = [...getRestrictedSquares()];
      const originalRestrictedSquaresInfo = [...restrictedSquaresInfo()];
      
      try {
        // 1. Optimistically update the base points in the UI
        // 1. Find the base point being moved before updating
        const pointToMove = originalBasePoints.find(bp => 
          bp.x === startX && bp.y === startY
        );

        if (!pointToMove) {
          throw new Error(`Base point not found at position (${startX}, ${startY})`);
        }

        // Check if it's this color's turn
        const currentColor = pointToMove.color.toLowerCase();
        const currentTurn = currentPlayerColor().toLowerCase();
        
        // Create a mapping of color names to their hex values for comparison
        const colorMap: Record<string, string> = {
          'red': '#f44336',
          'blue': '#2196f3',
          'yellow': '#ffeb3b',
          'green': '#4caf50'
        };
        
        // Get the normalized colors for comparison
        const normalizedCurrentColor = colorMap[currentColor] || currentColor;
        const normalizedTurnColor = colorMap[currentTurn] || currentTurn;
        
        console.log('Move attempt:', {
          movingColor: currentColor,
          currentTurn: currentTurn,
          normalizedMovingColor: normalizedCurrentColor,
          normalizedTurnColor: normalizedTurnColor,
          currentTurnIndex: currentTurnIndex(),
          allColors: PLAYER_COLORS,
          pointToMove
        });

        if (normalizedCurrentColor !== normalizedTurnColor) {
          const errorMsg = `It's not ${currentColor}'s turn. Current turn: ${currentTurn}`;
          console.error(errorMsg);
          setError(errorMsg);
          return;
        }

        // 2. Add move to history before updating position
        const newMove: Move = {
          id: Date.now(),
          basePointId: pointToMove.id,
          from: [startX, startY] as [number, number],
          to: [targetX, targetY] as [number, number],
          timestamp: Date.now(),
          playerId: pointToMove.userId,
          color: currentColor
        };
        
        // Calculate move number before updating history
        const moveNumber = moveHistory().length + 1;
        console.log('Move number:', moveNumber, 'History length:', moveHistory().length);
        
        // Add the new move to the history
        const updatedHistory = [...fullMoveHistory().slice(0, currentMoveIndex() + 1), newMove];
        setFullMoveHistory(updatedHistory);
        setCurrentMoveIndex(updatedHistory.length - 1);
        setMoveHistory(updatedHistory);
        
        // Update turn to next player
        setCurrentTurnIndex(prev => (prev + 1) % PLAYER_COLORS.length);

        // 3. Update the base points in the UI
        const updatedBasePoints = basePoints().map(bp => 
          bp.id === pointToMove.id
            ? { ...bp, x: targetX, y: targetY }
            : bp
        );
        console.log('Updating base points in UI');
        setBasePoints(updatedBasePoints);

        if (!pointToMove) {
          throw new Error(`Base point not found at position (${startX}, ${startY})`);
        }

        console.log('Found base point to move:', pointToMove);

        // 3. Update the base point in the database
        console.log('Updating base point in database...');
        const result = await updateBasePoint(pointToMove.id, targetX, targetY);
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to update base point');
        }
        console.log('Base point updated in database successfully');

        // 5. Calculate new restricted squares from the server
        console.log('Calling /api/calculate-squares with:', {
          currentPosition: [startX, startY],
          destination: [targetX, targetY],
          pieceType: pointToMove.pieceType,
          moveNumber
        });

        try {
          const response = await fetch('/api/calculate-squares', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              currentPosition: [startX, startY],
              destination: [targetX, targetY],
              pieceType: pointToMove.pieceType,
              moveNumber,
              gameId: gameId()
            })
          });

          console.log('API Response status:', response.status);
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error:', errorText);
            throw new Error(`API error: ${response.status} ${response.statusText}\n${errorText}`);
          }

          const result2 = await response.json();
          console.log('API Response:', result2);
          
          if (result2.success) {
            // Update with server-calculated values
            console.log('Updating with server-calculated values:', {
              squares: result2.data?.squares,
              squaresWithOrigins: result2.data?.squaresWithOrigins
            });
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
        console.error('Error during base point placement:', error);
        setBasePoints(originalBasePoints);
        setRestrictedSquares(originalRestrictedSquares);
        setRestrictedSquaresInfo(originalRestrictedSquaresInfo);
        setError(error instanceof Error ? error.message : 'Failed to place base point');
        throw error; // Re-throw to trigger the finally block
      } finally {
        // Always clean up and reset the processing flag
        console.log('Cleaning up drag state and resetting processing flag');
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
      const result = await updateBasePoint(pointToMove.id, targetX, targetY);
      
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
        console.log('Mouse up during drag', { 
          target: e.target?.toString(),
          isDragging: isDragging(),
          pickedUpBasePoint: pickedUpBasePoint()
        });
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
          onGoBack={handleGoBack}
          onReset={async () => {
            // Reset move history and turn counter
            setFullMoveHistory([]);
            setCurrentMoveIndex(-1);
            setMoveHistory([]);
            setCurrentTurnIndex(0);
            
            // Refresh the base points
            await fetchBasePoints();
            
            // Refresh the restricted squares
            const squaresResponse = await fetch('/api/calculate-squares', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                currentPosition: [0, 0],
                destination: [0, 0],
                gameId: gameId()
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
                // Handle both move formats: fromX/Y and from/to tuples
                const fromX = move.fromX ?? move.from?.[0] ?? 0;
                const fromY = move.fromY ?? move.from?.[1] ?? 0;
                const toX = move.toX ?? move.to?.[0] ?? 0;
                const toY = move.toY ?? move.to?.[1] ?? 0;
                const moveNumber = move.moveNumber ?? (moveHistory().length - index());
                const moveTime = move.timestamp ? new Date(move.timestamp).toLocaleTimeString() : 'Unknown time';
                
                // Log a warning if we're using fallback values
                if ((!move.fromX && !move.from?.[0]) || (!move.toX && !move.to?.[0])) {
                  console.warn('Move data format unexpected, using fallback values:', move);
                }
                
                return (
                  <div class={styles.moveItem}>
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
