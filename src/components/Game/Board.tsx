import { 
  type Component, 
  createSignal,
  createEffect,
  batch,
  onMount,
  onCleanup,
  on,
} from 'solid-js';
import { useNavigate } from '@solidjs/router';

import { GridCell } from './GridCell';
import BoardControls from './BoardControls';
import { MoveHistory } from './MoveHistory';

import { useAuth } from '~/contexts/AuthContext';
import { useRestrictedSquares } from '../../contexts/RestrictedSquaresContext';

import { generateFen4, parseFen4 } from '~/utils/fen4Utils';
import { createEngineClient } from '~/engine/wsClient';
import { getColorHex } from '~/utils/colorUtils';
import { getLegalMoves } from '~/utils/gameUtils';
import { MOVE_PATTERNS } from '~/constants/movePatterns';
import { 
  isValidPieceType,
  isSquareBetween,
  isSquareUnderAttack,
  wouldResolveCheck,
  validateSquarePlacement,
  isKingInCheck
} from '~/utils/gameUtils';
import { getTeamByColor } from '~/constants/game';
import { calculateRestrictedSquares, updateBasePoint } from '~/utils/boardUtils';

import type { Point, BasePoint } from '../../types/board';
import type { Move } from '../../types/board.types';

import { 
  PLAYER_COLORS, 
  normalizeColor, 
  isInNonPlayableCorner, 
  BOARD_CONFIG, 
  DEFAULT_GAME_ID, 
  INITIAL_BASE_POINTS 
} from '~/constants/game';

import styles from './Board.module.css';

interface BoardProps {
  gameId?: string;
}

