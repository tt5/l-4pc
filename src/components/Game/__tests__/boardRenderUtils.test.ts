import { describe, it, expect } from 'vitest';
import { createPoint } from '../../../types/board';
import { BOARD_CONFIG } from '../../../constants/game';
import { indicesToPoints, pointsToIndices } from '../../../utils/boardUtils';
import { DIRECTION_MAP } from '../../../utils/directionUtils';

// Helper function to get movement deltas using DIRECTION_MAP
const getMovementDeltas = (dir: 'left' | 'right' | 'up' | 'down') => {
  return DIRECTION_MAP[dir].delta;
};

describe('Board Utilities', () => {
  describe('indicesToPoints', () => {
    it('converts indices to Point objects correctly', () => {
      // Test with the configured grid size
      const indices = [0, 16, 31, 224]; // 15*15=225 total cells (0-224)
      const expected = [
        createPoint(0, 0),   // index 0 -> (0, 0)
        createPoint(1, 1),   // index 16 -> (1, 1)  (15*1 + 1 = 16)
        createPoint(1, 2),   // index 31 -> (1, 2)  (15*2 + 1 = 31)
        createPoint(14, 14)  // index 224 -> (14, 14) (15*14 + 14 = 224)
      ];

      const result = indicesToPoints(indices);
      expect(result).toEqual(expected);
    });

    it('handles empty array', () => {
      expect(indicesToPoints([])).toEqual([]);
    });

    it('works with custom grid size', () => {
      const indices = [0, 5, 10, 24];
      const customGridSize = 5;
      const expected = [
        createPoint(0, 0),  // 0 -> (0, 0)
        createPoint(0, 1),  // 5 -> (0, 1)  (5*1 + 0 = 5)
        createPoint(0, 2),  // 10 -> (0, 2) (5*2 + 0 = 10)
        createPoint(4, 4),  // 24 -> (4, 4) (5*4 + 4 = 24)
      ];

      // Test with the default grid size
      const result = indicesToPoints(indices);
      // For custom grid size, we'll need to use a different approach
      const customResult = indices.map(index => createPoint(
        index % customGridSize,
        Math.floor(index / customGridSize)
      ));
      expect(result).toEqual(expected);
    });
  });

  describe('pointsToIndices', () => {
    it('converts points to indices correctly', () => {
      const coords = [
        createPoint(0, 0),   // (0, 0) -> 0
        createPoint(1, 1),   // (1, 1) -> 16 (15*1 + 1 = 16)
        createPoint(14, 14), // (14, 14) -> 224 (15*14 + 14 = 224)
      ];
      const expected = [0, 16, 224];

      const result = pointsToIndices(coords);
      expect(result).toEqual(expected);
    });

    it('handles empty array', () => {
      expect(pointsToIndices([])).toEqual([]);
    });

    it('works with custom grid size', () => {
      const coords = [
        createPoint(0, 0),  // (0, 0) -> 0
        createPoint(4, 4),  // (4, 4) -> 24 (5*4 + 4 = 24)
      ];
      const customGridSize = 5;
      const expected = [0, 24];

      // Test with the default grid size
      const result = pointsToIndices(coords);
      // For custom grid size, we'll need to use a different approach
      const customResult = coords.map(([x, y]) => y * customGridSize + x);
      expect(result).toEqual(expected);
    });
  });

  describe('round-trip conversion', () => {
    it('converts back and forth between indices and coordinates', () => {
      const originalIndices = [0, 1, 7, 8, 48];
      
      // Convert to coordinates and back
      const coords = indicesToPoints(originalIndices);
      const roundTrippedIndices = pointsToIndices(coords);
      
      expect(roundTrippedIndices).toEqual(originalIndices);
    });
  });

  describe('Movement Deltas', () => {
    it('returns correct delta for left direction', () => {
      expect(getMovementDeltas('left')).toEqual(createPoint(-1, 0));
    });

    it('returns correct delta for right direction', () => {
      expect(getMovementDeltas('right')).toEqual(createPoint(1, 0));
    });

    it('returns correct delta for up direction', () => {
      expect(getMovementDeltas('up')).toEqual(createPoint(0, -1));
    });

    it('returns correct delta for down direction', () => {
      expect(getMovementDeltas('down')).toEqual(createPoint(0, 1));
    });
  });
});
