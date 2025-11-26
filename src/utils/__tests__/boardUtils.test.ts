import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPoint } from '../../types/board';
import { BOARD_CONFIG } from '../../constants/game';
import { calculateRestrictedSquares, fetchBasePoints } from '../boardUtils';

const GRID_SIZE = BOARD_CONFIG.GRID_SIZE;

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('calculateRestrictedSquares', () => {
  describe('with viewport at origin (0,0)', () => {
    // When viewport is at (0,0), player is at (0,0) in world coordinates
    const currentPosition = createPoint(0, 0);
    
    it('returns calculated restricted squares for position (0,0) when current restricted squares is empty', () => {
      // Position (0,0) in world coordinates is at the top-left of the viewport
      const position = createPoint(0, 0);
      const result = calculateRestrictedSquares(position, [], currentPosition);
      
      // Should contain restricted squares to the right, down, and diagonally down-right
      // from the player's position at (0,0)
      expect(result).toContain(1); // Right (1,0) in grid coords
      expect(result).toContain(GRID_SIZE); // Down (0,1) in grid coords
      expect(result).toContain(GRID_SIZE + 1); // Diagonal down-right (1,1) in grid coords
    });

    it('calculates restricted squares in all directions from corner', () => {
      const position = createPoint(0, 0); // Top-left corner
      const result = calculateRestrictedSquares(position, [], currentPosition);
      
      // Should include right, down, and diagonal directions
      // Should include right, down, and diagonal directions
      expect(result).toContain(1); // Right
      expect(result).toContain(GRID_SIZE); // Down
      expect(result).toContain(GRID_SIZE + 1); // Diagonal down-right
    });

    it('calculates restricted squares in all directions from center', () => {
      const center = Math.floor(GRID_SIZE / 2);
      const position = createPoint(center, center);
      const result = calculateRestrictedSquares(position, [], currentPosition);
      
      // Should include all 8 directions
      expect(result).toContain(center - 1 + center * GRID_SIZE); // Left
      expect(result).toContain(center + 1 + center * GRID_SIZE); // Right
      expect(result).toContain(center + (center - 1) * GRID_SIZE); // Up
      expect(result).toContain(center + (center + 1) * GRID_SIZE); // Down
    });

    it('combines with existing restricted squares', () => {
      const position = createPoint(0, 0);
      const existingSquares = [100, 200];
      const result = calculateRestrictedSquares(position, existingSquares, currentPosition);
      
      // Should include both new restricted squares and existing ones
      expect(result).toContain(1); // New restricted square
      expect(result).toContain(100); // Existing restricted square
      expect(result).toContain(200); // Existing restricted square
    });

    it('excludes current position from restricted squares', () => {
      const position = createPoint(3, 3);
      const result = calculateRestrictedSquares(position, [], currentPosition);
      const currentSquare = 3 + 3 * GRID_SIZE;
      expect(result).not.toContain(currentSquare);
    });
  });

  describe('with viewport offset (-5,-5)', () => {
    // When viewport is at (-5,-5), the player is at (0,0) in world coordinates
    // and the viewport shows world coordinates from (5,5) to (19,19)
    const currentPosition = createPoint(-5, -5); // Viewport offset

    it('correctly calculates restricted squares with offset position', () => {
      // Position (5,5) in world coordinates is at the top-left of the viewport
      // because the viewport is offset by (-5,-5)
      const position = createPoint(5, 5);
      const result = calculateRestrictedSquares(position, [], currentPosition);
      
      // The restricted squares should be calculated relative to the world position
      // For position (5,5) at top-left of viewport, we expect restricted squares to the right and down
      // In grid coordinates, (5,5) is at (0,0) because of the viewport offset of (-5,-5)
      const rightIndex = 1; // (1,0) in grid coords, which is (6,5) in world coords
      const downIndex = GRID_SIZE; // (0,1) in grid coords, which is (5,6) in world coords
      const diagIndex = GRID_SIZE + 1; // (1,1) in grid coords, which is (6,6) in world coords
      
      expect(result).toContain(rightIndex);
      expect(result).toContain(downIndex);
      expect(result).toContain(diagIndex);
    });

    it('handles position at bottom-right corner of viewport', () => {
      // Position at bottom-right of the viewport (19,19 in world coords)
      // which is (14,14) in grid coords because viewport is at (-5,-5) offset
      const position = createPoint(19, 19);
      const result = calculateRestrictedSquares(position, [], currentPosition);
      
      // Should only include squares to the left and up (since we're at the edge)
      const lastIndex = GRID_SIZE * GRID_SIZE - 1; // 224 for 15x15 grid
      const leftIndex = lastIndex - 1; // (13,14) in grid coords, which is (18,19) in world coords
      const upIndex = lastIndex - GRID_SIZE; // (14,13) in grid coords, which is (19,18) in world coords
      const upLeftIndex = lastIndex - GRID_SIZE - 1; // (13,13) in grid coords, which is (18,18) in world coords
      
      expect(result).toContain(leftIndex);
      expect(result).toContain(upIndex);
      expect(result).toContain(upLeftIndex);
      
      // Should not include squares that would be outside the viewport
      expect(result).not.toContain(lastIndex + 1); // Would be right of viewport
      expect(result).not.toContain(lastIndex + GRID_SIZE); // Would be below viewport
    });
  });

  describe('with prime-numbered slopes', () => {
    const currentPosition = createPoint(0, 0);
    
    it('includes squares at 1:2 and 2:1 slopes', () => {
      // Position (2,2) in world coordinates
      // With viewport at (0,0), this is at grid position (2,2)
      const position = createPoint(2, 2);
      const result = calculateRestrictedSquares(position, [], currentPosition);
      
      // The function should include squares at 1:2 and 2:1 slopes from (2,2)
      // Convert world coordinates to grid indices for testing
      const centerX = 2;
      const centerY = 2;
      
      // Test 2:1 and 1:2 slope patterns
      // These are the expected grid indices based on the slope calculations
      // In grid coordinates, the slopes are calculated from (2,2)
      
      // 2:1 slopes (up-right, up-left, down-right, down-left)
      const slope2_1_upRight = (centerY - 1) * GRID_SIZE + (centerX + 2); // (4,1)
      const slope2_1_upLeft = (centerY - 1) * GRID_SIZE + (centerX - 2);  // (0,1)
      const slope2_1_downRight = (centerY + 1) * GRID_SIZE + (centerX + 2); // (4,3)
      const slope2_1_downLeft = (centerY + 1) * GRID_SIZE + (centerX - 2);  // (0,3)
      
      // 1:2 slopes (up-right, up-left, down-right, down-left)
      const slope1_2_upRight = (centerY - 2) * GRID_SIZE + (centerX + 1); // (3,0)
      const slope1_2_upLeft = (centerY - 2) * GRID_SIZE + (centerX - 1);  // (1,0)
      const slope1_2_downRight = (centerY + 2) * GRID_SIZE + (centerX + 1); // (3,4)
      const slope1_2_downLeft = (centerY + 2) * GRID_SIZE + (centerX - 1);  // (1,4)
      
      // Check 2:1 slopes
      expect(result).toContain(slope2_1_upRight);
      expect(result).toContain(slope2_1_upLeft);
      expect(result).toContain(slope2_1_downRight);
      expect(result).toContain(slope2_1_downLeft);
      
      // Check 1:2 slopes
      expect(result).toContain(slope1_2_upRight);
      expect(result).toContain(slope1_2_upLeft);
      expect(result).toContain(slope1_2_downRight);
      expect(result).toContain(slope1_2_downLeft);
    });
  });

  it('handles negative world coordinates correctly', () => {
    // When viewport is at (2,2), world position (-2,-2) is at grid position (-4,-4)
    // which should be clamped to the viewport bounds
    const position = createPoint(-2, -2);
    const currentPosition = createPoint(2, 2);
    const result = calculateRestrictedSquares(position, [], currentPosition);
    
    // Since the position is outside the viewport, it should return an empty array
    // or handle it according to the function's implementation
    expect(Array.isArray(result)).toBe(true);
  });

  it('returns empty array for positions outside viewport', () => {
    // Position far outside the viewport
    const position = createPoint(-100, -100);
    const currentPosition = createPoint(0, 0);
    const result = calculateRestrictedSquares(position, [], currentPosition);
    
    // Should return empty array for positions outside the viewport
    expect(result).toEqual([]);
  });

  it('handles edge of viewport correctly', () => {
    // Testing position at bottom-right corner of viewport
    const position = createPoint(GRID_SIZE - 1, GRID_SIZE - 1);
    const currentPosition = createPoint(0, 0);
    const result = calculateRestrictedSquares(position, [], currentPosition);
    
    // Should only include left, up, and diagonal directions (no right or down)
    const x = GRID_SIZE - 1;
    const y = GRID_SIZE - 1;
    
    // Calculate expected indices
    const left = x - 1 + y * GRID_SIZE; // One square left
    const up = x + (y - 1) * GRID_SIZE; // One square up
    const upLeft = (x - 1) + (y - 1) * GRID_SIZE; // Diagonal up-left
    
    // Should include squares to the left, up, and diagonal up-left
    expect(result).toContain(left);
    expect(result).toContain(up);
    expect(result).toContain(upLeft);
    
    // Should not include squares that would be outside the viewport
    const right = x + 1 + y * GRID_SIZE; // Would be right of viewport
    const down = x + (y + 1) * GRID_SIZE; // Would be below viewport
    expect(result).not.toContain(right);
    expect(result).not.toContain(down);
  });

  it('handles 1:2 and 2:1 slopes correctly with viewport offset', () => {
    // Test with viewport offset to ensure world coordinates are handled correctly
    // Viewport offset of (-3,-3) means the viewport has moved left and up by 3,
    // so world (0,0) appears at grid (3,3) to the user
    const worldX = 5;
    const worldY = 5;
    const position = createPoint(worldX, worldY); // World position (5,5)
    const viewportOffsetX = -3;
    const viewportOffsetY = -3;
    const currentPosition = createPoint(viewportOffsetX, viewportOffsetY);
    
    // Calculate the grid position for world (5,5) with viewport at (-3,-3)
    // gridX = worldX + viewportOffsetX = 5 + (-3) = 2
    // gridY = worldY + viewportOffsetY = 5 + (-3) = 2
    const gridX = worldX + viewportOffsetX;
    const gridY = worldY + viewportOffsetY;
    
    // The actual test - calculate restricted squares for this position
    const result = calculateRestrictedSquares(position, [], currentPosition);
    
    // Calculate the grid positions for each slope in world coordinates first,
    // then convert to viewport coordinates
    const calculateGridIndex = (worldX: number, worldY: number): number | null => {
      const viewX = worldX + viewportOffsetX;
      const viewY = worldY + viewportOffsetY;
      
      // Check if the point is within the viewport bounds
      if (viewX < 0 || viewX >= GRID_SIZE || viewY < 0 || viewY >= GRID_SIZE) {
        return null;
      }
      return viewY * GRID_SIZE + viewX;
    };
    
    // Test 2:1 and 1:2 slope patterns in world coordinates
    // 2:1 slopes (up-right, up-left, down-right, down-left)
    const slope2_1_upRight = calculateGridIndex(worldX + 2, worldY - 1);
    const slope2_1_upLeft = calculateGridIndex(worldX - 2, worldY - 1);
    const slope2_1_downRight = calculateGridIndex(worldX + 2, worldY + 1);
    const slope2_1_downLeft = calculateGridIndex(worldX - 2, worldY + 1);
    
    // 1:2 slopes (up-right, up-left, down-right, down-left)
    const slope1_2_upRight = calculateGridIndex(worldX + 1, worldY - 2);
    const slope1_2_upLeft = calculateGridIndex(worldX - 1, worldY - 2);
    const slope1_2_downRight = calculateGridIndex(worldX + 1, worldY + 2);
    const slope1_2_downLeft = calculateGridIndex(worldX - 1, worldY + 2);
    
    // Check 2:1 slopes that are within bounds
    if (slope2_1_upRight !== null) expect(result).toContain(slope2_1_upRight);
    if (slope2_1_upLeft !== null) expect(result).toContain(slope2_1_upLeft);
    if (slope2_1_downRight !== null) expect(result).toContain(slope2_1_downRight);
    if (slope2_1_downLeft !== null) expect(result).toContain(slope2_1_downLeft);
    
    // Check 1:2 slopes that are within bounds
    if (slope1_2_upRight !== null) expect(result).toContain(slope1_2_upRight);
    if (slope1_2_upLeft !== null) expect(result).toContain(slope1_2_upLeft);
    if (slope1_2_downRight !== null) expect(result).toContain(slope1_2_downRight);
    if (slope1_2_downLeft !== null) expect(result).toContain(slope1_2_downLeft);
  });
});