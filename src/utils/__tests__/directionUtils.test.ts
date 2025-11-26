import { describe, it, expect } from 'vitest';
import * as directionUtils from '../directionUtils';
import { createPoint, type Point, type Direction } from '../../types/board';

describe('moveSquares', () => {
  it('moves a single square to the right', () => {
    const currentSquares = [createPoint(2, 1)];
    const direction: Direction = 'right';
    const currentPosition = createPoint(0, 0);
    
    const result = directionUtils.moveSquares(currentSquares, direction, currentPosition);
    
    // Should move from [2,1] to [3,1] (x increases by 1 when moving right)
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(createPoint(3, 1));
    // result is now explicitly typed as Point[]
  });

  it('moves a single square to the left', () => {
    const currentSquares = [createPoint(2, 1)];
    const direction: Direction = 'left';
    const currentPosition = createPoint(0, 0);
    
    const result = directionUtils.moveSquares(currentSquares, direction, currentPosition);
    
    // Should move from [2,1] to [1,1] (x decreases by 1 when moving left)
    expect(result[0]).toEqual(createPoint(1, 1));
  });

  it('moves a single square up', () => {
    const currentSquares = [createPoint(2, 2)];
    const direction: Direction = 'up';
    const currentPosition = createPoint(0, 0);
    
    const result = directionUtils.moveSquares(currentSquares, direction, currentPosition);
    
    // Should move from [2,2] to [2,1] (y decreases by 1 when moving up)
    expect(result[0]).toEqual(createPoint(2, 1));
  });

  it('moves a single square down', () => {
    const currentSquares = [createPoint(2, 2)];
    const direction: Direction = 'down';
    const currentPosition = createPoint(0, 0);
    
    const result = directionUtils.moveSquares(currentSquares, direction, currentPosition);
    
    // Should move from [2,2] to [2,3] (y increases by 1 when moving down)
    expect(result[0]).toEqual(createPoint(2, 3));
  });

  it('filters out squares that would move off the grid', () => {
    const testCases = [
      { direction: 'left' as const, position: createPoint(0, 7), expected: [] },
      { direction: 'right' as const, position: createPoint(14, 7), expected: [] },
      { direction: 'up' as const, position: createPoint(7, 0), expected: [] },
      { direction: 'down' as const, position: createPoint(7, 14), expected: [] },
    ];

    testCases.forEach((testCase) => {
      const result = directionUtils.moveSquares([testCase.position], testCase.direction, createPoint(0, 0));
      expect(result).toEqual(testCase.expected);
    });
  });

  it('handles multiple squares moving in the same direction', () => {
    const squares = [
      createPoint(1, 1),
      createPoint(2, 2),
      createPoint(5, 5)
    ];
    
    const result = directionUtils.moveSquares(squares, 'right', createPoint(0, 0));
    expect(result).toHaveLength(3);
    expect(result).toContainEqual(createPoint(2, 1));
    expect(result).toContainEqual(createPoint(3, 2));
    expect(result).toContainEqual(createPoint(6, 5));
  });
});
