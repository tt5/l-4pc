import { 
  type Component, 
  createEffect, 
  createSignal, 
  createMemo,
  onMount,
  on
} from 'solid-js';
import { GridCell } from './GridCell';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayerPosition } from '../../contexts/PlayerPositionContext';
import { jumpToPosition } from '../../lib/utils/navigation';
import { useFetchBasePoints } from '../../hooks/useFetchBasePoints';
import { useDirectionHandler } from '../../hooks/useDirectionHandler';
import { 
  type Direction, 
  type Point, 
  type BasePoint,
  createPoint
} from '../../types/board';
import { 
  handleAddBasePoint,
  isBasePoint,
  validateSquarePlacement,
  gridToWorld,
  calculateRestrictedSquares
} from '../../utils/boardUtils';
import styles from './Board.module.css';

// Import shared board configuration
import { BOARD_CONFIG } from '~/constants/game';

const Board: Component = () => {
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
  const [pickedUpBasePoint, setPickedUpBasePoint] = createSignal<[number, number] | null>(null);
  const [isDragging, setIsDragging] = createSignal(false);
  const [hoveredCell, setHoveredCell] = createSignal<[number, number] | null>(null);
  const [hoveredSquare, setHoveredSquare] = createSignal<number | null>(null);

  // Direction handling
  const { isMoving, handleDirection } = useDirectionHandler({
    position,
    setPosition: setContextPosition,
    getRestrictedSquares,
    setRestrictedSquares,
  });
  
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
    
    try {
      // Set initial position to (0, 0) if not set
      if (!position()) {
        setContextPosition(createPoint(0, 0));
        
        // Calculate initial restricted squares
        const restricted = calculateRestrictedSquares(
          [0, 0],
          [],
          [0, 0]
        );
        setRestrictedSquares(restricted);
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

  // Validate if a square can have a base point
  const validateSquarePlacementLocal = (index: number) => {
    const pos = position();
    if (!pos) return { isValid: false, reason: 'Position not initialized' };
    
    return validateSquarePlacement({
      index,
      currentPosition: pos,
      basePoints: basePoints(),
      restrictedSquares: getRestrictedSquares()
    });
  };

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
  // Event handler types
  type KeyboardHandler = (e: KeyboardEvent) => void;
  
  // Handle keyboard events with boundary checking
  const handleKeyDown: KeyboardHandler = async (e) => {
    e.preventDefault();

    // Map keyboard keys to direction strings
    const keyToDirection: Record<string, Direction> = {
      'ArrowUp': 'up',
      'w': 'up',
      'W': 'up',
      'ArrowDown': 'down',
      's': 'down',
      'S': 'down',
      'ArrowLeft': 'left',
      'a': 'left',
      'A': 'left',
      'ArrowRight': 'right',
      'd': 'right',
      'D': 'right'
    };

    const direction = keyToDirection[e.key];
    if (direction) {
      // Only calculate direction without updating position
      const newPosition = await handleDirection(direction, { skipPositionUpdate: true });
      console.log('Direction:', direction, 'New position would be:', newPosition);
      // You can use the newPosition for preview or other logic without updating the actual position
    }
  };

  // Handle mouse up anywhere on the document to cancel dragging
  const handleGlobalMouseUp = () => {
    if (isDragging()) {
      setIsDragging(false);
      setPickedUpBasePoint(null);
      setHoveredCell(null);
    }
  };
  
  // Handle base point pickup
  const handleBasePointPickup = (point: [number, number]) => {
    setPickedUpBasePoint(point);
    setIsDragging(true);
  };

  // Handle base point placement
  const handleBasePointPlacement = (target: [number, number]) => {
    const basePoint = pickedUpBasePoint();
    if (!basePoint) return;

    const [targetX, targetY] = target;
    const index = targetY * BOARD_CONFIG.GRID_SIZE + targetX;
    
    // Validate the target position
    const validation = validateSquarePlacementLocal(index);
    if (!validation.isValid) {
      console.error('Invalid placement:', validation.reason);
      return;
    }

    // Update the base point's position
    setBasePoints(prevPoints => 
      prevPoints.map(bp => 
        bp.x === basePoint[0] && bp.y === basePoint[1]
          ? { ...bp, x: targetX, y: targetY }
          : bp
      )
    );
    
    setPickedUpBasePoint(null);
    setIsDragging(false);
    setHoveredCell(null);
  };

  // Setup and cleanup event listeners
  onMount(() => {
    const eventListeners: [string, EventListener][] = [
      ['keydown', handleKeyDown as EventListener],
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
    };
  });
  
  const handleSquareClick = async (index: number) => {
    if (isSaving()) return;
    
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
        setRestrictedSquares(calculateRestrictedSquares([worldX, worldY], getRestrictedSquares(), pos));
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
