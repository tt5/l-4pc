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

export interface HandleDirectionOptions {
  isMoving: Accessor<boolean>;
  currentPosition: Accessor<Point>;
  setCurrentPosition: (value: Point) => void;
  restrictedSquares: Accessor<number[]>;
  setRestrictedSquares: ((value: number[]) => void) & ((updater: (prev: number[]) => number[]) => void);
  setIsMoving: (value: boolean | ((prev: boolean) => boolean)) => void;
  skipPositionUpdate?: boolean;
};

// Track the last movement time to prevent rapid successive movements
let lastMoveTime = 0;
const MOVE_COOLDOWN_MS = 50; // Minimum time between movements in milliseconds

export const handleDirection = async (
  dir: Direction,
  options: HandleDirectionOptions
): Promise<Point> => {
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
    return Promise.resolve(currentPosition());
  }
  
  lastMoveTime = now;
  setIsMoving(true);
  
  try {
    const [x, y] = currentPosition();
    let newX = x;
    let newY = y;
    
    // Update position based on direction
    switch (dir) {
      case 'up':
        newY -= 1;
        break;
      case 'down':
        newY += 1;
        break;
      case 'left':
        newX -= 1;
        break;
      case 'right':
        newX += 1;
        break;
    }
    
    const newPosition = createPoint(newX, newY);
    
    // Only update position if skipPositionUpdate is not true
    if (!options.skipPositionUpdate) {
      // Process square movement before updating position
      const newIndices: number[] = [0, 1];

      // Batch the position and restricted squares updates together
      batch(() => {
        // Update position
        setCurrentPosition(newPosition);
        
        // Set temporary restricted squares to prevent flicker
        setRestrictedSquares(prev => [...newIndices]);
      });
    }
    
    // Return the calculated position without updating the state
    return newPosition;
    
    // Get the border indices for the opposite direction using directionUtils
    const borderSquares = [0,1];

    // Fetch new border indices from calculate-squares
    // Calculate destination based on direction
    let destination: Point = [...newPosition];
    switch (dir) {
      case 'up':
        destination[1] -= 1;
        break;
      case 'down':
        destination[1] += 1;
        break;
      case 'left':
        destination[0] -= 1;
        break;
      case 'right':
        destination[0] += 1;
        break;
    }

    const response = await fetch('/api/calculate-squares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        borderIndices: borderSquares,
        currentPosition: newPosition,
        destination: destination
      })
    });
    
    if (!response.ok) {
      throw new Error(`API call failed with status: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    if (!result.success || !result.data?.squares || !Array.isArray(result.data.squares)) {
      throw new Error(`Invalid API response format: ${JSON.stringify(result)}`);
    }
    
    // Get the current restricted squares and check for duplicates
    const currentIndices: number[] = []; // Initialize with empty array as fallback
    const duplicates = currentIndices.filter((index: number) => 
      result.data.squares.includes(index)
    );
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
 * Converts between grid coordinates and world coordinates (which are the same in this implementation)
 * @overload Converts a grid index to world coordinates
 * @param index The grid index to convert
 * @returns [worldX, worldY] in world coordinates (same as grid coordinates)
 * 
 * @overload Converts grid coordinates to world coordinates
 * @param x X coordinate in grid space
 * @param y Y coordinate in grid space
 * @returns [worldX, worldY] in world coordinates (same as grid coordinates)
 */
export function gridToWorld(index: number, _offset?: Point): Point;
export function gridToWorld(x: number, y: number, _offsetX?: number, _offsetY?: number): Point;
export function gridToWorld(
  first: number | Point,
  second?: number | Point,
  _offsetX?: number,
  _offsetY?: number
): Point {
  // Handle the index overload
  if (typeof second === 'undefined' || Array.isArray(second)) {
    const index = first as number;
    const gridSize = BOARD_CONFIG.GRID_SIZE;
    return createPoint(index % gridSize, Math.floor(index / gridSize));
  }
  
  // Handle the x, y coordinates overload
  return createPoint(first as number, second as number);
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
/**
 * Updates a base point's position in the database
 * @param id The ID of the base point to update
 * @param x The new x-coordinate
 * @param y The new y-coordinate
 * @returns A promise that resolves to the API response with the updated base point
 */
export const updateBasePoint = async (id: number, x: number, y: number): Promise<ApiResponse<BasePoint>> => {
  try {
    console.log(`[updateBasePoint] Updating base point ${id} to (${x}, ${y})`);
    
    // Validate input
    if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) {
      throw new Error('Invalid coordinates provided');
    }

    const response = await fetch(`/api/base-points/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ x, y })
    });

    // Handle non-JSON responses
    const responseText = await response.text();
    let responseData;
    
    try {
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch (e) {
      console.error('[updateBasePoint] Failed to parse response:', responseText);
      return {
        success: false,
        error: `Invalid server response: ${response.status} ${response.statusText}`,
        timestamp: Date.now()
      };
    }

    // Handle non-OK responses
    if (!response.ok) {
      console.error(`[updateBasePoint] Update failed:`, {
        status: response.status,
        statusText: response.statusText,
        error: responseData.error
      });
      
      return {
        success: false,
        error: responseData.error || `Failed to update base point: ${response.status} ${response.statusText}`,
        timestamp: Date.now()
      };
    }

    // Log the full response for debugging
    console.log('[updateBasePoint] Full response:', JSON.stringify(responseData, null, 2));
    
    // Check if the response has the expected structure
    if (!responseData.success || !responseData.data) {
      console.error('[updateBasePoint] Invalid response format:', responseData);
      return {
        success: false,
        error: 'Invalid response format from server',
        timestamp: Date.now()
      };
    }

    // Handle nested response structure: response.data.data or response.data
    const responseDataObj = responseData.data;
    let basePoint = responseDataObj;
    
    // If the data is nested inside another data property
    if (responseDataObj.data) {
      basePoint = responseDataObj.data;
    }
    
    // If we still don't have a valid base point, try to get it from a basePoint property
    if ((!basePoint.x || !basePoint.y) && responseDataObj.basePoint) {
      basePoint = responseDataObj.basePoint;
    }
    
    if (!basePoint || typeof basePoint.x !== 'number' || typeof basePoint.y !== 'number') {
      console.error('[updateBasePoint] Invalid base point data:', basePoint);
      console.error('[updateBasePoint] Response data structure:', responseDataObj);
      return {
        success: false,
        error: 'Invalid base point data in response',
        timestamp: Date.now()
      };
    }
    
    console.log(`[updateBasePoint] Successfully updated base point ${id} to (${basePoint.x}, ${basePoint.y})`);
    
    return {
      success: true,
      data: basePoint,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error('[updateBasePoint] Error updating base point:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update base point',
      timestamp: Date.now()
    };
  }
};

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
