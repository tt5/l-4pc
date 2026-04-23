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
import { getEngineClient } from '~/engine/wsClient';

import { GridCell } from './GridCell';
import BoardControls from './BoardControls';
import { MoveHistory } from './MoveHistory';
import ThreadControl from './ThreadControl';
import EngineControl from '../EngineControl/EngineControl';

import { useAuth } from '~/contexts/AuthContext';
import { useRestrictedSquares } from '../../contexts/RestrictedSquaresContext';

import { generateFen4, parseFen4 } from '~/utils/fen4Utils';
import { makeApiCall, parseApiResponse, generateRequestId, makeAuthenticatedApiCall } from '~/utils/clientApi';
import { generateBranchName, buildFullBranchName } from '~/utils/branchUtils';
import { MOVE_PATTERNS } from '~/constants/movePatterns';
import {
  getLegalMoves,
  isKingInCheck,
  moveToUCI,
  trackPieceMovement,
  resetMovedPieces
} from '~/utils/gameUtils';
import { calculateRestrictedSquares, updateMove, generateNewGameId, replayMoves } from '~/utils/boardUtils';
import { getColorHex } from '~/utils/colorUtils';

import { type Point, type BasePoint, type Move, type BranchPoints, type SquareIndex, createPoint, RestrictedSquareInfo, RestrictedSquares, PieceType, HexColor, ApiMove, BranchList, BranchListItem, SimpleMove } from '../../types/board';

import { 
  PLAYER_COLORS, 
  INITIAL_BASE_POINTS,
  DEFAULT_GAME_ID, 
  INITIAL_RESTRICTED_SQUARES,
  INITIAL_RESTRICTED_SQUARES_INFO,
  BOARD_CONFIG,
  isInNonPlayableCorner,
  NamedColor,
} from '~/constants/game';

import styles from './Board.module.css';

interface BoardProps {
  gameId?: string;
  onGameIdChange?: (gameId: string) => void;
  onGameUpdate?: () => void;
}

export function validateSquarePlacement(
  index: SquareIndex,
  getRestrictedSquares: () => RestrictedSquares,
): { isValid: boolean } {
    
  if (getRestrictedSquares().includes(index)) {
    return { isValid: true };
  }
  
  return { isValid: false };
}

