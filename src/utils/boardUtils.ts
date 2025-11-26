import { BOARD_CONFIG } from '../constants/game';
import { createPoint, Point, BasePoint, Direction, BasePoint as BasePointType } from '../types/board';
import { createSignal, createEffect, onCleanup, onMount, batch, Accessor } from 'solid-js';
import type { ApiResponse } from './api';

type AddBasePointOptions = {
  x: number;
  y: number;
  currentUser: { id: string } | null;
  setIsSaving: (value: boolean | ((prev: boolean) => boolean)) => void;
  setBasePoints: (value: BasePoint[] | ((prev: BasePoint[]) => BasePoint[])) => void;
  isBasePoint: (x: number, y: number) => boolean;
};

export const handleAddBasePoint = async ({
  x,
  y,
  currentUser,
  setIsSaving,
  setBasePoints,
  isBasePoint
}: AddBasePointOptions): Promise<ApiResponse<BasePoint>> => {
  if (!currentUser) return { success: false, error: 'User not authenticated', timestamp: Date.now() };
  
  // Check for duplicate base point using the current basePoints
  // because the function could be called from other places
  if (isBasePoint(x, y)) {
    return {
      success: false,
      error: 'Base point already exists at these coordinates',
      timestamp: Date.now()
    };
  }
  
  try {
    setIsSaving(true);
    const response = await fetch('/api/base-points', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ x, y })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.error || `Failed to save base point: ${response.status} ${response.statusText}`,
        timestamp: Date.now()
      };
    }

    const responseData = await response.json();
    
    if (!responseData.success) {
      return {
        success: false,
        error: responseData.error || 'Failed to save base point',
        timestamp: Date.now()
      };
    }
    
    const newBasePoint: BasePoint = {
      x,
      y,
      userId: responseData.data?.userId || currentUser.id,
      createdAtMs: responseData.data?.createdAtMs || Date.now(),
      id: responseData.data?.id || 0
    };
    
    setBasePoints(prev => [...prev, newBasePoint]);
    return {
      success: true,
      data: newBasePoint,
      timestamp: Date.now()
    };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save base point',
      timestamp: Date.now()
    };
  } finally {
    setIsSaving(false);
  }
};


export const calculateRestrictedSquares = (
  p: Point,
  currentRestrictedSquares: number[],
  currentPosition: Point
): number[] => {
  const [x, y] = p; // Base point position in world coordinates
  const [offsetX, offsetY] = currentPosition; // Player's current position
  // opposite direction
  const gridX = x + offsetX;
  const gridY = y + offsetY;

  const gridSize = BOARD_CONFIG.GRID_SIZE;
  const maxIndex = gridSize * gridSize - 1;
  
  
  // Helper function to check if a point is within the grid
  const isValidSquare = (square: number): boolean => {
    return square >= 0 && square <= maxIndex;
  };

  // Calculate squares in a straight line from (gridX,gridY) in a given direction
  const calculateLine = (dx: number, dy: number): number[] => {
    const squares: number[] = [];
    let cx = gridX + dx;
    let cy = gridY + dy;
    
    while (cx >= 0 && cx < gridSize && cy >= 0 && cy < gridSize) {
      const square = cx + cy * gridSize;
      if (isValidSquare(square)) {
        squares.push(square);
      }
      cx += dx;
      cy += dy;
    }
    
    return squares;
  };

  // Calculate all restricted squares
  const newRestrictedSquares = [
    // Horizontal and vertical lines
    ...calculateLine(1, 0),   // Right
    ...calculateLine(-1, 0),  // Left
    ...calculateLine(0, 1),   // Down
    ...calculateLine(0, -1),  // Up
    
    // Diagonal lines (slope 1 and -1)
    ...calculateLine(1, -1),  // Top-right diagonal
    ...calculateLine(-1, -1), // Top-left diagonal
    ...calculateLine(1, 1),   // Bottom-right diagonal
    ...calculateLine(-1, 1),  // Bottom-left diagonal
    
    // Prime-numbered slopes
    ...calculateLine(2, -1),  // Slope 2:1 (up-right)
    ...calculateLine(-2, -1), // Slope 2:1 (up-left)
    ...calculateLine(1, -2),  // Slope 1:2 (up-right)
    ...calculateLine(-1, -2), // Slope 1:2 (up-left)
    ...calculateLine(2, 1),   // Slope 2:1 (down-right)
    ...calculateLine(-2, 1),  // Slope 2:1 (down-left)
    ...calculateLine(1, 2),   // Slope 1:2 (down-right)
    ...calculateLine(-1, 2),  // Slope 1:2 (down-left)
  ].filter(square => square !== x + y * gridSize); // Exclude the current position

  // Combine with existing restricted squares and remove duplicates
  return [
    ...new Set([
      ...currentRestrictedSquares,
      ...newRestrictedSquares.filter(sq => sq >= 0 && sq <= maxIndex)
    ])
  ];
};

