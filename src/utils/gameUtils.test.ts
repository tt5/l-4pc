import { describe, it, expect } from 'vitest';
import { getSquaresInDirection, isPathClear, type EightDirections } from './gameUtils';
import { createPoint, type BasePoint, type LegalMove } from '~/types/board';

// Helper functions for test data
function createTestPiece(
  id: number,
  x: number,
  y: number,
  team: 1 | 2,
  color: 'RED' | 'BLUE' | 'YELLOW' | 'GREEN',
  pieceType: 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king'
): BasePoint {
  return {
    id,
    x,
    y,
    team,
    color,
    pieceType,
    hasMoved: false,
    isCastle: false,
    castleType: null
  };
}

function createEmptyBoard(): BasePoint[] {
  return [];
}

function createBoardWithPieces(pieces: BasePoint[]): BasePoint[] {
  return pieces;
}

// Direction constants for readability
const UP: EightDirections = [0, 1];
const DOWN: EightDirections = [0, -1];
const LEFT: EightDirections = [-1, 0];
const RIGHT: EightDirections = [1, 0];
const UP_RIGHT: EightDirections = [1, 1];
const UP_LEFT: EightDirections = [-1, 1];
const DOWN_RIGHT: EightDirections = [1, -1];
const DOWN_LEFT: EightDirections = [-1, -1];

describe('getSquaresInDirection', () => {
  it('returns all empty squares in direction until board edge', () => {
    // Start at center (7, 7), moving right with empty board
    const start = createPoint(7, 7);
    const board = createEmptyBoard();
    const team = 1;

    const result = getSquaresInDirection(start, RIGHT, board, team);

    // Should return squares from x=8 to x=13 (board edge at 14)
    expect(result).toHaveLength(6);
    expect(result[0]).toEqual({ x: 8, y: 7, canCapture: false });
    expect(result[5]).toEqual({ x: 13, y: 7, canCapture: false });
  });

  it('includes capture square when opponent piece is in path and stops after', () => {
    // Start at (7, 7), moving right, opponent at (10, 7)
    const start = createPoint(7, 7);
    const opponent = createTestPiece(1, 10, 7, 2, 'BLUE', 'pawn');
    const board = createBoardWithPieces([opponent]);
    const team = 1;

    const result = getSquaresInDirection(start, RIGHT, board, team);

    // Should include empty squares (8,7), (9,7) and capture at (10,7)
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ x: 8, y: 7, canCapture: false });
    expect(result[1]).toEqual({ x: 9, y: 7, canCapture: false });
    expect(result[2]).toEqual({ x: 10, y: 7, canCapture: true });
  });

  it('stops before teammate piece without capture', () => {
    // Start at (7, 7), moving right, teammate at (10, 7)
    const start = createPoint(7, 7);
    const teammate = createTestPiece(1, 10, 7, 1, 'RED', 'pawn');
    const board = createBoardWithPieces([teammate]);
    const team = 1;

    const result = getSquaresInDirection(start, RIGHT, board, team);

    // Should include empty squares (8,7), (9,7) but stop before teammate
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ x: 8, y: 7, canCapture: false });
    expect(result[1]).toEqual({ x: 9, y: 7, canCapture: false });
  });

  it('stops before non-playable corner squares', () => {
    // Start at (4, 4), moving up-left toward top-left corner (0,0)
    const start = createPoint(4, 4);
    const board = createEmptyBoard();
    const team = 1;

    const result = getSquaresInDirection(start, UP_LEFT, board, team);

    // Should stop before entering corner (squares 0-2 are corners)
    // Should return (3,5), (2,6), (1,7), (0,8) but not enter corner
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ x: 3, y: 5, canCapture: false });
    expect(result[3]).toEqual({ x: 0, y: 8, canCapture: false });
  });

  it('returns empty array when starting at board edge', () => {
    // Start at right edge (13, 7), moving right
    const start = createPoint(13, 7);
    const board = createEmptyBoard();
    const team = 1;

    const result = getSquaresInDirection(start, RIGHT, board, team);

    expect(result).toHaveLength(0);
  });
});

