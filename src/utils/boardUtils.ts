import { BOARD_CONFIG } from '../constants/game';
import { createPoint, Point, BasePoint, Direction, BasePoint as BasePointType } from '../types/board';
import { createSignal, createEffect, onCleanup, onMount, batch, Accessor } from 'solid-js';
import type { ApiResponse } from './api';


type FetchBasePointsOptions = {
  user: () => any;
  lastFetchTime: () => number;
  isFetching: () => boolean;
  setBasePoints: (value: BasePoint[] | ((prev: BasePoint[]) => BasePoint[])) => void;
  setLastFetchTime: (value: number | ((prev: number) => number)) => void;
  setIsFetching: (value: boolean | ((prev: boolean) => boolean)) => void;
}


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
 * @param moveNumber The current move number (optional)
 * @returns A promise that resolves to the API response with the updated base point
 */
/**
 * Updates a base point's position in the database
 * @param id The ID of the base point to update
 * @param x The new x-coordinate
 * @param y The new y-coordinate
 * @param moveNumber The current move number (optional)
 * @param branchName The name of the branch (optional)
 * @param isNewBranch Whether this is a new branch (optional)
 * @param gameId The ID of the game (required for branching)
 * @returns A promise that resolves to the API response with the updated base point
 */
export const updateBasePoint = async (
  id: number, 
  x: number, 
  y: number, 
  moveNumber?: number, 
  branchName?: string | null, 
  isNewBranch?: boolean,
  gameId?: string,
  fromX?: number,  // Source X coordinate
  fromY?: number   // Source Y coordinate
): Promise<ApiResponse<BasePoint>> => {
  try {
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
      body: JSON.stringify({ 
        x, 
        y, 
        ...(moveNumber !== undefined && { moveNumber }),
        ...(branchName !== undefined && { branchName }),
        ...(isNewBranch !== undefined && { isNewBranch }),
        ...(gameId !== undefined && { gameId }),
        fromX,  // Always include fromX
        fromY   // Always include fromY
      })
    });

    // Handle non-JSON responses
    const responseText = await response.text();
    let responseData;
    
    try {
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch (e) {
      console.error('Failed to parse server response');
      return {
        success: false,
        error: `Invalid server response: ${response.status} ${response.statusText}`,
        timestamp: Date.now()
      };
    }

    // Handle non-OK responses
    if (!response.ok) {
      console.error(`Update failed: ${response.status} ${response.statusText}`, responseData.error || '');
      
      return {
        success: false,
        error: responseData.error || `Failed to update base point: ${response.status} ${response.statusText}`,
        timestamp: Date.now()
      };
    }

    // Check if the response has the expected structure
    if (!responseData.success || !responseData.data) {
      console.error('Invalid response format from server');
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
      console.error('Invalid base point data in response');
      return {
        success: false,
        error: 'Invalid base point data in response',
        timestamp: Date.now()
      };
    }
    
    return {
      success: true,
      data: basePoint,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error('Error updating base point:', error instanceof Error ? error.message : 'Unknown error');
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
    const response = await fetch(`/api/base-points`, {
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