type FetchBasePointsOptions = {
  user: () => any;
  currentPosition: () => [number, number];
  lastFetchTime: () => number;
  isFetching: () => boolean;
  setBasePoints: (value: BasePoint[] | ((prev: BasePoint[]) => BasePoint[])) => void;
  setLastFetchTime: (value: number | ((prev: number) => number)) => void;
  setIsFetching: (value: boolean | ((prev: boolean) => boolean)) => void;
}

export type HandleDirectionOptions = {
  isMoving: Accessor<boolean>;
  currentPosition: Accessor<Point>;
  setCurrentPosition: (value: Point) => void;
  restrictedSquares: Accessor<number[]>;
  setRestrictedSquares: ((value: number[]) => void) & ((updater: (prev: number[]) => number[]) => void);
  setIsMoving: (value: boolean | ((prev: boolean) => boolean)) => void;
};

// Track the last movement time to prevent rapid successive movements
let lastMoveTime = 0;
const MOVE_COOLDOWN_MS = 50; // Minimum time between movements in milliseconds

export const handleDirection = async (
  dir: Direction,
  options: HandleDirectionOptions
): Promise<void> => {
  const {
    isMoving,
    currentPosition,
    setCurrentPosition,
    restrictedSquares,
    setRestrictedSquares,
    setIsMoving,
  } = options;

  const now = Date.now();
  
  // Prevent multiple movements at once and enforce cooldown
  const timeSinceLastMove = now - lastMoveTime;
  // Only enforce cooldown if the last move was recent (within 5 seconds)
  const isRecentMove = timeSinceLastMove < 5000; // 5 seconds
  
  if (isMoving() || (isRecentMove && timeSinceLastMove < MOVE_COOLDOWN_MS)) {
    return;
  }
  
  lastMoveTime = now;
  setIsMoving(true);
  
  try {
    const [x, y] = currentPosition();
    // opposite direction
    const newX = x;
    const newY = y;
    
    const newPosition = createPoint(newX, newY);
    
    // Process square movement before updating position
    const newIndices = [0,1];

    // Batch the position and restricted squares updates together
    batch(() => {
      
      // Update position
      setCurrentPosition(newPosition);
      
      // Set temporary restricted squares to prevent flicker
      setRestrictedSquares(prev => [...newIndices]);
    });
    
    // Get the border indices for the opposite direction using directionUtils
    const borderSquares = [0,1];

    // Fetch new border indices from calculate-squares
    const response = await fetch('/api/calculate-squares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        borderIndices: borderSquares,
        currentPosition: newPosition,
        direction: dir
      })
    });
    
    if (!response.ok) {
      throw new Error(`API call failed with status: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    if (!result.success || !result.data?.squares || !Array.isArray(result.data.squares)) {
      throw new Error(`Invalid API response format: ${JSON.stringify(result)}`);
    }
    
    // Check for duplicate indices between newIndices and result.data.squares
    const currentIndices = newIndices;
    const duplicates = currentIndices.filter(index => result.data.squares.includes(index));
    if (duplicates.length > 0) {
      throw new Error(`Duplicate restricted squares found: ${duplicates.join(', ')}`);
    }
    
    // Combine indices (no duplicates expected due to check above)
    const allIndices = [...currentIndices, ...result.data.squares];
    
    //setRestrictedSquares(combinedIndices);
    setRestrictedSquares(allIndices);
  } catch (error) {
    throw error instanceof Error 
      ? error 
      : new Error('Failed to process movement', { cause: error });
  } finally {
    // Small delay to prevent rapid successive movements
    const remainingCooldown = MOVE_COOLDOWN_MS - (Date.now() - lastMoveTime);
    setTimeout(() => {
      setIsMoving(false);
    }, Math.max(0, remainingCooldown));
  }
};

export const indicesToPoints = (indices: number[]): Point[] => 
  indices.map(index => createPoint(
    index % BOARD_CONFIG.GRID_SIZE,
    Math.floor(index / BOARD_CONFIG.GRID_SIZE)
  ));

export const pointsToIndices = (points: Point[]): number[] => 
  points.map(([x, y]) => y * BOARD_CONFIG.GRID_SIZE + x);

/**
 * Converts grid coordinates to world coordinates using the current position offset
 * @overload Converts a grid index to world coordinates
 * @param index The grid index to convert
 * @param offset The current position offset
 * @returns [worldX, worldY] in world coordinates
 * 
 * @overload Converts grid coordinates to world coordinates
 * @param gridX X coordinate in grid space
 * @param gridY Y coordinate in grid space
 * @param offsetX X offset from current position
 * @param offsetY Y offset from current position
 * @returns [worldX, worldY] in world coordinates
 */
export function gridToWorld(index: number, offset: Point): Point;
export function gridToWorld(gridX: number, gridY: number, offsetX: number, offsetY: number): Point;
export function gridToWorld(
  first: number | Point,
  second: number | Point,
  offsetX?: number,
  offsetY?: number
): Point {
  // Handle the index + offset point overload
  if (typeof second !== 'number') {
    const index = first as number;
    const [offsetX, offsetY] = second;
    const [gridX, gridY] = indicesToPoints([index])[0];
    return createPoint(gridX - offsetX, gridY - offsetY);
  }
  
  // Handle the gridX, gridY, offsetX, offsetY overload
  const gridX = first as number;
  const gridY = second as number;
  return createPoint(gridX - offsetX!, gridY - offsetY!);
}

/**
 * Checks if a base point exists at the given coordinates
 */
export const isBasePoint = (x: number, y: number, basePoints: BasePoint[]): boolean => {
  return basePoints.some(point => point.x === x && point.y === y);
};

type ValidationResult = { isValid: boolean; reason?: string };

type ValidateSquarePlacementOptions = {
  index: number;
  currentPosition: Point;
  basePoints: BasePoint[];
  restrictedSquares: number[];
};

/**
 * Validates if a square can have a base point placed on it
 */
export const validateSquarePlacement = ({
  index,
  currentPosition,
  basePoints,
  restrictedSquares
}: ValidateSquarePlacementOptions): ValidationResult => {

  const [gridX, gridY] = indicesToPoints([index])[0];
  const [offsetX, offsetY] = currentPosition;
  const [worldX, worldY] = gridToWorld(gridX, gridY, offsetX, offsetY);

  // Check if already a base point
  if (isBasePoint(worldX, worldY, basePoints)) {
    return { isValid: false, reason: 'Base point already exists here' };
  }

  // Check if it's a restricted square
  if (restrictedSquares.includes(index)) {
    return { isValid: false, reason: 'Cannot place in restricted area' };
  }

  return { isValid: true };
};

export const fetchBasePoints = async ({
  user,
  currentPosition,
  lastFetchTime,
  isFetching,
  setBasePoints,
  setLastFetchTime,
  setIsFetching,
}: FetchBasePointsOptions): Promise<void> => {
  const currentUser = user();
  if (!currentUser) {
    setBasePoints([]);
    return
  }

  const now = Date.now();
  const timeSinceLastFetch = now - lastFetchTime();
  
  if (isFetching() || (timeSinceLastFetch < 1000)) {
    return;
  }

  setIsFetching(true);

  try {
    let [x, y] = currentPosition();
    // moves opposite direction
    x = -x;
    y = -y;
    const response = await fetch(`/api/base-points?x=${x}&y=${y}`, {
      credentials: 'include',
      headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const { data } = await response.json();
    
    if (!data || !Array.isArray(data.basePoints)) {
      throw new Error('Invalid response: expected data.basePoints to be an array');
    }
    
    const newBasePoints = data.basePoints;
    setBasePoints(newBasePoints);
      
    setLastFetchTime(now);
  } catch (error) {
    console.error('Error fetching base points:', error);
  } finally {
    setIsFetching(false);
  }
};