const Board: Component<BoardProps> = (props) => {

  const auth = useAuth();
  const navigate = useNavigate();
  const engine = getEngineClient();

  const [gameId, setGameId] = createSignal<string>(props.gameId || DEFAULT_GAME_ID);
  const [isEngineReady, setIsEngineReady] = createSignal(false);
  const [isAnalyzing, setIsAnalyzing] = createSignal(false);
  const [isSaving, setIsSaving] = createSignal(false);
  const [isAnalysisStopped, setIsAnalysisStopped] = createSignal(false);
  const [threads, setThreads] = createSignal(1);
  const [isLoadingThreads, setIsLoadingThreads] = createSignal(false);
  const [analysis, setAnalysis] = createSignal<{score: string; depth: number; bestMove: string} | null>(null);
  const [cellSize, setCellSize] = createSignal(50); // Default cell size
  const [enPassantTargets, setEnPassantTargets] = createSignal<Record<NamedColor, {x: number, y: number, color: NamedColor} | null>>({
    'RED': null,
    'YELLOW': null,
    'BLUE': null,
    'GREEN': null
  });
  const [fullMoveHistory, setFullMoveHistory] = createSignal<Move[]>([]);
  const [kingsInCheck, setKingsInCheck] = createSignal<{[key: string]: boolean}>({});
  const [error, setError] = createSignal<string | null>(null);
  const [pickedUpBasePoint, setPickedUpBasePoint] = createSignal<BasePoint | null>(null);
  const [isDragging, setIsDragging] = createSignal(false);
  const [targetPosition, setTargetPosition] = createSignal<Point | null>(null);
  const [isProcessingMove, setIsProcessingMove] = createSignal(false);
  const [hoveredCell, setHoveredCell] = createSignal<Point | null>(null);
  const [mainLineMoves, setMainLineMoves] = createSignal<Move[]>([]);
  // Current move history up to the end of branch
  const [moveHistory, setMoveHistory] = createSignal<Move[]>([]);
  // Current position in the move history (for going back/forward)
  const [currentMoveIndex, setCurrentMoveIndex] = createSignal(-1);
  const [currentTurnIndex, setCurrentTurnIndex] = createSignal(0);
  // Branch name for the current move (if any)
  const [currentBranchName, setCurrentBranchName] = createSignal<string>('main');
  // Track branch points and their associated branches
  const [branchPoints, setBranchPoints] = createSignal<BranchPoints>({});
  const [fen4, setFen4] = createSignal<string>('');
  const [restrictedSquaresInfo, setRestrictedSquaresInfo] = createSignal<RestrictedSquareInfo[]>([]);
  const [lastHoveredCell, setLastHoveredCell] = createSignal<Point | null>(null);
  const [basePoints, setBasePoints] = createSignal<BasePoint[]>([]);
  const [lastLoadedState, setLastLoadedState] = createSignal<{
    gameId: string | null;
    userId: string | null;
  }>({ gameId: null, userId: null });
  

  const analysisInProgress = { current: false };
  const isHandlingGoBack = { current: false };

  let boardRef: HTMLDivElement | undefined;
  
  const { user } = useAuth();
  
  const {
    restrictedSquares: getRestrictedSquares,
    setRestrictedSquares
  } = useRestrictedSquares();

  // Set up engine status listener
  onMount(() => {
    let isMounted = true;
    
    const handleStatusUpdate = async (status: { running: boolean }) => {
      if (!isMounted) return;
      
      console.log(`[Board] Engine status update: running: ${status.running}`);
      const isRunning = status?.running === true;
      setIsEngineReady(isRunning);
      
      // Clear analysis state when engine is stopped
      if (!isRunning) {
        console.log('[Board] Engine stopped, clearing analysis state');
        setAnalysis(null);
        setIsAnalyzing(false);
        setIsAnalysisStopped(false);
        analysisInProgress.current = false;
      }
      
      // Only connect if engine is running and not already connected
      if (isRunning && !engine.isConnected()) {
        console.log('[Board] Engine is running, attempting to connect...');
        
        try {
          const connected = await engine.connect();
          if (!connected) {
            console.error('[Board] Failed to connect to engine');
            return;
          }
          
          console.log('[Board] Successfully connected to engine');
          
        } catch (err) {
          console.error('[Board] Error connecting to engine:', err);
        }
      }
    };

    const handleEngineStopped = () => {
      if (!isMounted) return;
      console.log('[Board] Received engine stopped event, clearing analysis state');
      setAnalysis(null);
      setIsAnalyzing(false);
      setIsAnalysisStopped(false);
      analysisInProgress.current = false;
    };

    // Set up event listeners
    const cleanupStatus = engine.on('status', handleStatusUpdate);
    const cleanupStopped = engine.on('stopped', handleEngineStopped);
    
    return () => {
      isMounted = false;
      cleanupStatus();
      cleanupStopped();
    };
  });

  const startEngineAnalysis = async (ucimoves: string[]): Promise<boolean> => {
    
    if (!isEngineReady()) {
      console.log('[Engine] Engine not ready, skipping analysis');
      return false;
    }

    if (!engine.isConnected()) {
      console.log('[Engine] Not connected');
      return false;
    }
    
    if (analysisInProgress.current) {
      console.log('[Engine] Skipping analysis - already analyzing');
      return false;
    }
    
    // Don't start analysis if it was explicitly stopped
    if (isAnalysisStopped()) {
      console.log('[Engine] Skipping analysis - analysis was stopped by user');
      return false;
    }
    
    console.log(`[Engine] Starting analysis`);
    analysisInProgress.current = true;
    setIsAnalyzing(true);
    
    try {
      await engine.startAnalysis(ucimoves);
      return true;
    } catch (error) {
      console.error('[Engine] Error during analysis:', error);
      analysisInProgress.current = false;
      setIsAnalyzing(false);
      return false;
    }
  };
  
  const toggleAnalysis = async (): Promise<boolean> => {
    if (!isEngineReady()) {
      console.log('[Engine] Engine not ready');
      return false;
    }
    
    // If analysis is stopped or not yet started, start it
    if (isAnalysisStopped() || !isAnalyzing()) {
      console.log('[Engine] Starting analysis');
      setIsAnalysisStopped(false);
      const currentMoves = moveHistory().slice(0, currentMoveIndex()).map(moveToUCI);
      const success = await startEngineAnalysis(currentMoves);
      if (!success) {
        console.error('[Engine] Failed to start analysis');
        return false;
      }
      setIsAnalyzing(true);
      return true;
    } 
    // Otherwise stop it
    else {
      console.log('[Engine] Stopping analysis');
      try {
        const success = await engine.stopAnalysis();
        if (success) {
          setIsAnalysisStopped(true);
          setIsAnalyzing(false);
          analysisInProgress.current = false;
          setAnalysis(null); // Clear the analysis state when stopping
          return true;
        }
        return false;
      } catch (error) {
        console.error('[Engine] Error stopping analysis:', error);
        return false;
      }
    }
  };

  const handleThreadChange = async (newThreads: number) => {
    console.log(`[Board] handleThreadChange called with: ${newThreads}`);
    
    if (isNaN(newThreads) || newThreads < 1 || newThreads > 8) {
      console.warn('[Board] Invalid thread count:', newThreads);
      return;
    }
    
    console.log('[Board] Starting thread count update...');
    setIsLoadingThreads(true);
    
    try {
      console.log(`[Board] Current thread count: ${threads()}`);
      console.log(`[Board] Requesting thread count change to: ${newThreads}`);
      
      const success = await engine.setThreads(newThreads);
      console.log(`[Board] engine.setThreads returned: ${success}`);
      
      if (success) {
        console.log(`[Board] Updating local thread state to: ${newThreads}`);
        setThreads(newThreads);
        console.log('[Board] Thread count updated successfully');
      } else {
        console.warn('[Board] Failed to update thread count: engine.setThreads returned false');
      }
    } catch (error) {
      console.error('[Board] Error updating thread count:', error);
    } finally {
      console.log('[Board] Completing update process');
      setIsLoadingThreads(false);
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
  
  // Initialize the board when the component mounts
  onMount(async () => {
    try {
      if (props.gameId) {
        await loadGame(props.gameId);
      } else {
        console.log('No game found, initializing new game');
        resetBoardToInitialState();
      }
    } catch (error) {
      console.error('Error initializing game:', error);
      resetBoardToInitialState();
    }
  });
  
  // Load a game by ID
  const handleLoadGame = async (gameIdToLoad: string) => {
    if (!gameIdToLoad) {
      console.log('[handleLoadGame] No game ID provided');
      return;
    }
    
    try {
      await loadGame(gameIdToLoad);
      // Update the URL with the new game ID
      if (props.onGameIdChange) {
        props.onGameIdChange(gameIdToLoad);
      }
      // Refresh the game list
      if (props.onGameUpdate) {
        props.onGameUpdate();
      }
    } catch (error) {
      console.error('Error loading game:', error);
    }
  };

  const loadGame = async (gameIdToLoad: string) => {
    console.log(`[loadGame] Starting to load game with ID: ${gameIdToLoad}`);
    
    if (!gameIdToLoad) {
      console.log('[loadGame] No game ID provided, initializing new game');
      resetBoardToInitialState();
      return;
    }

    const currentUser = auth.user();
    
    if (!currentUser) {
      console.log('[loadGame] No user logged in, initializing new game');
      resetBoardToInitialState();
      return;
    }

    try {
      const url = `/api/game/${gameIdToLoad}/moves`;
      console.log(`[loadGame] Fetching moves from: ${url}`);
      
      const userToken = auth.getToken();
      const requestId = generateRequestId();
      const response = await makeApiCall(url, {}, userToken || undefined);
      const result = await parseApiResponse(response, requestId);
      
      const rawMoves = Array.isArray(result.data.moves) ? result.data.moves : [];
      
      if (rawMoves.length === 0) {
        console.log('[loadGame] No moves found, initializing new game');
        resetBoardToInitialState();
        // Refresh game list even when no moves are found
        if (props.onGameUpdate) {
          props.onGameUpdate();
        }
        return;
      }      

      function convertApiMove(move: ApiMove): Move {
        return {
            fromX: move.fromX,
            fromY: move.fromY,
            toX: move.toX,
            toY: move.toY,
            pieceType: move.pieceType,
            id: move.id,
            moveNumber: move.moveNumber,
            isBranch: move.isBranch || false,
            branchName: move.branchName,
            color: move.color,
            parentBranchName: move.branchName.split('/')[0],
            isCastle: false,
            castleType: null,
            isEnPassant: false,
            capturedPiece: undefined
        }
      }
      // unsorted
      const moves: Move[] = rawMoves.map(convertApiMove);

      // Update state in a batch
      batch(() => {
        setGameId(gameIdToLoad);
        // unordered
        setFullMoveHistory(moves);
        
        if (moves.length > 0) {

          // Reconstruct branchPoints from fullMoveHistory
          const reconstructedBranchPoints: BranchPoints = {};

          const branchMoves = moves.filter((move) => move.branchName !== 'main');
          const processedBranches = new Set<string>();
          
          branchMoves.forEach((move) => {
            // Skip if this branch has already been processed
            if (processedBranches.has(move.branchName)) {
              return;
            }
            
            const branchPointMoveNumber = move.moveNumber - 1;
            
            // Find the parent branch (look for moves with same moveNumber but different/no branchName)
            const parentMove = moves.find((m) => 
              m.moveNumber === branchPointMoveNumber && 
              m.branchName === 'main'
            );
            
            if (parentMove) {
              if (!reconstructedBranchPoints[branchPointMoveNumber]) {
                reconstructedBranchPoints[branchPointMoveNumber] = [];
              }
              
              // Check if this branch is already added
              const existingBranch = reconstructedBranchPoints[branchPointMoveNumber]
                .find((bp) => bp.branchName === move.branchName);
              
              if (!existingBranch) {
                reconstructedBranchPoints[branchPointMoveNumber].push({
                  branchName: move.branchName,
                  parentBranch: move.parentBranchName || 'main',
                  firstMove: {
                    fromX: move.fromX,
                    fromY: move.fromY,
                    toX: move.toX,
                    toY: move.toY
                  }
                });
                
                // Mark this branch as processed
                processedBranches.add(move.branchName);
              }
            }
          });

          setBranchPoints(reconstructedBranchPoints);

          setMainLineMoves(moves
            .filter((m) => m.branchName === 'main')
            .sort((a, b) => a.moveNumber - b.moveNumber)
          );
          setCurrentBranchName('main');
          setMoveHistory(rebuildMoveHistory('main'));
          setCurrentMoveIndex(0);
          setCurrentTurnIndex(0);
        } else {
          resetBoardToInitialState();
        }
        
        setLastLoadedState({
          gameId: gameIdToLoad,
          userId: currentUser.id
        });
        
        // Update URL if needed
        if (!window.location.pathname.includes(gameIdToLoad)) {
          //navigate(`/game/${gameIdToLoad}`, { replace: true });
        }
      });
    } catch (error) {
      console.error('Error loading game:', error);
      resetBoardToInitialState();
      throw error;
    }
  };
  
  // Load moves when game ID or user changes
  createEffect(() => {
    const currentGameId = gameId();
    const currentUser = auth.user();
    const lastState = lastLoadedState();
    
    // Only load moves if we have a valid game ID and user is logged in
    if (currentGameId && currentUser) {
      if (currentGameId !== lastState.gameId || currentUser.id !== lastState.userId) {
        // Load the game using the new loadGame function
        loadGame(currentGameId).then(() => {
          // Refresh game list after loading a game
          if (props.onGameUpdate) {
            props.onGameUpdate();
          }
        }).catch(console.error);
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

  const cleanupDragState = () => {
    setIsDragging(false);
    setPickedUpBasePoint(null);
    setHoveredCell(null);
    setTargetPosition(null);
    setIsProcessingMove(false);
    setLastHoveredCell(null);
    setError(null);
  };

  const validateSquarePlacementLocal = (index: SquareIndex): {isValid: boolean} => {
    return validateSquarePlacement(
      index,
      () => getRestrictedSquares() as RestrictedSquares,
    );
  };
  
  /*
  // update FEN4 when position changes
  createEffect(() => {
    const points = basePoints();
    const turnIndex = currentTurnIndex();
    const newFen4 = generateFen4(points, turnIndex);
    setFen4(newFen4);
  });
  */

  const getCurrentFen4 = (): string => fen4();

  // Rebuild move history for a given target branch, handling nested branches
  const rebuildMoveHistory = (targetBranch: string): Move[] => {

    const branchPath = buildFullBranchName(targetBranch, fullMoveHistory()).split('/');
    console.log(`[rebuildMoveHistory] branchPath: ${branchPath}`)

    // Start with main line
    let currentHistory = fullMoveHistory().filter(m => m.branchName === 'main')

    for (const branch of branchPath) {
      const branchMoves = fullMoveHistory().filter(m => 
        m.branchName.endsWith(branch)
      )
      
      if (branchMoves.length > 0) {
        const branchPoint = Math.min(...branchMoves.map(m => m.moveNumber));
        currentHistory = [
          ...currentHistory.filter(m => m.moveNumber < branchPoint),
          ...branchMoves
        ];
      }
    }
    
    const sortedHistory = currentHistory.sort((a, b) => a.moveNumber - b.moveNumber);
    console.log(`[rebuildMoveHistory] sorted new history: ${JSON.stringify(sortedHistory.map(m => ({moveNumber: m.moveNumber, branchName: m.branchName})))}`)
    return sortedHistory
  };

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
  
  const currentPlayerColor = () => PLAYER_COLORS[currentMoveIndex() % PLAYER_COLORS.length];

  const getCurrentPlayerPieces = (basePoints: BasePoint[]) => {
    const playerColorName = currentPlayerColor();
    return basePoints.filter(p => p.color === playerColorName);
  };

  // Update king check status based on current board state
  const updateKingCheckStatus = (boardState: BasePoint[]) => {
    // Find all kings on the board
    const kings = boardState.filter(p => p.pieceType === 'king');
    let checkFound = false;
    
    for (const king of kings) {
      const isInCheck = isKingInCheck(king, boardState);
      
      if (isInCheck) {
        checkFound = true;
      }
    }
    
    //console.log(`[updateKingCheckStatus] checkFound: ${checkFound}, currentMoveIndex: ${currentMoveIndex()}`)
  };

  // Reset the board to its initial state
  const resetBoardToInitialState = () => {
    setFullMoveHistory([]);
    setCurrentMoveIndex(0);
    setMoveHistory([]);
    setCurrentTurnIndex(0);
    setCurrentBranchName('main');
    setBranchPoints({});
    setMainLineMoves([]);
    setGameId(DEFAULT_GAME_ID);
    resetMovedPieces();
    const initialBasePoints = JSON.parse(JSON.stringify(INITIAL_BASE_POINTS));
    setBasePoints(initialBasePoints);
    setRestrictedSquares(INITIAL_RESTRICTED_SQUARES);
    setRestrictedSquaresInfo(INITIAL_RESTRICTED_SQUARES_INFO as RestrictedSquareInfo[]);
  };

  const handleSaveGame = async () => {
    if (isSaving()) return;
    
    setIsSaving(true);
    try {
      const currentGameId = gameId();
      let newGameId: string;
      
      if (currentGameId === "default") {
        // Prompt user for a game name
        const gameName = window.prompt('Enter a name for your game:');
        if (!gameName) {
          setIsSaving(false);
          return; // User cancelled
        }
        // Generate a URL-friendly ID from the game name
        newGameId = gameName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
        
        // Ensure the ID is not empty
        if (!newGameId) {
          newGameId = generateNewGameId();
        }
      } else {
        // For existing games, ask if they want to change the name
        const shouldChangeName = window.confirm(`Current game ID: ${currentGameId}\n\nDo you want to change the game name?`);
        
        if (shouldChangeName) {
          const newName = window.prompt('Enter a new name for your game:', currentGameId);
          if (newName) {
            // Generate a URL-friendly ID from the new name
            newGameId = newName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '');
            
            // If the result is empty or the same as current, keep the original
            if (!newGameId || newGameId === currentGameId) {
              newGameId = currentGameId;
            }
          } else {
            // User cancelled or entered empty name, keep the original
            newGameId = currentGameId;
          }
        } else {
          // User chose not to change the name
          newGameId = currentGameId;
        }
      }
      
      const requestId = generateRequestId();
      console.log(`[${requestId}] [Save] Saving game with ID: ${newGameId}`);
      
      try {
        const userToken = auth.getToken();
        const response = await makeApiCall('/api/game/update-id', {
          method: 'POST',
          body: JSON.stringify({
            currentGameId,
            newGameId
          })
        }, userToken || undefined);
        await parseApiResponse(response, requestId);
        console.log(`[${requestId}] [Save] Successfully saved game as ${newGameId}`);
      } catch (error) {
        console.error(`[${requestId}] [Save] Failed to save game:`, error);
        throw error;
      }
      
      // Update the game ID in the URL and state
      setGameId(newGameId);
      if (props.onGameIdChange) {
        props.onGameIdChange(newGameId);
      }
      
      // Notify parent component to refresh the game list
      if (props.onGameUpdate) {
        props.onGameUpdate();
      }
    } catch (error) {
      console.error('[Save] Failed to save game:', error instanceof Error ? error.message : String(error));
      throw error; // Re-throw to allow error handling in the calling component
    } finally {
      setIsSaving(false);
    }
  };

  const deleteLastMoves = async (moves: Move[]) => {
    console.log(`[deleteLastMoves]`);

    const newMoveHistory = moveHistory();
    
    try {
      const requestId = generateRequestId();
      const userToken = auth.getToken();
      const response = await makeApiCall(`/api/moves/${moves[0].id}`, {
        method: 'DELETE',
      }, userToken || undefined);
      
      const result = await parseApiResponse(response, requestId);
      console.log(`[deleteLastMoves] Successfully deleted ${JSON.stringify(result)}`);
    } catch (error) {
      console.error(`[deleteLastMoves] Failed to delete move:`, error instanceof Error ? error.message : String(error));
      // Don't update local state if server deletion fails
      return;
    }

    newMoveHistory.splice(moves[0].moveNumber, moves.length);

    setFullMoveHistory(prevFullHistory => {
      return prevFullHistory.filter(m1 =>
        !moves.some(m2 => 
          m1.branchName === m2.branchName &&
          m1.moveNumber === m2.moveNumber
        )
      );
    });

    if (moves[0].branchName === 'main') {
      setMainLineMoves(prevMainLine => 
        prevMainLine.filter(m => m.moveNumber <= moves[0].moveNumber)
      );
    }

    setBranchPoints(prevBranchPoints => {
      const newBranchPoints = { ...prevBranchPoints };
  
      // keys are string type internally
      Object.keys(newBranchPoints).forEach(key => {
        newBranchPoints[Number(key)] = prevBranchPoints[Number(key)].filter(bp => 
          !moves.some(move => 
            ((move.moveNumber - 1) === Number(key)) && (move.branchName === bp.branchName)
          )
        );
      });

      return newBranchPoints;
    });
 
    setMoveHistory(newMoveHistory)
  };

  const handleDeleteCurrentMove = async () => {
    console.log('[Delete]');
    const history = moveHistory();
    let currentIndex = currentMoveIndex();
    console.log(`[Delete] currentIndex: ${currentIndex}, history.length: ${history.length}`)

    if (currentIndex < history.length) {
      console.log("[Delete] historical position")
      const movesToDelete = moveHistory()
        .slice(currentIndex,history.length)
      console.log(`[Delete] ${movesToDelete.length} moves to delete`)
      await deleteLastMoves(movesToDelete)

      currentIndex -= 1;
    }
    
    if (currentIndex >= history.length) {
      currentIndex = Math.max(0, history.length - 1);
    }
    const newMoveHistory = moveHistory();
    console.log(`[Delete] updated moveHistory length: ${history.length}`)
    
    const currentMove = history[currentIndex];
    
    // First try to delete on the server
    const requestId = generateRequestId();
    try {
      const userToken = auth.getToken();
      const response = await makeApiCall(`/api/moves/${currentMove.id}`, {
        method: 'DELETE',
      }, userToken || undefined);
      
      const result = await parseApiResponse(response, requestId);
      console.log(`[${requestId}] [Delete] Successfully deleted ${result.data?.deletedCount || 0} moves`);
    } catch (error) {
      console.error(`[${requestId}] [Delete] Failed to delete move:`, error instanceof Error ? error.message : String(error));
      // Don't update local state if server deletion fails
      return;
    }

    newMoveHistory.splice(currentIndex, 1);

    // Update fullMoveHistory to remove the deleted move and its descendants
    setFullMoveHistory(prevFullHistory => {
      // If the move has a branch name, we need to remove all moves in that branch
      if (currentMove.branchName !== 'main') {
        const currentBranchName = currentMove.branchName;
        return prevFullHistory.filter(move => {
          return !move.branchName.startsWith(currentBranchName + (currentBranchName.endsWith('/') ? '' : '/')) &&
            !(move.moveNumber >= currentMove.moveNumber);
        });
      } else {
        return prevFullHistory.filter(move => {
          const isTargetMove = move.moveNumber >= currentMove.moveNumber;
          return !(isTargetMove);
        });
      }
    });

    // Also update mainLineMoves if the deleted move was in the main line
    if (currentMove.branchName === 'main') {
      setMainLineMoves(prevMainLine => 
        prevMainLine.filter(move => move.moveNumber <= currentMove.moveNumber)
      );
    }

    // Clean up branchPoints
    setBranchPoints(prevBranchPoints => {
      const newBranchPoints = { ...prevBranchPoints };
      
      // keys are string type internally
      Object.keys(newBranchPoints).forEach(key => {
          newBranchPoints[Number(key)] = prevBranchPoints[Number(key)].filter(bp => {
              return !(((currentMove.moveNumber - 1) === Number(key)) && (currentMove.branchName == bp.branchName));
            }
          );
      });

      return newBranchPoints;
    });

    // Update local state
    const { basePoints: replayedPieces } = replayMoves(newMoveHistory, newMoveHistory.length - 1);
    const currentBranch = currentBranchName();
    const newMoveIndex = Math.max(-1, currentIndex);
    const newTurnIndex = (newMoveIndex) % PLAYER_COLORS.length;
    batch(()=> {
      setBasePoints(replayedPieces);
      setMoveHistory(newMoveHistory);
      setCurrentMoveIndex(newMoveIndex);
      setCurrentTurnIndex(newTurnIndex);
      setCurrentBranchName(currentBranch);
      setMoveHistory(rebuildMoveHistory(currentBranchName()))
    })
    handleGoBack()
    setCurrentBranchName(currentBranch)
    handleGoForward()
  };

  const handleGoForward = async () => {
    console.log(`[handleGoForward] ${currentMoveIndex()}, currentBranchName: ${currentBranchName()}`)

    const currentIndex = currentMoveIndex();
    const history = [...rebuildMoveHistory(currentBranchName())]; // Create a copy of the move history array
    setMoveHistory(history);
    
    // 1. Replay all moves up to the target index
    const { basePoints: updatedBasePoints } = replayMoves(history, currentIndex);
    
    batch(() => {
    // 2. Update board state and move index
    setBasePoints(updatedBasePoints);
    const newIndex = currentIndex + 1;
    setCurrentMoveIndex(newIndex);
    
    // 3. Update king check status after the move
    updateKingCheckStatus(updatedBasePoints);
    
    // 4. Update turn index (next player's turn)
    const newTurnIndex = (newIndex) % PLAYER_COLORS.length;
    setCurrentTurnIndex(newTurnIndex);
    })
    
    // 5. Get current player's pieces
    const currentPlayerPieces = getCurrentPlayerPieces(basePoints());

    // 6. Calculate and update restricted squares
    const { restrictedSquares, restrictedSquaresInfo } = calculateRestrictedSquares(
      currentPlayerPieces,
      updatedBasePoints,
      { enPassantTarget: enPassantTargets() }
    );
    
    setRestrictedSquares(restrictedSquares);
    setRestrictedSquaresInfo(restrictedSquaresInfo);
    
    // 7. Force UI update and recalculate restricted squares with latest state
    await new Promise(resolve => setTimeout(resolve, 0));

    analyzePosition(currentIndex);
  };

  // Function to analyze position with proper guards
  const analyzePosition = (moveIndex: number) => {
    if (!isEngineReady() || isHandlingGoBack.current || !isAnalyzing()) return;
    try {
      engine.stopAnalysis();
    } catch (error) {
      console.error('Engine stop analysis error:', error);
    }
    
    const uciMoveHistory = moveHistory()
      .slice(0, moveIndex + 1)  // +1 because slice end is exclusive
      .map(moveToUCI);
    
    // Small delay to let the board state settle
    setTimeout(() => {
      try {
        if (uciMoveHistory.length > 0) {
          engine.startAnalysis(uciMoveHistory);
        }
      } catch (error) {
        console.error('Engine start analysis error:', error);
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
      const branch = currentBranchName();
      const currentIndex = currentMoveIndex();
      
      if (currentIndex <= 0) {
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
        
        const { basePoints: updatedBasePoints } = replayMoves(history, newIndex-1);
        setBasePoints(updatedBasePoints);
        setCurrentMoveIndex(newIndex);
        
        const targetMove = history[newIndex];
        setCurrentBranchName(targetMove.branchName);
        
        const newTurnIndex = newIndex % PLAYER_COLORS.length;
        setCurrentTurnIndex(newTurnIndex);
        
        updateKingCheckStatus(updatedBasePoints);
        
        const currentPlayerPieces = getCurrentPlayerPieces(updatedBasePoints);

        const { restrictedSquares, restrictedSquaresInfo } = calculateRestrictedSquares(
          currentPlayerPieces,
          updatedBasePoints,
          { enPassantTarget: enPassantTargets() }
        );
        
        setRestrictedSquares(restrictedSquares);
        setRestrictedSquaresInfo(restrictedSquaresInfo);
      });

      await new Promise(resolve => setTimeout(resolve, 0));

    } finally {
      isHandlingGoBack.current = false;
      analyzePosition(currentMoveIndex()-1);
      console.log(`[handleGoBack] currentBranchName: ${currentBranchName()}`)
    }
  };

  onMount(async () => {
    // Set up CSS variable for grid size
    document.documentElement.style.setProperty('--grid-size', BOARD_CONFIG.GRID_SIZE.toString());

    // Set up mouse event listeners
    window.addEventListener('mouseup', handleGlobalMouseUp as EventListener);

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
    },
    { defer: true }
  ));

  // Check for king in check when restricted squares or base points change
  createEffect(() => {
  // Check all kings to see if they are in check
    const allBasePoints = basePoints();
    const restrictedSquares = getRestrictedSquares();
    const restrictedInfo = restrictedSquaresInfo();
    
    // Reset check states
    const newKingsInCheck: {[key: string]: boolean} = {};
    
    // Check each king on the board
    allBasePoints
      .filter(bp => bp.pieceType === 'king')
      .forEach(king => {
        const kingIndex = king.y * BOARD_CONFIG.GRID_SIZE + king.x;
        const kingTeam = king.team;
        
        if (restrictedSquares.includes(kingIndex)) {
          // Check if any opponent pieces are threatening this king
          const restrictions = restrictedInfo.filter(sq => sq.index === kingIndex);
          const isInCheck = restrictions.some(restriction => 
            restriction.restrictedBy.some(r => {
              const attacker = allBasePoints.find(bp => 
                bp.x === r.basePointX && 
                bp.y === r.basePointY
              );
              return attacker && attacker.team !== kingTeam;
            })
          );
          
          if (isInCheck) {
            newKingsInCheck[`${king.x},${king.y}`] = true;
          }
        }
      });
      
    // Update the kings in check state
    setKingsInCheck(newKingsInCheck);
    console.log(`[Effect] newKingsInCheck: ${JSON.stringify(newKingsInCheck)}, kingsInCheck: ${JSON.stringify(kingsInCheck())}`)
  });

  const handleBasePointPickup = (point: Point) => {
    const [x, y] = point;
    
    const basePoint = basePoints().find(bp => bp.x === x && bp.y === y);
    if (!basePoint) return;
    
    const currentTurnColor = currentPlayerColor();
    const color = basePoint.color;
    
    if (color !== currentTurnColor) {
      return;
    }
    
    setPickedUpBasePoint(basePoint);
    setIsDragging(true);
  };

  // Helper function to update base point UI during drag
  const updateBasePointUI = (target: Point): boolean => {

    const currentBasePoint = pickedUpBasePoint();
    if (!currentBasePoint) {
      return false
    }

    const [targetX, targetY] = target;
    const index: SquareIndex = (targetY * BOARD_CONFIG.GRID_SIZE + targetX) as SquareIndex;
    
    // Validate the target position
    const validation = validateSquarePlacementLocal(index);
    if (!validation.isValid) {
      setError(`Invalid placement`);
      return false;
    }

    // Clear any previous errors if validation passed
    setError(null);

    const dragPos = createPoint(currentBasePoint.x, currentBasePoint.y);
    if (!dragPos) {
      return false
    }
    // Don't do anything if we're already at the target position
    if (dragPos[0] === targetX && dragPos[1] === targetY) {
      return false;
    }

    // Find the base point being moved
    const pointToMove = basePoints().find(bp => 
      bp.x === dragPos[0] && bp.y === dragPos[1]
    )

    if (!pointToMove) {
      setError(`Base point not found at position (${dragPos[0]}, ${dragPos[1]})`);
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
      //updateKingCheckStatus(newBasePoints);
      
      return newBasePoints;
    });

    return true;
  };

  // Validates a move from start to target coordinates
  const validateMove = (pointToMove: BasePoint, targetX: number, targetY: number) => {

    if (!pointToMove) {
      return { 
        isValid: false, 
        error: `No piece found` 
      };
    }

    // Check if it's this color's turn
    const color = pointToMove.color;
    const currentTurnColor = currentPlayerColor();

    if (color !== currentTurnColor) {
      return { 
        isValid: false, 
        error: `It's not ${color}'s turn. Current turn: ${currentTurnColor}`
      };
    }

    // Get the legal moves for this piece
    const legalMoves = getLegalMoves(pointToMove, basePoints(), {
      enPassantTarget: enPassantTargets()
    });

    // Find the specific move
    const move = legalMoves.find(m => m.x === targetX && m.y === targetY); 

    if (!move) {
      return { 
        isValid: false, 
        error: `No legal move` 
      };
    }

    return { 
      isValid: true, 
      isCastle: move.isCastle || false,
      castleType: move.castleType,
      capturedPiece: move.capturedPiece,
      isCapture: !!move.capturedPiece
    };
  };

    // Helper function to get the target position for a move
    const getMoveTarget = (): Point | null => {
      // Try to get the target from the target position state
      const target = targetPosition();
      if (target) return target;

      // Fall back to the hovered cell if no explicit target
      const hovered = hoveredCell();
      if (hovered) {
        const newTarget: Point = createPoint(hovered[0], hovered[1]);
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
    setIsProcessingMove(true);

    const currentBasePoint = pickedUpBasePoint();
    if (!currentBasePoint) {
      cleanupDragState();
      return;
    }
    const startX = currentBasePoint.x
    const startY = currentBasePoint.y

    const color = currentBasePoint.color;
    const pieceType = currentBasePoint.pieceType;

    setEnPassantTargets(prev => ({
      ...prev, [color]: null
    }));

    const target = getMoveTarget();
    if (!target) {
      cleanupDragState();
      return;
    }
    const [targetX, targetY] = target;
    
    // Handle case where there's no movement
    if (startX === targetX && startY === targetY) {
      setIsProcessingMove(false);
      cleanupDragState();
      return;
    }

    const {
      isValid,
      error,
      isCastle,
      castleType,
      capturedPiece
    } = validateMove(
      currentBasePoint,
      targetX,
      targetY
    );
    if (!isValid) {
      if (error) {console.error('Move validation failed:', error)}
      cleanupDragState();
      return;
    }

    // Handle en passant
    let isEnPassantCapture = false;
    if (pieceType === 'pawn') {
      const isVerticalPawn = color === 'RED' || color === 'YELLOW';
      const isHorizontalPawn = color === 'BLUE' || color === 'GREEN';
      
      // Check if this is a two-square pawn move
      if ((isVerticalPawn && Math.abs(targetY - startY) === 2) || 
          (isHorizontalPawn && Math.abs(targetX - startX) === 2)) {
        
        // For vertical pawns, set en passant target on the same file
        if (isVerticalPawn) {
          const enPassantY = startY + (targetY > startY ? 1 : -1);
          setEnPassantTargets(prev => ({
            ...prev,
            [color]: {
              x: targetX,
              y: enPassantY,
              color: color
            }
          }));
        } 
        // For horizontal pawns, set en passant target on the same rank
        else if (isHorizontalPawn) {
          const enPassantX = startX + (targetX > startX ? 1 : -1);
          setEnPassantTargets(prev => ({
            ...prev,
            [color]: {
              x: enPassantX,
              y: targetY,
              color: color
            }
          }));
        }
      } else {
        // Check if this is an en passant capture
        const targets = enPassantTargets();
        const currentTarget = Object.values(targets).find(target => 
          target && target.x === targetX && target.y === targetY
        );
        
        if (currentTarget) {
          isEnPassantCapture = true;
        }
      }
    }
    
    const originalState = saveCurrentStateForRollback();
    
    try {
        const isAtHistoricalPosition = currentMoveIndex() < moveHistory().length;
        let isBranching = false;
        let branchName = currentBranchName();
        const currentIndex = currentMoveIndex();
        
        if (isAtHistoricalPosition) {
          console.log(`[handleGlobalMouseUp] at historical position`)
          
          const nextMainLineMove = mainLineMoves()[currentIndex];
          const isMainLineMove = nextMainLineMove && 
            branchName === 'main' &&
            nextMainLineMove.fromX === startX &&
            nextMainLineMove.fromY === startY &&
            nextMainLineMove.toX === targetX &&
            nextMainLineMove.toY === targetY;
          
          if (isMainLineMove) {
            console.log(`[handleGlobalMouseUp] Move matches main line at index ${currentIndex}`)
            handleGoForward();
            cleanupDragState();
            return;
          }

          const currentBranches = branchPoints()[currentIndex] || [];
          const matchingBranch: BranchListItem | undefined = 
            currentBranches.find(b => {
            const parentBranch = b.parentBranch;
            const move = b.firstMove;
            return parentBranch === currentBranchName() &&
                    move.fromX === startX && 
                    move.fromY === startY &&
                    move.toX === targetX && 
                    move.toY === targetY;
          });
          
          if (matchingBranch) {
            console.log(`[handleGlobalMouseUp] matching branch`);

            const matchedBranchName = matchingBranch.branchName;
            setCurrentBranchName(matchedBranchName);
            
            // Get all moves in this branch, sorted by move number
            const branchMoves = fullMoveHistory()
              .filter(m => m.branchName === matchedBranchName)
              .sort((a, b) => a.moveNumber - b.moveNumber);

            if (branchMoves.length === 0) {
              console.error(`[handleGlobalMouseUp] ERROR: No moves found in branch '${matchedBranchName}'`);
              //cleanupDragState();
              //isBranching = false;
              throw new Error(`No moves found in branch '${matchedBranchName}'`);
            }
            
            handleGoForward();
            cleanupDragState();
            return; // Exit early since we've handled the branch following
          }

          setMoveHistory(rebuildMoveHistory(currentBranchName()))

          console.log(`[HandleGlobalMouseUp] attempting move: (${startX}, ${startY}) -> (${targetX}, ${targetY})`)

          const nextMove = currentIndex < moveHistory().length ? moveHistory()[currentIndex] : undefined;
          if (!nextMove) {
            console.log(`[handleGlobalMouseUp] No next move found at index ${currentIndex}, creating new move`);
          } else {
            console.log(`[handleGlobalMouseUp] nextMove in branch: ${nextMove.fromX}, ${nextMove.fromY} -> ${nextMove.toX}, ${nextMove.toY}`);
          }

          if (nextMove &&
            nextMove.fromX === startX && nextMove.fromY === startY &&
            nextMove.toX === targetX && nextMove.toY === targetY
          ) {
            console.log(`[handleGlobalMouseUp] follow same branch`);
            handleGoForward()
            cleanupDragState();
            return;
          }

          const branchPointMoves: SimpleMove[] = branchPoints()[currentIndex + 1]
            ?.filter(bp => bp.parentBranch === branchName)
            .map(bp => bp.firstMove);
          
          const isBranchPointMove = branchPointMoves?.some(bm => {
            return bm.fromX === startX &&
                    bm.fromY === startY &&
                    bm.toX === targetX &&
                    bm.toY === targetY;
          });

          if (isBranchPointMove) {
            console.log(`[handleGlobalMouseUp] Move matches branch point`);
            setCurrentBranchName(branchName);
            handleGoForward();
            cleanupDragState();
            return;
          }

          if (currentIndex >= moveHistory().length) {
            console.log(`[handleGlobalMouseUp] at end of line`);
            // Continue with normal move creation without branching
            isBranching = false;
          } else {
            console.log(`[handleGlobalMouseUp] branching`);
            // If we get here, it's a new branch
            isBranching = true;
          }
          
          if (isBranching) {
            const parentBranch = currentBranchName();
            const nextMoveIdx = (currentIndex + 1) + 1; // currentIndex + 1 for 1-based, then +1 for next move
            branchName = generateBranchName(nextMoveIdx, parentBranch);
            
            setBranchPoints(prev => {
              // Ensure branchName is never null or undefined
              const safeBranchName = branchName!;
              
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

        // Add move to history before updating position
        // Get the current branch name from context or previous move
        const currentBranch = branchName || currentBranchName() || 'main';
                            
        const branchMoveNumber = currentMoveIndex() + 1;
        
        console.log(`[handleGlobalMouseUp] new move, currentBranch: '${currentBranch}' branchMoveNumber: ${branchMoveNumber}`);
        
        const newMove: Move = {
          id: Date.now().toString(), // temporary id
          //basePointId: pointToMove.id.toString(),
          fromX: startX,
          fromY: startY,
          toX: targetX,
          toY: targetY,
          color: getColorHex(color) as HexColor,
          branchName: currentBranch,
          parentBranchName: currentBranch === 'main' ? null : currentBranch.split('/').slice(0, -1).join('/') || null,
          moveNumber: branchMoveNumber,  // Use the branch-aware move number
          isBranch: isBranching,
          pieceType: pieceType,
          isCastle: isCastle || false,
          castleType: (castleType === 'KING_SIDE' || castleType === 'QUEEN_SIDE') ? castleType : null,
          isEnPassant: isEnPassantCapture,
          capturedPiece: isEnPassantCapture ? capturedPiece : undefined
        };
        
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
        
        setFullMoveHistory([...fullMoveHistory(), newMove]);
        setMoveHistory(rebuildMoveHistory(currentBranchName()));

        // Updating move in database
        const userToken = auth.getToken();
        const result = await updateMove(
          pieceType,
          targetX, 
          targetY, 
          newMove.moveNumber,  // Use the move number from newMove
          newMove.branchName,
          // parent branch name
          Boolean(newMove.isBranch),  // Explicitly convert to boolean
          gameId(),         // Pass the current game ID
          startX,           // fromX (source X coordinate)
          startY,           // fromY (source Y coordinate)
          userToken || undefined  // Pass the auth token
        );
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to update base point');
        }

        newMove.id = result.data.id.toString();

        handleGoForward()

      } catch (error) {
        // Handle errors and revert to original state
        console.error('Error during move:', error);
        setBasePoints(originalState.basePoints);
        updateKingCheckStatus(originalState.basePoints);
        setRestrictedSquares(originalState.restrictedSquares);
        setRestrictedSquaresInfo(originalState.restrictedSquaresInfo);
        setError(error instanceof Error ? error.message : 'Failed to place base point');
        throw error; // Re-throw to allow error handling in the calling component
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

        const currentCell: Point = createPoint(gridX, gridY);
        
        // Always update the hovered cell during drag
        setHoveredCell(currentCell);
        
        // Get the current last hovered cell
        const lastCell = lastHoveredCell();
        
        // If we don't have a last hovered cell or it's different from current cell
        if (!lastCell || (lastCell[0] !== currentCell[0] || lastCell[1] !== currentCell[1])) {
          setTargetPosition(currentCell);
          updateBasePointUI(currentCell);
          setLastHoveredCell(currentCell);
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
        <div>
        <BoardControls 
          gameId={gameId()}
          canGoBack={currentMoveIndex() >= 0}
          canGoForward={currentMoveIndex() < moveHistory().length}
          canDeleteCurrentMove={currentMoveIndex() >= 0 && moveHistory().length > 0}
          onGoBack={handleGoBack}
          onGoForward={handleGoForward}
          onReset={resetBoardToInitialState}
          onDeleteCurrentMove={handleDeleteCurrentMove}
          onSaveGame={handleSaveGame}
          onLoadGame={handleLoadGame}
          cellSize={cellSize()}
          onCellSizeChange={setCellSize}
          onToggleAnalysis={toggleAnalysis}
          isAnalyzing={isAnalyzing()}
        />
        <div class={styles.evaluation}>
          <div>Eval: <strong>{analysis()?.score || '-'}</strong></div>
          <div>Depth: <strong>{analysis()?.depth || '-'}</strong></div>
          <div>Best: <strong>{analysis()?.bestMove || '-'}</strong></div>
        </div>
        <div class={styles.engineControls}>
          <ThreadControl 
            threads={threads()} 
            isLoading={isLoadingThreads()} 
            onThreadChange={handleThreadChange} 
          />
          <EngineControl />
        </div>
        </div>
        <div 
          class={styles.grid}
          style={{ '--grid-cell-size': `${cellSize()}px` }}
        >
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
                    r.basePointX === draggedBasePoint.x && 
                    r.basePointY === draggedBasePoint.y
                  )
                )
              : true
            );
          
          // Check if this cell has a king in check
          const isKingInCheckCell = basePoint?.pieceType === 'king' && kingsInCheck()[`${x},${y}`];
          
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
            isInCheck: isKingInCheckCell,
            isNonPlayable,
            isBestMoveFrom,
            isBestMoveTo,
            id: basePoint?.id,
            color: getColorHex(basePoint?.color),
            pieceType: basePoint?.pieceType
          };

          return (
            <GridCell
              x={x}
              y={y}
              state={cellState}
              isDragging={isDragging()}
              pickedUpBasePoint={draggedBasePoint ? createPoint(draggedBasePoint.x,draggedBasePoint.y) : null}
              onHover={(hovered) => {
                if (hovered) {
                  setHoveredCell(createPoint(x, y));
                } else if (hoveredCell()?.[0] === x && hoveredCell()?.[1] === y) {
                  setHoveredCell(null);
                }
              }}
              onBasePointPickup={handleBasePointPickup}
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
      <MoveHistory 
        moves={moveHistory()}
        mainLineMoves={mainLineMoves()}
        currentMoveIndex={currentMoveIndex()}
        branchPoints={branchPoints()}
      />
    </div>
  );
};

export default Board;