const Board: Component<BoardProps> = (props) => {
  // Function to convert internal move format to UCI format
  const moveToUCI = (move: Move): string => {
    const fromFile = String.fromCharCode(97 + move.fromX);
    const fromRank = (14 - move.fromY).toString();
    const toFile = String.fromCharCode(97 + move.toX);
    const toRank = (14 - move.toY).toString();
    return `${fromFile}${fromRank}${toFile}${toRank}`;
  };

  const auth = useAuth();
  const navigate = useNavigate();
  const [gameId, setGameId] = createSignal<string>(props.gameId || DEFAULT_GAME_ID);
  
  // Initialize the WebSocket client for the chess engine
  const engine = createEngineClient();
  const [isEngineReady, setIsEngineReady] = createSignal(false);
  const [isEngineThinking, setIsEngineThinking] = createSignal(false);
  const [isAnalyzing, setIsAnalyzing] = createSignal(false);
  const [analysis, setAnalysis] = createSignal<{score: string; depth: number; bestMove: string} | null>(null);
  const [lastAnalyzedMoves, setLastAnalyzedMoves] = createSignal<string[]>([]);
  const analysisInProgress = { current: false };
  
  // Centralized function to handle engine analysis
  const startEngineAnalysis = async (moves: string[]) => {
    const movesStr = JSON.stringify(moves);
    const lastMovesStr = JSON.stringify(lastAnalyzedMoves());
    
    if (!isEngineReady()) {
      console.log('[Engine] Skipping analysis - engine not ready');
      return;
    }
    
    if (analysisInProgress.current) {
      console.log('[Engine] Skipping analysis - already analyzing');
      return;
    }
    
    // Skip if we're already analyzing these exact moves
    if (movesStr === lastMovesStr) {
      console.log('[Engine] Skipping analysis - same moves as last analysis');
      return;
    }
    
    console.log('[Engine] Starting analysis with moves:', moves);
    analysisInProgress.current = true;
    setLastAnalyzedMoves(moves);
    setIsAnalyzing(true);
    
    try {
      await engine.startAnalysis(moves);
    } catch (error) {
      console.error('[Engine] Error during analysis:', error);
      // Reset last analyzed moves on error to ensure we can retry
      setLastAnalyzedMoves([]);
    } finally {
      analysisInProgress.current = false;
      setIsAnalyzing(false);
    }
  };
  
  // Listen for analysis updates from the engine
  onMount(() => {
    const handleAnalysis = (update: any) => {
      setAnalysis({
        score: update.score,
        depth: update.depth,
        bestMove: update.bestMove
      });
    };
    
    engine.on('analysis', handleAnalysis);
    
    return () => {
      engine.off('analysis', handleAnalysis);
    };
  });
  
  // Track the last move count to prevent duplicate analysis
  const [lastMoveCount, setLastMoveCount] = createSignal(0);

  /*
  // Reset move count when starting a new game
  const handleNewGame = () => {
    setLastMoveCount(0);
    // Call the original new game handler if it exists
    if (typeof props.onNewGame === 'function') {
      props.onNewGame();
    }
  };
  */

  // Connect to the WebSocket server when the component mounts
  onMount(() => {
    engine.connect();
    
    // Set up a listener for connection status
    createEffect(() => {
      if (engine.isConnected()) {
        console.log('Engine connected');
        setIsEngineReady(true);
        
        // Use the analyzePosition function defined at the component level
        
        // Initial analysis
        analyzePosition();
        
      } else {
        console.log('Engine disconnected');
        setIsEngineReady(false);
      }
    });
    
    // Clean up the WebSocket connection when the component unmounts
    onCleanup(() => {
      analysisInProgress.current = false;
      engine.disconnect();
    });
  });
  
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
  
  // Load moves when game ID or user changes
  createEffect(() => {
    //console.log(`[Effect] load moves`)
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
              
              const moves = rawMoves.map((move: ApiMove) => ({
                fromX: move.fromX,
                fromY: move.fromY,
                toX: move.toX,
                toY: move.toY,
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
                setMainLineMoves(moves.filter((move: Move) => !move.branchName || move.branchName === 'main'));
                setCurrentBranchName('main');
                setMoveHistory(rebuildMoveHistory('main'));
                setCurrentMoveIndex(0);
              } else {
                resetBoardToInitialState();
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
  
  // Use the imported validation function
  const validateSquarePlacementLocal = (index: number) => {
    return validateSquarePlacement(
      index,
      basePoints,
      basePoints(),
      pickedUpBasePoint(),
      restrictedSquaresInfo,
      getRestrictedSquares,
      kingInCheck,
      getTeam,
      isSquareUnderAttack,
      wouldResolveCheck,
      isSquareBetween
    );
  };

  let boardRef: HTMLDivElement | undefined;
  
  const { user } = useAuth();
  
  const {
    restrictedSquares: getRestrictedSquares,
    setRestrictedSquares
  } = useRestrictedSquares();
  
  const [error, setError] = createSignal<string | null>(null);
  const [dragStartPosition, setDragStartPosition] = createSignal<[number, number] | null>(null);
  const [pickedUpBasePoint, setPickedUpBasePoint] = createSignal<[number, number] | null>(null);
  const [isDragging, setIsDragging] = createSignal(false);
  const [targetPosition, setTargetPosition] = createSignal<[number, number] | null>(null);
  const [isProcessingMove, setIsProcessingMove] = createSignal(false);
  const [hoveredCell, setHoveredCell] = createSignal<[number, number] | null>(null);
  
  const [fullMoveHistory, setFullMoveHistory] = createSignal<Move[]>([]);
  const [mainLineMoves, setMainLineMoves] = createSignal<Move[]>([]);
  // Current move history up to the end of branch
  const [moveHistory, setMoveHistory] = createSignal<Move[]>([]);
  // Current position in the move history (for going back/forward)
  const [currentMoveIndex, setCurrentMoveIndex] = createSignal(-1);
  // Branch name for the current move (if any)
  const [currentBranchName, setCurrentBranchName] = createSignal<string | null>(null);
  
  // Type for simplified move coordinates in branch points
  interface BranchMove {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  }

  // Track branch points and their associated branches
  const [branchPoints, setBranchPoints] = createSignal<Record<number, Array<{
    branchName: string;
    parentBranch: string;
    firstMove: BranchMove;
  }>>>({});

  // Add this near other state declarations
  const [fen4, setFen4] = createSignal<string>('');

  // Add this effect to update FEN4 when position changes
  createEffect(() => {
    const points = basePoints();
    const turnIndex = currentTurnIndex();
    
    const newFen4 = generateFen4(points, turnIndex);
    setFen4(newFen4);
  });

  // Add these utility functions
  const getCurrentFen4 = (): string => fen4();

  // Generate a branch name with optional parent branch path
  const generateBranchName = (moveNumber: number, parentBranch: string | null = null): string => {
    const timestamp = Date.now().toString(36).slice(-4);
    const branchSuffix = `branch-${moveNumber}-${timestamp}`;
    return parentBranch ? `${parentBranch.split('/').slice(-1)}/${branchSuffix}` : branchSuffix;
  };


  const buildFullBranchName = (branchPath: string | null): string => {
    if (!branchPath) {
      branchPath = 'main';
    }
    const branchPathFull = branchPath?.split('/') || [];
    const branchPathShort = branchPathFull.slice(-2);
    let reconstructedBranchName = branchPathShort[1]
    let count = 10;
    let newBranchPathShort = [branchPathShort[0], 'main'];
    let newCurrentHistoryParent = [];
    while (true) {
      reconstructedBranchName = newBranchPathShort[0] + '/' + reconstructedBranchName
      if (newBranchPathShort[0] === 'main') {
        break
      };

      newCurrentHistoryParent = fullMoveHistory().filter(m => m.branchName?.endsWith(newBranchPathShort[0]));
      if (newCurrentHistoryParent[0]) {
        newBranchPathShort = newCurrentHistoryParent[0].branchName?.split('/') || [];
      }

      count = count-1;
      if (count === 0) break;
    }
    if (reconstructedBranchName === 'main/undefined') {
      reconstructedBranchName = 'main'
    }
    console.log(`[buildFullBranchName] ${reconstructedBranchName}`)

    return reconstructedBranchName
  };

  // Rebuild move history for a given target branch, handling nested branches
  const rebuildMoveHistory = (targetBranch: string | null): Move[] => {

    const branchPath = buildFullBranchName(targetBranch)?.split('/') || [];

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

  // Clean up currentMove class when component unmounts or moves change
  onCleanup(() => {
    document.querySelectorAll(`.${styles.currentMove}`).forEach(el => {
      el.classList.remove(styles.currentMove);
      el.setAttribute('data-is-current', 'false');
    });
    
    // Clean up engine connection
    if (engine) {
      try {
        engine.disconnect();
      } catch (error) {
        console.error('Error while cleaning up engine:', error);
      }
    }
  });
  
  const [currentTurnIndex, setCurrentTurnIndex] = createSignal(0);
  const currentPlayerColor = () => PLAYER_COLORS[currentTurnIndex() % PLAYER_COLORS.length];

  // Update king check status based on current board state
  const updateKingCheckStatus = (boardState: BasePoint[]) => {
    // Find all kings on the board
    const kings = boardState.filter(p => p.pieceType === 'king');
    let checkFound = false;
    
    for (const king of kings) {
      const isInCheck = isKingInCheck(
        king,
        boardState,
        getTeamByColor
      );
      
      if (isInCheck) {
        setKingInCheck({
          team: getTeamByColor(king.color) as 1 | 2,
          position: [king.x, king.y]
        });
        checkFound = true;
        // Continue checking other kings to ensure we don't miss any checks
      }
    }
    
    // If no kings are in check, clear the check state
    if (!checkFound) {
      setKingInCheck(null);
    }
  };

  // Reset the board to its initial state
  const resetBoardToInitialState = () => {
    setFullMoveHistory([]);
    setCurrentMoveIndex(0);
    setMoveHistory([]);
    setCurrentTurnIndex(0);
    setCurrentBranchName(null);
    setBranchPoints({});
    setMainLineMoves([]);

    const initialBasePoints = JSON.parse(JSON.stringify(INITIAL_BASE_POINTS));
    setBasePoints(initialBasePoints);
    
    // Update king check status after resetting the board
    updateKingCheckStatus(initialBasePoints);
    
    const currentPlayerPieces = initialBasePoints.filter((p: BasePoint) => 
      getTeamByColor(p.color) === 1  // Red team is team 1
    );
    
    // Calculate restricted squares using the local function
    const currentKingInCheck = kingInCheck();
    const isCurrentKingInCheck = currentKingInCheck !== null && currentKingInCheck.team === 1; // Check if current team's king is in check
    
    const { restrictedSquares, restrictedSquaresInfo } = calculateRestrictedSquares(
      currentPlayerPieces,
      initialBasePoints,
      { 
        isKingInCheck: isCurrentKingInCheck,
        wouldResolveCheck: (
          from: [number, number],
          to: [number, number],
          color: string,
          allBasePoints: BasePoint[],
          getTeamFn: (color: string) => number,
          isSquareUnderAttackFn: (x: number, y: number, team: number, points: BasePoint[], getTeam: (color: string) => number) => boolean,
          isSquareBetweenFn: (from: {x: number, y: number}, to: {x: number, y: number}, x: number, y: number) => boolean
        ) => wouldResolveCheck(from, to, color, allBasePoints, getTeamFn, isSquareUnderAttackFn, isSquareBetweenFn),
        isSquareUnderAttack: (x: number, y: number, team: number, points: BasePoint[], teamFn: (color: string) => number) => 
          isSquareUnderAttack(x, y, team, points, teamFn),
        isSquareBetween: (from: {x: number, y: number}, to: {x: number, y: number}, x: number, y: number) => 
          isSquareBetween(from, to, x, y),
        getTeamFn: getTeamByColor
      }
    );
    
    setRestrictedSquares(restrictedSquares);
    setRestrictedSquaresInfo(restrictedSquaresInfo);
  };

  /**
   * Replays moves on the board up to a specific index
   */
  const replayMoves = (moves: Move[], endIndex: number): BasePoint[] => {
    const positionMap = new Map<string, BasePoint>();
    
    // Initialize with a fresh copy of the initial board state
    INITIAL_BASE_POINTS.forEach(point => {
      positionMap.set(`${point.x},${point.y}`, { ...point });
    });

    // Replay each move up to the target index
    for (let i = 0; i <= endIndex; i++) {
      const move = moves[i];
      console.log(`[replayMoves] Move ${i}:`, JSON.stringify(move));
      if (!move) {
        console.warn(`[replayMoves] Missing move at index ${i}`);
        continue;
      }

      const { 
        fromX, 
        fromY, 
        toX, 
        toY, 
        pieceType, 
        id: moveId, 
        moveNumber, 
        isCastle = false,
        castleType = ''
      } = move;
      const isCastleMove = isCastle ?? false;
      const castleTypeValue = (castleType === 'KING_SIDE' || castleType === 'QUEEN_SIDE') ? castleType : null;
      
      // Validate move coordinates
      if ([fromX, fromY, toX, toY].some(coord => coord === undefined)) {
        console.error('[replayMoves] Invalid move coordinates:', { move, index: i, moveNumber });
        continue;
      }

      const fromKey = `${fromX},${fromY}`;
      const toKey = `${toX},${toY}`;
      const piece = positionMap.get(fromKey);

      if (!piece) {
        console.error(`[replayMoves] No piece at source position (${fromX},${fromY}) in move:`, { 
          move, index: i, moveNumber 
        });
        continue;
      }

      // Handle castling moves
      if (isCastleMove && castleTypeValue) {
        console.log(`[replayMoves] Castling move: ${moveId}`);
        // Get the color name from the piece's color
        const getColorName = (colorCode: string): string => {
          const colorMap: Record<string, string> = {
            '#F44336': 'RED',
            '#FFEB3B': 'YELLOW',
            '#2196F3': 'BLUE',
            '#4CAF50': 'GREEN'
          };
          return colorMap[colorCode.toUpperCase()] || '';
        };
        
        const colorName = getColorName(piece.color || '');
        const fullCastleType = `${colorName}_${castleTypeValue}` as keyof typeof MOVE_PATTERNS.CASTLING;
        const castlingConfig = MOVE_PATTERNS.CASTLING[fullCastleType];
        if (!castlingConfig) {
          console.error(`[replayMoves] Invalid castling type: ${fullCastleType}`);
          continue;
        }
        const [kingDx, kingDy, , rookX, rookY, rookDx, rookDy] = castlingConfig;
        const rookFromKey = `${rookX},${rookY}`;
        const rookToKey = `${rookX + rookDx},${rookY + rookDy}`;
        const rook = positionMap.get(rookFromKey);
        if (!rook) {
          console.error(`[replayMoves] Rook not found at (${rookX},${rookY}) for castling`);
          continue;
        }
        // Move the rook
        positionMap.delete(rookFromKey);
        positionMap.set(rookToKey, {
          ...rook,
          x: rookX + rookDx,
          y: rookY + rookDy,
          hasMoved: true
        });
      }

      // Handle captures
      if (positionMap.has(toKey)) {
        const capturedPiece = positionMap.get(toKey);
        console.log(`[replayMoves] Capturing piece at [${toX},${toY}]:`, capturedPiece);
        positionMap.delete(toKey);
      }

      // Move the piece
      const movedPiece: BasePoint = {
        ...piece,
        x: toX!,
        y: toY!,
        pieceType: (pieceType && isValidPieceType(pieceType)) ? pieceType : piece.pieceType,
        hasMoved: true,
        isCastle: isCastleMove,
        castleType: castleTypeValue
      };

      positionMap.delete(fromKey);
      positionMap.set(toKey, movedPiece);
      
      console.log(`[replayMoves] Applied move ${i+1}/${endIndex+1}: [${fromX},${fromY}]→[${toX},${toY}]`);
    }

    return Array.from(positionMap.values());
  };

  const handleDeleteCurrentMove = async () => {
    console.log('[Delete] Delete button clicked');
    const history = moveHistory();
    // Ensure we're pointing to the last move if current index is out of bounds
    let currentIndex = currentMoveIndex();
    
    // If currentIndex is out of bounds, adjust it to point to the last move
    if (currentIndex >= history.length) {
      currentIndex = Math.max(0, history.length - 1);
      console.log(`[Delete] Adjusted currentIndex from ${currentMoveIndex()} to ${currentIndex}`);
    }
    
    console.log(`[Delete] Current index: ${currentIndex}, History length: ${history.length}`);
    console.log(`[Delete] Move history:`, JSON.stringify(history, null, 2));
    
    if (currentIndex < 0 || currentIndex >= history.length || history.length === 0) {
      console.log(`[Delete] No move to delete - Index ${currentIndex} is out of bounds for history length ${history.length}`);
      return;
    }

    const currentMove = history[currentIndex];
    console.log(`[Delete] Current move to delete:`, JSON.stringify(currentMove, null, 2));
    
    // First try to delete on the server if we have the required data
    if (currentMove?.fromX !== undefined && currentMove?.fromY !== undefined && 
        currentMove?.toX !== undefined && currentMove?.toY !== undefined && 
        currentMove?.moveNumber !== undefined && props.gameId) {
      
      const moveData = {
        gameId: props.gameId,
        fromX: currentMove.fromX,
        fromY: currentMove.fromY,
        toX: currentMove.toX,
        toY: currentMove.toY,
        moveNumber: currentMove.moveNumber
      };
      
      try {
        console.log(`[Delete] Attempting to delete move at index ${currentIndex} with data:`, moveData);
        const response = await fetch('/api/moves/delete', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(moveData)
        });
        
        if (!response.ok) {
          const errorText = await response.text().catch(() => 'No error details');
          console.error(`[Delete] Server error: ${response.status} - ${errorText}`);
          throw new Error(`Server returned ${response.status}`);
        }
        
        const result = await response.json();
        console.log(`[Delete] Successfully deleted ${result.deletedCount} moves`);
      } catch (error) {
        console.error('[Delete] Failed to delete move:', error instanceof Error ? error.message : String(error));
        // Don't update local state if server deletion fails
        return;
      }
    }

    // If we get here, server deletion succeeded or wasn't needed
    const newMoveHistory = [...history];
    console.log(`[Delete] Before deletion - History length: ${newMoveHistory.length}`);
    
    newMoveHistory.splice(currentIndex, 1);
    console.log(`[Delete] After deletion - New history length: ${newMoveHistory.length}`);

    // Update fullMoveHistory to remove the deleted move and its descendants
    setFullMoveHistory(prevFullHistory => {
      // If the move has a branch name, we need to remove all moves in that branch
      if (currentMove.branchName) {
        const currentBranchName = currentMove.branchName;
        // Remove all moves that are in the same branch or a sub-branch
        return prevFullHistory.filter(move => {
          return !move.branchName?.startsWith(currentBranchName + (currentBranchName.endsWith('/') ? '' : '/')) &&
            !(move.branchName === currentBranchName && move.moveNumber >= currentMove.moveNumber);
        });
      } else {
        // For main line moves, just remove the specific move
        return prevFullHistory.filter(move => 
          !(!move.branchName && move.moveNumber === currentMove.moveNumber)
        );
      }
    });

    // Also update mainLineMoves if the deleted move was in the main line
    if (!currentMove.branchName) {
      setMainLineMoves(prevMainLine => 
        prevMainLine.filter(move => move.moveNumber !== currentMove.moveNumber)
      );
    }

    // Reset and replay moves
    console.log(`[Delete] Resetting board and replaying ${currentIndex} moves`);
    resetBoardToInitialState();
    const movesToReplay = newMoveHistory.slice(0, currentIndex);
    console.log(`[Delete] Moves to replay:`, movesToReplay);
    
    const replayedPieces = replayMoves(movesToReplay, movesToReplay.length - 1);
    
    // Update local state
    console.log(`[Delete] Updating state - New move index: ${Math.max(-1, currentIndex - 1)}`);
    setBasePoints(replayedPieces);
    setMoveHistory(newMoveHistory);
    setCurrentMoveIndex(Math.max(-1, currentIndex - 1));
  };

  const handleGoForward = async () => {
    console.log(`[handleGoForward] ${currentMoveIndex()} -- currentBranchName: ${currentBranchName()}`)

    const currentIndex = currentMoveIndex();
    const history = [...rebuildMoveHistory(currentBranchName() || 'main')]; // Create a copy of the move history array
    setMoveHistory(history);
    
    const newIndex = currentIndex + 1;
    
    // 1. Replay all moves up to the target index
    const updatedBasePoints = replayMoves(history, newIndex-1);
    
    // 2. Update board state and move index
    setBasePoints(updatedBasePoints);
    setCurrentMoveIndex(newIndex);
    
    // Update king check status after the move
    updateKingCheckStatus(updatedBasePoints);
    
    // 4. Update turn index (next player's turn)
    const newTurnIndex = (newIndex) % PLAYER_COLORS.length;
    setCurrentTurnIndex(newTurnIndex);
    
    // 5. Get current player's pieces
    const playerColorName = PLAYER_COLORS[newTurnIndex].toLowerCase();
    const currentPlayerPieces = updatedBasePoints.filter(p => 
      p.color?.toLowerCase() === playerColorName || 
      p.color?.toLowerCase() === getColorHex(playerColorName)?.toLowerCase()
    );

    // 6. Calculate and update restricted squares
    const currentKingInCheck = kingInCheck();
    const isCurrentKingInCheck = currentKingInCheck !== null && 
      getTeamByColor(PLAYER_COLORS[currentTurnIndex() % PLAYER_COLORS.length]) === currentKingInCheck.team;
      
    const { restrictedSquares, restrictedSquaresInfo } = calculateRestrictedSquares(
      currentPlayerPieces,
      updatedBasePoints,
      { 
        isKingInCheck: isCurrentKingInCheck,
        wouldResolveCheck: (
          from: [number, number],
          to: [number, number],
          color: string,
          allBasePoints: BasePoint[],
          getTeamFn: (color: string) => number,
          isSquareUnderAttackFn: (x: number, y: number, team: number, points: BasePoint[], getTeam: (color: string) => number) => boolean,
          isSquareBetweenFn: (from: {x: number, y: number}, to: {x: number, y: number}, x: number, y: number) => boolean
        ) => wouldResolveCheck(from, to, color, allBasePoints, getTeamFn, isSquareUnderAttackFn, isSquareBetweenFn),
        isSquareUnderAttack: (x: number, y: number, team: number, points: BasePoint[], teamFn: (color: string) => number) => 
          isSquareUnderAttack(x, y, team, points, teamFn),
        isSquareBetween: (from: {x: number, y: number}, to: {x: number, y: number}, x: number, y: number) => 
          isSquareBetween(from, to, x, y),
        getTeamFn: getTeamByColor
      }
    );
    
    setRestrictedSquares(restrictedSquares);
    setRestrictedSquaresInfo(restrictedSquaresInfo);
    
    // 7. Force UI update and recalculate restricted squares with latest state
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // Trigger analysis after moving forward
    const uciMoveHistory = history.slice(0, newIndex).map(moveToUCI);
    startEngineAnalysis(uciMoveHistory);
  };

  // Track if we're currently handling a go back operation
  const isHandlingGoBack = { current: false };

  // Function to analyze position with proper guards
  const analyzePosition = () => {
    if (!isEngineReady() || isHandlingGoBack.current) return;
    
    // Convert move history to UCI format
    const uciMoveHistory = moveHistory().map(moveToUCI);
    
    // Small delay to let the board state settle
    setTimeout(() => {
      try {
        if (uciMoveHistory.length > 0) {
          startEngineAnalysis(uciMoveHistory);
        }
      } catch (error) {
        console.error('Engine analysis error:', error);
      }
    }, 50);
  };

  /**
   * Handles going back one move in history
   */
  const handleGoBack = async () => {
    if (isHandlingGoBack.current) return;
    isHandlingGoBack.current = true;

    try {
      const branch = currentBranchName() || 'main';
      const currentIndex = currentMoveIndex();
      
      if (currentIndex === 0) {
        return; // Already at the start of the game
      }

      // Get the current branch points before any state changes
      const currentBranchPoints = branchPoints()[currentIndex-1]?.filter(bp => bp.branchName === branch) || [];
      const parentBranch = currentBranchPoints[0]?.parentBranch;
      
      if (parentBranch) {
        setCurrentBranchName(parentBranch);
      }
      
      // Rebuild the history for the correct branch
      const history = [...rebuildMoveHistory(parentBranch || branch)];
      const newIndex = currentIndex - 1;
      
      // Batch all state updates together
      batch(() => {
        setMoveHistory(history);
        
        const updatedBasePoints = replayMoves(history, newIndex-1);
        setBasePoints(updatedBasePoints);
        setCurrentMoveIndex(newIndex);
        
        const targetMove = history[newIndex];
        setCurrentBranchName(targetMove?.branchName || null);
        
        const newTurnIndex = newIndex % PLAYER_COLORS.length;
        setCurrentTurnIndex(newTurnIndex);
        
        updateKingCheckStatus(updatedBasePoints);
        
        const playerColorName = PLAYER_COLORS[newTurnIndex].toLowerCase();
        const currentPlayerPieces = updatedBasePoints.filter(p => 
          p.color?.toLowerCase() === playerColorName || 
          p.color?.toLowerCase() === getColorHex(playerColorName)?.toLowerCase()
        );

        const currentKingInCheck = kingInCheck();
        const isCurrentKingInCheck = currentKingInCheck !== null && 
          currentKingInCheck.team === getTeamByColor(playerColorName);
        
        const { restrictedSquares, restrictedSquaresInfo } = calculateRestrictedSquares(
          currentPlayerPieces,
          updatedBasePoints,
          { 
            isKingInCheck: isCurrentKingInCheck,
            wouldResolveCheck: (
              from: [number, number],
              to: [number, number],
              color: string,
              allBasePoints: BasePoint[],
              getTeamFn: (color: string) => number,
              isSquareUnderAttackFn: (x: number, y: number, team: number, points: BasePoint[], getTeam: (color: string) => number) => boolean,
              isSquareBetweenFn: (from: {x: number, y: number}, to: {x: number, y: number}, x: number, y: number) => boolean
            ) => wouldResolveCheck(from, to, color, allBasePoints, getTeamFn, isSquareUnderAttackFn, isSquareBetweenFn),
            isSquareUnderAttack: (x: number, y: number, team: number, points: BasePoint[], teamFn: (color: string) => number) => 
              isSquareUnderAttack(x, y, team, points, teamFn),
            isSquareBetween: (from: {x: number, y: number}, to: {x: number, y: number}, x: number, y: number) => 
              isSquareBetween(from, to, x, y),
            getTeamFn: getTeamByColor
          }
        );
        
        setRestrictedSquares(restrictedSquares);
        setRestrictedSquaresInfo(restrictedSquaresInfo);
      });
      
      // Trigger analysis after all state updates are complete
      const uciMoveHistory = history.slice(0, newIndex).map(moveToUCI);
      console.log('[handleGoBack] Starting analysis with moves:', uciMoveHistory);
      await startEngineAnalysis(uciMoveHistory);
      
    } finally {
      isHandlingGoBack.current = false;
    }
  };

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
  
  // Base points are managed by the client state
  const [basePoints, setBasePoints] = createSignal<BasePoint[]>([]);
  
  // Initialize board on mount
  onMount(async () => {
    // Set up CSS variable for grid size
    document.documentElement.style.setProperty('--grid-size', BOARD_CONFIG.GRID_SIZE.toString());

    // Set up mouse event listeners
    window.addEventListener('mouseup', handleGlobalMouseUp as EventListener);

    // Initialize engine
    try {
      if (engine && isEngineReady() && 
          typeof engine.startAnalysis === 'function' && 
          typeof engine.stopAnalysis === 'function') {
        // Handle engine move
        const handleEngineMove = async () => {
          if (!engine || !isEngineReady()) return;

          try {
            const currentMoves = moveHistory();
            const currentMoveCount = currentMoves.length;
            
            // Only proceed if there's exactly one more move than before
            if (currentMoveCount !== lastMoveCount() + 1) {
              console.log('Skipping engine move - no new move or too many moves');
              return;
            }

            // Update the last move count
            setLastMoveCount(currentMoveCount);

            // Convert move history to UCI format
            const uciMoveHistory = currentMoves.map(moveToUCI);
            const currentFen = generateFen4(basePoints(), currentTurnIndex());
            
            console.log('Starting engine analysis with FEN:', currentFen);
            console.log('Move history:', uciMoveHistory);
            
            // Start analysis with the move history
            startEngineAnalysis(uciMoveHistory);
            
            // Listen for the best move from the engine
            const bestMove = await new Promise<string>((resolve) => {
              const onBestMove = (move: string) => {
                engine.off('bestmove', onBestMove);
                resolve(move);
              };
              engine.on('bestmove', onBestMove);
              
              // Set a timeout to prevent hanging if no response
              setTimeout(() => {
                engine.off('bestmove', onBestMove);
                console.warn('Engine move timeout');
                resolve('');
              }, 10000); // 10 second timeout
            });
            
            if (bestMove) {
              // Log the engine's move in a more visible way
              const from = bestMove.substring(0, 2);
              const to = bestMove.substring(2, 4);
              console.log(
                '%cENGINE MOVE%c %s → %s',
                'background: #4a4a4a; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
                '',
                from.toUpperCase(),
                to.toUpperCase()
              );
              console.log('Full bestMove string:', bestMove);
            }
          } catch (error) {
            console.error('Engine error:', error);
          } finally {
            engine.stopAnalysis();
            setIsEngineThinking(false);
          }
        };
        resetBoardToInitialState();
      }
    } catch (error) {
      console.error('Failed to initialize engine:', error);
      setIsEngineReady(false);
    }

    resetBoardToInitialState();
  });

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
    //console.log(`[Effect] check king in check`)
  // Check all kings to see if they are in check
    const allBasePoints = basePoints();
    const restrictedSquares = getRestrictedSquares();
    const restrictedInfo = restrictedSquaresInfo();
    
    // Reset check states
    setKingInCheck(null);
    const newKingsInCheck: {[key: string]: boolean} = {};
    
    // Check each king on the board
    allBasePoints
      .filter(bp => bp.pieceType === 'king')
      .forEach(king => {
        const kingIndex = king.y * BOARD_CONFIG.GRID_SIZE + king.x;
        const kingTeam = getTeam(king.color);
        
        if (restrictedSquares.includes(kingIndex)) {
          // Check if any opponent pieces are threatening this king
          const restrictions = restrictedInfo.filter(sq => sq.index === kingIndex);
          const isInCheck = restrictions.some(restriction => 
            restriction.restrictedBy.some(r => {
              const attacker = allBasePoints.find(bp => 
                bp.x === r.basePointX && 
                bp.y === r.basePointY
              );
              return attacker && getTeam(attacker.color) !== kingTeam;
            })
          );
          
          if (isInCheck) {
            newKingsInCheck[`${king.x},${king.y}`] = true;
            
            // Update the current player's king check state if it's their turn
            const currentPlayer = currentPlayerColor();
            const currentPlayerHex = getColorHex(currentPlayer);
            if (king.color.toLowerCase() === currentPlayerHex) {
              setKingInCheck({
                team: kingTeam,
                position: [king.x, king.y]
              });
            }
          }
        }
      });
      
    // Update the kings in check state
    setKingsInCheck(newKingsInCheck);
  });

  // Handle base point pickup
  const handleBasePointPickup = (point: Point) => {
    const [x, y] = point;
    
    // Find the base point being picked up
    const basePoint = basePoints().find(bp => bp.x === x && bp.y === y);
    if (!basePoint) return;
    
    const currentTurnColorName = currentPlayerColor();
    const currentTurnHexColor = getColorHex(currentTurnColorName);
    const pieceColor = basePoint.color.toLowerCase();
    
    // Check if it's this player's turn to move (based on piece color)
    if (pieceColor !== currentTurnHexColor) {
      return; // Don't allow picking up opponent's pieces or moving out of turn
    }
    
    setPickedUpBasePoint([x, y]);
    setDragStartPosition([x, y]);
    setIsDragging(true);
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
    setBasePoints(prev => {
      const newBasePoints = prev.map(bp => 
        bp.id === pointToMove.id 
          ? { ...bp, x: targetX, y: targetY } 
          : bp
      );
      
      // Update king check status after the move
      updateKingCheckStatus(newBasePoints);
      
      return newBasePoints;
    });

    // Update the drag start position to the new position
    setDragStartPosition([targetX, targetY]);
    
    return true;
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

    // Get the legal moves for this piece to check if it's a castling move
    const legalMoves = getLegalMoves(pointToMove, basePoints(), {
      isKingInCheck: kingInCheck()?.team === getTeamByColor(pointToMove.color),
      wouldResolveCheck,
      isSquareUnderAttack,
      isSquareBetween,
      getTeamFn: getTeamByColor
    });
    // Check if this is a castling move
    const castlingMove = legalMoves.find(
      move => move.x === targetX && 
            move.y === targetY && 
            move.isCastle
    );

    return { 
      isValid: true, 
      pointToMove,
      isCastle: castlingMove?.isCastle || false,
      castleType: castlingMove?.castleType
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

  /**
   * Saves the current game state for potential rollback
   */
  const saveCurrentStateForRollback = () => {
    return {
      basePoints: [...basePoints()],
      restrictedSquares: [...getRestrictedSquares()],
      restrictedSquaresInfo: [...restrictedSquaresInfo()],
      moveHistory: [...fullMoveHistory()],
      currentMoveIndex: currentMoveIndex()
    };
  };

  // Handle mouse up anywhere on the document to complete dragging
  const handleGlobalMouseUp = async (e?: MouseEvent | Event) => {
    // Prevent multiple simultaneous move processing and validate input
    if (!(!isProcessingMove() && !!e && 'clientX' in e && isDragging() && !!pickedUpBasePoint())) {
      return;
    }

    // Set processing flag
    setIsProcessingMove(true);

    // Get and validate the move target and start position
    const target = getMoveTarget();
    if (!target) {
      cleanupDragState();
      return;
    }

    const startPos = dragStartPosition();
    if (!startPos) {
      cleanupDragState();
      return;
    }

    const [targetX, targetY] = target;
    const [startX, startY] = startPos;
    
    // Handle case where there's no movement
    if (startX === targetX && startY === targetY) {
      console.log('No movement detected, cleaning up');
      setIsProcessingMove(false);
      cleanupDragState();
      return;
    }

    // Validate the move
    const { isValid, pointToMove, error, isCastle, castleType } = validateMove(startX, startY, targetX, targetY);
    if (!isValid || !pointToMove) {
      if (error) {
        console.error('Move validation failed:', error);
      }
      cleanupDragState();
      return;
    }
    
    // Save the current state for potential rollback
    const originalState = saveCurrentStateForRollback();
    
    try {

        // Check if we're making a move from a historical position (not the latest move)
        console.log(`[handleGlobalMouseUp] currentMoveIndex: ${currentMoveIndex()}`)

        const isAtHistoricalPosition = currentMoveIndex() < moveHistory().length;
        let isBranching = false;
        let branchName: string | null = null;
        const currentIndex = currentMoveIndex();
        
        if (isAtHistoricalPosition) {
          console.log(`[handleGlobalMouseUp] inside if at historic pos`)
          
          const nextMainLineMove = mainLineMoves()[currentIndex];
          const isMainLineMove = nextMainLineMove && 
            nextMainLineMove.branchName === 'main' &&
            nextMainLineMove.fromX === startX &&
            nextMainLineMove.fromY === startY &&
            nextMainLineMove.toX === targetX &&
            nextMainLineMove.toY === targetY;
          
          if (isMainLineMove) {
            console.log(`[handleGlobalMouseUp] Move matches main line at index ${currentIndex}`)
            setCurrentBranchName('main');
            cleanupDragState();
            handleGoForward();
            return;
          } else {
            const currentBranches = branchPoints()[currentIndex] || [];
            
            // Find a matching branch for this move
            const matchingBranch = currentBranches.find(branch => {
              const parentBranch = branch.parentBranch;
              const move = branch.firstMove;
              return parentBranch === currentBranchName() &&
                     move.fromX === startX && 
                     move.fromY === startY &&
                     move.toX === targetX && 
                     move.toY === targetY;
            });
            
            if (matchingBranch) {
              console.log(`[handleGlobalMouseUp] branch`);
              
              const { branchName: matchedBranchName } = matchingBranch;
              setCurrentBranchName(matchedBranchName);
              
              // Get all moves in this branch, sorted by move number
              const branchMoves = fullMoveHistory()
                .filter(move => move && move.branchName === matchedBranchName)
                .sort((a, b) => a.moveNumber - b.moveNumber);

              if (branchMoves.length === 0) {
                console.error(`[handleGlobalMouseUp] No moves found in branch '${matchedBranchName}'`);
                cleanupDragState();
                isBranching = false;
                return; // Exit early on failure
              }
              
              handleGoForward();
              isBranching = false;
              return; // Exit early since we've handled the branch following
            }

            console.log(`[handleGlobalMouseUp] before branching ${currentIndex} -- ${currentBranchName()}`)
            setMoveHistory(rebuildMoveHistory(currentBranchName()))

            console.log(`[HandleGlobalMouseUp] attempting move: (${startX}, ${startY}) -> (${targetX}, ${targetY})`)

            const nextMove = moveHistory()[currentIndex];
            console.log(`[handleGlobalMouseUp] nextMove in branch: ${nextMove.fromX}, ${nextMove.fromY} -> ${nextMove.toX}, ${nextMove.toY}`)

            if (nextMove && nextMove.fromX === startX && nextMove.fromY === startY &&
                nextMove.toX === targetX && nextMove.toY === targetY) {
              console.log(`[handleGlobalMouseUp] follow branch`);
              handleGoForward()
              cleanupDragState();
              isBranching = false;
              return;
            }

            const branchPointMoves = branchPoints()[currentIndex+1]
              ?.filter(bp => bp.parentBranch === branchName)
              .map(bp => bp.firstMove);
            
            const isBranchPointMove = branchPointMoves?.some(branchMove => {
              return branchMove.fromX === startX &&
                     branchMove.fromY === startY &&
                     branchMove.toX === targetX &&
                     branchMove.toY === targetY;
            });

            if (isBranchPointMove) {
              console.log(`[handleGlobalMouseUp] Move matches branch point`);
              setCurrentBranchName(branchName || 'main');
              cleanupDragState();
              handleGoForward();
              return;
            }
            
            console.log(`[handleGlobalMouseUp] Move does not match branch point`);

            // If we get here, it's a new branch
            isBranching = true;
            console.log("[handleGlobalMouseUp] branching")
            const parentBranch = currentBranchName() || 'main';
            const nextMoveIdx = (currentIndex + 1) + 1; // currentIndex + 1 for 1-based, then +1 for next move
            branchName = generateBranchName(nextMoveIdx, parentBranch);
            
            setBranchPoints(prev => {
              // Ensure branchName is never null or undefined
              const safeBranchName = branchName || `branch-${Date.now()}`;
              
              const newPoints = {
                ...prev,
                [currentIndex]: [
                  ...(prev[currentIndex] || []),
                  { 
                    branchName: safeBranchName,
                    parentBranch: parentBranch,  // Include parent branch information
                    firstMove: {
                      fromX: startX,
                      fromY: startY,
                      toX: targetX,
                      toY: targetY
                    }
                  }
                ]
              };
              
              return newPoints;
            });
            setCurrentBranchName(branchName);
          }
        }

        console.log(`[handleGlobalMouseUp] after if at historic pos`)
        
        // Add move to history before updating position
        // Get the current branch name from context or previous move
        const currentBranch = branchName || currentBranchName() || 'main';
                            
        console.log(`[handleGlobalMouseUp] Current branch set to: ${currentBranch}`);
                            
        const branchMoveNumber = currentMoveIndex() + 1;
        
        console.log(`[handleGlobalMouseUp] currentBranch: '${currentBranch}' branchMoveNumber: ${branchMoveNumber}`);
        
        const newMove: Move = {
          id: Date.now().toString(),
          basePointId: pointToMove.id.toString(),
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
          pieceType: pointToMove.pieceType,
          isCastle: isCastle || false,
          castleType: (castleType === 'KING_SIDE' || castleType === 'QUEEN_SIDE') ? castleType : null
        };
        console.log(`[handleGlobalMouseUp] newMove: ${JSON.stringify(newMove)}`)

        console.log(`[handleGlobalMouseUp] moveNumber: ${newMove.moveNumber}`)
        
        // If this is a branching move, update the current branch name
        if (isBranching && branchName) {
          console.log(`[handleGlobalMouseUp] update branch name`)
          setCurrentBranchName(branchName);
        }
        
        // If this is a main line move, add it to mainLineMoves
        if (!isBranching && (!currentBranchName() || currentBranchName() === 'main')) {
          console.log(`[handleGlobalMouseUp] add to mainLineMoves`)
          setMainLineMoves(prev => {
            const updated = [...prev, newMove];
            return updated;
          });
        }
        
        // Add the new move to the full history
        let newFullHistory;
        if (isBranching) {
          console.log(`[handleGlobalMouseUp] inside isBranching`)
          const currentHistory = fullMoveHistory();
          const currentBranch = currentBranchName();
          
          // Find all moves in the current branch
          const currentBranchMoves = currentHistory.filter(move => 
            move.branchName === currentBranch
          );
          
          // The branch point is the last move in the current branch
          const branchPointMove = currentBranchMoves[currentBranchMoves.length - 1];
          
          // Find the index of the branch point in the full history
          const branchPointIndex = currentHistory.findIndex(move => 
            move === branchPointMove
          );
          
          // Insert the new move after the branch point
          newFullHistory = [
            ...currentHistory.slice(0, branchPointIndex + 1),
            newMove,
            ...currentHistory.slice(branchPointIndex + 1)
          ];
        } else {
          // Normal case - just append to the end
          newFullHistory = [...fullMoveHistory(), newMove];
          console.log(`[handleGlobalMouseUp] normal case`)
        }

        console.log(`[handleGlobalMouseUp] after isBranching`)
        
        setFullMoveHistory(newFullHistory);
        
        // Rebuild the move history for the current branch
        const currentBranchNameValue = currentBranchName();
        const linearHistory = rebuildMoveHistory(currentBranchNameValue);
        setMoveHistory(linearHistory);

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

        handleGoForward()

      } catch (error) {
        // Handle errors and revert to original state
        console.error('Error during move:', error);
        setBasePoints(originalState.basePoints);
        updateKingCheckStatus(originalState.basePoints);
        setRestrictedSquares(originalState.restrictedSquares);
        setRestrictedSquaresInfo(originalState.restrictedSquaresInfo);
        setError(error instanceof Error ? error.message : 'Failed to place base point');
        throw error; // Re-throw to trigger the finally block
      } finally {
        // Always clean up and reset the processing flag
        setIsProcessingMove(false);
        cleanupDragState();
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
        
        const board = boardRef;
        if (!board) return;

        const rect = board.getBoundingClientRect();
        const gridX = Math.floor((mouseEvent.clientX - rect.left) / (rect.width / BOARD_CONFIG.GRID_SIZE));
        const gridY = Math.floor((mouseEvent.clientY - rect.top) / (rect.height / BOARD_CONFIG.GRID_SIZE));

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
  
  return (
    <div class={styles.board}>
      
      <div class={styles.boardContent}>
        <BoardControls 
          gameId={gameId()}
          canGoBack={currentMoveIndex() >= 0}
          canGoForward={currentMoveIndex() < moveHistory().length}
          canDeleteCurrentMove={currentMoveIndex() >= 0 && moveHistory().length > 0}
          onGoBack={handleGoBack}
          onGoForward={handleGoForward}
          onReset={resetBoardToInitialState}
          onDeleteCurrentMove={handleDeleteCurrentMove}
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
          
          // Get the current best move from analysis
          const bestMove = analysis()?.bestMove;
          let isBestMoveFrom = false;
          let isBestMoveTo = false;
          
          if (bestMove) {
            // Parse the best move (format: 'a1-b2')
            const [from, to] = bestMove.split('-');
            const squareName = String.fromCharCode(97 + x) + (BOARD_CONFIG.GRID_SIZE - y);
            
            // Check if this cell is the 'from' or 'to' square of the best move
            isBestMoveFrom = from === squareName;
            isBestMoveTo = to === squareName;
          }
          
          // Update the cell state to include the new hover state and base point properties
          const cellState = {
            isBasePoint: isBP,
            isSelected,
            isHovered: !!((hoveredCell() && hoveredCell()![0] === x && hoveredCell()![1] === y)),
            isInCheck: isKingInCheck,
            isNonPlayable,
            isBestMoveFrom,
            isBestMoveTo,
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
                  setHoveredCell([x, y]);
                } else if (hoveredCell()?.[0] === x && hoveredCell()?.[1] === y) {
                  setHoveredCell(null);
                }
              }}
              onBasePointPickup={handleBasePointPickup}
            />
          );
        })}
      </div>
        <div>
          <div>Eval: {analysis()?.score}</div>
          <div>Depth: {analysis()?.depth}</div>
          <div>Best: {analysis()?.bestMove}</div>
        </div>
      {error() && (
        <div class={styles.error} classList={{ [styles.visible]: !!error() }}>
          {error()}
        </div>
      )}
      </div>
      <MoveHistory 
        moves={moveHistory()}
        currentMoveIndex={currentMoveIndex()}
        currentPlayerColor={currentPlayerColor}
        branchPoints={branchPoints()}
      />
    </div>
  );
};

export default Board;
