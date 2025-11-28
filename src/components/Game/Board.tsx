import { 
  type Component, 
  createEffect, 
  createSignal, 
  createMemo,
  onMount,
  on,
  batch
} from 'solid-js';
import { basePointEventService } from '~/lib/server/events/base-point-events';
import { GridCell } from './GridCell';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayerPosition } from '../../contexts/PlayerPositionContext';
import { useFetchBasePoints } from '../../hooks/useFetchBasePoints';
import { useSSE } from '../../hooks/useSSE';
import { 
  type Point, 
  type BasePoint,
  createPoint
} from '../../types/board';
import { 
  handleAddBasePoint,
  isBasePoint,
  gridToWorld,
  calculateRestrictedSquares,
  updateBasePoint,
  indicesToPoints
} from '../../utils/boardUtils';
import styles from './Board.module.css';

// Import shared board configuration
import { BOARD_CONFIG } from '~/constants/game';

const Board: Component = () => {
  // Clean up drag state
  const cleanupDragState = () => {
    setIsDragging(false);
    setPickedUpBasePoint(null);
    setHoveredCell(null);
    setLastHoveredCell(null);
    setDragStartPosition(null);
    setTargetPosition(null);
    setError(null);
  };

  // Helper function to validate square placement
  const validateSquarePlacementLocal = (index: number) => {
    const pos = position();
    if (!pos) return { isValid: false, reason: 'Position not initialized' };
    
    // Get the current base points
    const currentBasePoints = basePoints();
    const pickedUp = pickedUpBasePoint();
    
    // Get the target position in world coordinates
    const [gridX, gridY] = indicesToPoints([index])[0];
    const [offsetX, offsetY] = pos;
    const [worldX, worldY] = gridToWorld(gridX, gridY, offsetX, offsetY);
    
    // If we're not moving a base point, use default validation for new placements
    if (!pickedUp) {
      // Check if the target position is already occupied
      if (currentBasePoints.some(bp => bp.x === worldX && bp.y === worldY)) {
        return { isValid: false, reason: 'Base point already exists here' };
      }
      
      // For new base points, they can only be placed on restricted squares
      if (!getRestrictedSquares().includes(index)) {
        return { 
          isValid: false, 
          reason: 'Base points can only be placed on restricted squares' 
        };
      }
      
      return { isValid: true };
    }
    
    // If we're moving a base point
    // Check if the target position is already occupied (excluding the picked up point)
    if (currentBasePoints.some(bp => 
      bp.x === worldX && 
      bp.y === worldY && 
      !(bp.x === pickedUp[0] && bp.y === pickedUp[1])
    )) {
      return { isValid: false, reason: 'Base point already exists here' };
    }
    
    // Check if the target square is restricted by the picked up base point
    const restrictionInfo = restrictedSquaresInfo().find(sq => sq.index === index);
    const isRestrictedByPickedUp = restrictionInfo?.restrictedBy.some(
      restriction => 
        restriction.basePointX === pickedUp[0] && 
        restriction.basePointY === pickedUp[1]
    );

    if (!isRestrictedByPickedUp) {
      return { 
        isValid: false, 
        reason: 'Base points can only be moved to squares they restrict' 
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
  
  // Get position and restricted squares from context
  const { 
    position,
    setPosition: setContextPosition,
    restrictedSquares: getRestrictedSquares,
    setRestrictedSquares
  } = usePlayerPosition();
  
  // Create a memoized version of the current position to avoid recreating it
  const currentPos = createMemo<Point>(() => position() || createPoint(0, 0));
  
  // State variables
  const [isSaving, setIsSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [dragStartPosition, setDragStartPosition] = createSignal<[number, number] | null>(null);
  const [pickedUpBasePoint, setPickedUpBasePoint] = createSignal<[number, number] | null>(null);
  const [isDragging, setIsDragging] = createSignal(false);
  const [hoveredCell, setHoveredCell] = createSignal<[number, number] | null>(null);
  const [hoveredSquare, setHoveredSquare] = createSignal<number | null>(null);
  
  // Track restricted squares with their origin information
  const [restrictedSquaresInfo, setRestrictedSquaresInfo] = createSignal<Array<{
    index: number;
    x: number;
    y: number;
    restrictedBy: Array<{
      basePointId: string;
      basePointX: number;
      basePointY: number;
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
    currentPosition: () => position() || [0, 0]
  });
  
  // Initialize board on mount
  onMount(async () => {
    // Set up CSS variable for grid size
    document.documentElement.style.setProperty('--grid-size', BOARD_CONFIG.GRID_SIZE.toString());

    // Set up mouse event listeners
    window.addEventListener('mouseup', handleGlobalMouseUp as EventListener);
    
    try {
      // Set initial position to (0, 0) if not set
      if (!position()) {
        const initialPosition = createPoint(0, 0);
        setContextPosition(initialPosition);
        
        // Call calculate-squares API to get initial restricted squares
        try {
          const response = await fetch('/api/calculate-squares', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              borderIndices: [],
              currentPosition: initialPosition,
              destination: initialPosition
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
          // Fallback to local calculation if API call fails
          const restricted = calculateRestrictedSquares(
            [0, 0],
            [],
            [0, 0]
          );
          setRestrictedSquares(restricted);
          setRestrictedSquaresInfo([]);
        }
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

  // Effect to handle user changes and fetch base points
  createEffect(() => {
    const currentUser = user();
    if (currentUser) {
      handleFetchBasePoints();
    }
  });
  // Set up SSE for real-time updates
  useSSE('/api/sse', (message) => {
    console.log('[SSE] Received message:', message);
    
    // The point data might be in message.point or message.basePoint or the message itself
    const point = message.point || message.basePoint || message;
    
    if (point && point.id) {
      console.log('[SSE] Processing base point update for ID:', point.id, 'with data:', point);
      
      setBasePoints(prev => {
        const index = prev.findIndex(bp => bp.id === point.id);
        
        if (index !== -1) {
          // Create a new array with the updated base point
          const newBasePoints = [...prev];
          newBasePoints[index] = {
            ...newBasePoints[index],
            ...point
          };
          console.log('[SSE] Updated base points array:', newBasePoints);
          return newBasePoints;
        }
        
        // If the base point wasn't found, log a warning and return the previous state
        console.warn('[SSE] Received update for unknown base point:', point);
        return prev;
      });
    } else {
      console.warn('[SSE] Received invalid point data in message:', message);
    }
  });

  // Track the target position during drag
  const [targetPosition, setTargetPosition] = createSignal<[number, number] | null>(null);

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
  const handleGlobalMouseUp = async () => {
    if (!isDragging() || !pickedUpBasePoint()) {
      return;
    }

    const target = targetPosition();
    if (!target) {
      cleanupDragState();
      return;
    }

    const [targetX, targetY] = target;
    const index = targetY * BOARD_CONFIG.GRID_SIZE + targetX;
    
    // Final validation
    const validation = validateSquarePlacementLocal(index);
    if (!validation.isValid) {
      setError(`Invalid placement: ${validation.reason || 'Unknown reason'}`);
      cleanupDragState();
      return;
    }

    const startPos = dragStartPosition();
    if (!startPos) {
      cleanupDragState();
      return;
    }

    const [startX, startY] = startPos;
    
    // Only proceed if we actually moved to a new cell
    if (startX !== targetX || startY !== targetY) {
      // Save the current state for potential rollback
      const originalBasePoints = [...basePoints()];
      const originalRestrictedSquares = [...getRestrictedSquares()];
      const originalRestrictedSquaresInfo = [...restrictedSquaresInfo()];
      
      try {
        // 1. Optimistically update the base points in the UI
        const updatedBasePoints = basePoints().map(bp => 
          bp.x === startX && bp.y === startY
            ? { ...bp, x: targetX, y: targetY }
            : bp
        );
        setBasePoints(updatedBasePoints);

        // 2. Optimistically update the base point in the database
        const pointToMove = originalBasePoints.find(bp => 
          bp.x === startX && bp.y === startY
        );

        if (!pointToMove) {
          throw new Error(`Base point not found at position (${startX}, ${startY})`);
        }

        // 3. Update restricted squares optimistically
        const newRestrictedSquares = calculateRestrictedSquares(
          [targetX, targetY],
          originalRestrictedSquares,
          [startX, startY]
        );
        setRestrictedSquares(newRestrictedSquares);

        // 4. Update the base point in the database
        const result = await updateBasePoint(pointToMove.id, targetX, targetY);
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to update base point');
        }

        // 5. Update restricted squares with server response
        const response = await fetch('/api/calculate-squares', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            borderIndices: originalRestrictedSquares,
            currentPosition: [startX, startY],
            destination: [targetX, targetY],
          })
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.statusText}`);
        }

        const result2 = await response.json();
        if (result2.success) {
          // Update with server-calculated values
          setRestrictedSquares(result2.data.squares || []);
          setRestrictedSquaresInfo(result2.data.squaresWithOrigins || []);
        }
      } catch (error) {
        // Revert to original state on error
        console.error('Error during base point placement:', error);
        setBasePoints(originalBasePoints);
        setRestrictedSquares(originalRestrictedSquares);
        setRestrictedSquaresInfo(originalRestrictedSquaresInfo);
        setError(error instanceof Error ? error.message : 'Failed to place base point');
      } finally {
        cleanupDragState();
      }
    } else {
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
    const eventListeners: [string, EventListener][] = [
      ['mouseup', handleGlobalMouseUp as EventListener],
    ];
    
    // Add event listeners
    eventListeners.forEach(([event, handler]) => {
      window.addEventListener(event, handler);
    });
    
    // Cleanup function to remove event listeners
    return () => {
      eventListeners.forEach(([event, handler]) => {
        window.removeEventListener(event, handler);
      });
      
      // Clean up drag state
      setIsDragging(false);
      setPickedUpBasePoint(null);
      setHoveredCell(null);
      setLastHoveredCell(null);
    };
  });
  
  const handleSquareClick = async (index: number) => {
    if (isSaving() || isDragging()) return;
    
    const pos = position();
    if (!pos) return;
    
    const [worldX, worldY] = gridToWorld(index, [0, 0]);
    
    // If we're dragging a base point, handle the drop
    if (isDragging() && pickedUpBasePoint()) {
      handleBasePointPlacement([worldX, worldY]);
      return;
    }
    
    // Otherwise, handle adding a new base point
    setIsSaving(true);
    
    try {
      const result = await handleAddBasePoint({
        x: worldX,
        y: worldY,
        currentUser,
        setIsSaving,
        setBasePoints: (value: BasePoint[] | ((prev: BasePoint[]) => BasePoint[])) => {
          handleFetchBasePoints();
          return value;
        },
        isBasePoint: (x: number, y: number) => isBasePoint(x, y, basePoints())
      });
      
      if (result.success) {
        // We'll update the restricted squares through the context
        const restricted = calculateRestrictedSquares([worldX, worldY], getRestrictedSquares(), pos);
        setRestrictedSquares(restricted);
        // Note: The detailed restrictedSquaresInfo will be updated on the next render
      } else if (result.error) {
        setError(result.error);
      }
    } catch (error) {
      console.error('Error adding base point:', error);
      setError('Failed to add base point');
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <div class={styles.board}>
      <div 
        class={styles.grid}
        style={{
          'grid-template-columns': `repeat(${BOARD_CONFIG.GRID_SIZE}, 1fr)`,
          'grid-template-rows': `repeat(${BOARD_CONFIG.GRID_SIZE}, 1fr)`
        }}
      >
        {Array.from({ length: BOARD_CONFIG.GRID_SIZE * BOARD_CONFIG.GRID_SIZE }).map((_, index) => {
          const [x, y] = [index % BOARD_CONFIG.GRID_SIZE, Math.floor(index / BOARD_CONFIG.GRID_SIZE)];
          const isBP = isBasePoint(x, y, basePoints());
          const isSelected = getRestrictedSquares().includes(index);
          // Update the cell state to include the new hover state
          const cellState = {
            isBasePoint: isBP,
            isSelected,
            isHovered: !!(hoveredSquare() === index || (hoveredCell() && hoveredCell()![0] === x && hoveredCell()![1] === y)),
            isSaving: isSaving()
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
        <div class={styles.errorMessage}>
          {error()}
        </div>
      )}
    </div>
  );
};

export default Board;