describe('isPathClear', () => {
  it('returns true for empty horizontal path', () => {
    const from = createPoint(3, 7);
    const to = createPoint(10, 7);
    const board = createEmptyBoard();

    const result = isPathClear(from, to, board);

    expect(result).toBe(true);
  });

  it('returns true for empty vertical path', () => {
    const from = createPoint(7, 3);
    const to = createPoint(7, 10);
    const board = createEmptyBoard();

    const result = isPathClear(from, to, board);

    expect(result).toBe(true);
  });

  it('returns true for empty diagonal path', () => {
    const from = createPoint(3, 3);
    const to = createPoint(10, 10);
    const board = createEmptyBoard();

    const result = isPathClear(from, to, board);

    expect(result).toBe(true);
  });

  it('returns false when piece blocks horizontal path', () => {
    const from = createPoint(3, 7);
    const to = createPoint(10, 7);
    const blockingPiece = createTestPiece(1, 7, 7, 2, 'BLUE', 'pawn');
    const board = createBoardWithPieces([blockingPiece]);

    const result = isPathClear(from, to, board);

    expect(result).toBe(false);
  });

  it('returns false when piece blocks vertical path', () => {
    const from = createPoint(7, 3);
    const to = createPoint(7, 10);
    const blockingPiece = createTestPiece(1, 7, 7, 2, 'BLUE', 'pawn');
    const board = createBoardWithPieces([blockingPiece]);

    const result = isPathClear(from, to, board);

    expect(result).toBe(false);
  });

  it('returns false when piece blocks diagonal path', () => {
    const from = createPoint(3, 3);
    const to = createPoint(10, 10);
    const blockingPiece = createTestPiece(1, 6, 6, 2, 'BLUE', 'pawn');
    const board = createBoardWithPieces([blockingPiece]);

    const result = isPathClear(from, to, board);

    expect(result).toBe(false);
  });

  it('returns true for adjacent squares (no squares in between)', () => {
    const from = createPoint(7, 7);
    const to = createPoint(8, 7);
    const board = createEmptyBoard();

    const result = isPathClear(from, to, board);

    expect(result).toBe(true);
  });

  it('returns true when piece is at destination (not in between)', () => {
    const from = createPoint(3, 7);
    const to = createPoint(10, 7);
    const destinationPiece = createTestPiece(1, 10, 7, 2, 'BLUE', 'pawn');
    const board = createBoardWithPieces([destinationPiece]);

    const result = isPathClear(from, to, board);

    expect(result).toBe(true);
  });

  it('returns true when piece is at start (not in between)', () => {
    const from = createPoint(3, 7);
    const to = createPoint(10, 7);
    const startPiece = createTestPiece(1, 3, 7, 2, 'BLUE', 'pawn');
    const board = createBoardWithPieces([startPiece]);

    const result = isPathClear(from, to, board);

    expect(result).toBe(true);
  });

  it('returns false for diagonal path with multiple blocking pieces', () => {
    const from = createPoint(3, 3);
    const to = createPoint(10, 10);
    const blockingPiece1 = createTestPiece(1, 5, 5, 2, 'BLUE', 'pawn');
    const blockingPiece2 = createTestPiece(2, 7, 7, 2, 'BLUE', 'pawn');
    const board = createBoardWithPieces([blockingPiece1, blockingPiece2]);

    const result = isPathClear(from, to, board);

    expect(result).toBe(false);
  });

  it('returns true for reverse diagonal path', () => {
    const from = createPoint(10, 3);
    const to = createPoint(3, 10);
    const board = createEmptyBoard();

    const result = isPathClear(from, to, board);

    expect(result).toBe(true);
  });

  it('returns false for reverse diagonal path with blocking piece', () => {
    const from = createPoint(10, 3);
    const to = createPoint(3, 10);
    const blockingPiece = createTestPiece(1, 7, 6, 2, 'BLUE', 'pawn');
    const board = createBoardWithPieces([blockingPiece]);

    const result = isPathClear(from, to, board);

    expect(result).toBe(false);
  });

  it('handles leftward horizontal movement', () => {
    const from = createPoint(10, 7);
    const to = createPoint(3, 7);
    const board = createEmptyBoard();

    const result = isPathClear(from, to, board);

    expect(result).toBe(true);
  });

  it('handles downward vertical movement', () => {
    const from = createPoint(7, 10);
    const to = createPoint(7, 3);
    const board = createEmptyBoard();

    const result = isPathClear(from, to, board);

    expect(result).toBe(true);
  });
});
