import { describe, it, expect, beforeEach } from 'vitest';
import { getSquaresInDirection, isPathClear, canPieceAttack, isSquareUnderAttack, isKingInCheck, isSquareBetween, canCastle, resetMovedPieces, trackPieceMovement, wouldResolveCheck, getLegalMoves, type CastleType, type EightDirections } from './gameUtils';
import { createPoint, type BasePoint, type LegalMove } from '~/types/board';
import { parseFen4, fen4FromMoves } from './fen4Utils';

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

describe('canPieceAttack', () => {
  describe('queen', () => {
    it('attacks horizontally on empty board', () => {
      const queen = createTestPiece(1, 7, 7, 1, 'RED', 'queen');
      const target = createPoint(12, 7);
      const board = createEmptyBoard();

      const result = canPieceAttack(queen, target, board);

      expect(result).toBe(true);
    });

    it('attacks vertically on empty board', () => {
      const queen = createTestPiece(1, 7, 7, 1, 'RED', 'queen');
      const target = createPoint(7, 12);
      const board = createEmptyBoard();

      const result = canPieceAttack(queen, target, board);

      expect(result).toBe(true);
    });

    it('attacks diagonally on empty board', () => {
      const queen = createTestPiece(1, 7, 7, 1, 'RED', 'queen');
      const target = createPoint(12, 12);
      const board = createEmptyBoard();

      const result = canPieceAttack(queen, target, board);

      expect(result).toBe(true);
    });

    it('cannot attack when path is blocked', () => {
      const queen = createTestPiece(1, 7, 7, 1, 'RED', 'queen');
      const target = createPoint(12, 7);
      const blockingPiece = createTestPiece(2, 9, 7, 2, 'BLUE', 'pawn');
      const board = createBoardWithPieces([blockingPiece]);

      const result = canPieceAttack(queen, target, board);

      expect(result).toBe(false);
    });

    it('cannot attack non-linear positions', () => {
      const queen = createTestPiece(1, 7, 7, 1, 'RED', 'queen');
      const target = createPoint(10, 8);
      const board = createEmptyBoard();

      const result = canPieceAttack(queen, target, board);

      expect(result).toBe(false);
    });
  });

  describe('rook', () => {
    it('attacks horizontally on empty board', () => {
      const rook = createTestPiece(1, 7, 7, 1, 'RED', 'rook');
      const target = createPoint(12, 7);
      const board = createEmptyBoard();

      const result = canPieceAttack(rook, target, board);

      expect(result).toBe(true);
    });

    it('attacks vertically on empty board', () => {
      const rook = createTestPiece(1, 7, 7, 1, 'RED', 'rook');
      const target = createPoint(7, 12);
      const board = createEmptyBoard();

      const result = canPieceAttack(rook, target, board);

      expect(result).toBe(true);
    });

    it('cannot attack when path is blocked', () => {
      const rook = createTestPiece(1, 7, 7, 1, 'RED', 'rook');
      const target = createPoint(12, 7);
      const blockingPiece = createTestPiece(2, 9, 7, 2, 'BLUE', 'pawn');
      const board = createBoardWithPieces([blockingPiece]);

      const result = canPieceAttack(rook, target, board);

      expect(result).toBe(false);
    });

    it('cannot attack diagonally', () => {
      const rook = createTestPiece(1, 7, 7, 1, 'RED', 'rook');
      const target = createPoint(10, 10);
      const board = createEmptyBoard();

      const result = canPieceAttack(rook, target, board);

      expect(result).toBe(false);
    });
  });

  describe('bishop', () => {
    it('attacks diagonally on empty board', () => {
      const bishop = createTestPiece(1, 7, 7, 1, 'RED', 'bishop');
      const target = createPoint(12, 12);
      const board = createEmptyBoard();

      const result = canPieceAttack(bishop, target, board);

      expect(result).toBe(true);
    });

    it('attacks reverse diagonal on empty board', () => {
      const bishop = createTestPiece(1, 10, 3, 1, 'RED', 'bishop');
      const target = createPoint(3, 10);
      const board = createEmptyBoard();

      const result = canPieceAttack(bishop, target, board);

      expect(result).toBe(true);
    });

    it('cannot attack when path is blocked', () => {
      const bishop = createTestPiece(1, 7, 7, 1, 'RED', 'bishop');
      const target = createPoint(12, 12);
      const blockingPiece = createTestPiece(2, 9, 9, 2, 'BLUE', 'pawn');
      const board = createBoardWithPieces([blockingPiece]);

      const result = canPieceAttack(bishop, target, board);

      expect(result).toBe(false);
    });

    it('cannot attack horizontally', () => {
      const bishop = createTestPiece(1, 7, 7, 1, 'RED', 'bishop');
      const target = createPoint(12, 7);
      const board = createEmptyBoard();

      const result = canPieceAttack(bishop, target, board);

      expect(result).toBe(false);
    });
  });

  describe('knight', () => {
    it('attacks in L-shape (2 right, 1 up)', () => {
      const knight = createTestPiece(1, 7, 7, 1, 'RED', 'knight');
      const target = createPoint(9, 8);
      const board = createEmptyBoard();

      const result = canPieceAttack(knight, target, board);

      expect(result).toBe(true);
    });

    it('attacks in L-shape (1 right, 2 up)', () => {
      const knight = createTestPiece(1, 7, 7, 1, 'RED', 'knight');
      const target = createPoint(8, 9);
      const board = createEmptyBoard();

      const result = canPieceAttack(knight, target, board);

      expect(result).toBe(true);
    });

    it('attacks in all L-shape directions', () => {
      const knight = createTestPiece(1, 7, 7, 1, 'RED', 'knight');
      const board = createEmptyBoard();

      // All 8 possible knight moves
      const targets = [
        createPoint(9, 8),  // right 2, up 1
        createPoint(8, 9),  // right 1, up 2
        createPoint(8, 5),  // right 1, down 2
        createPoint(9, 6),  // right 2, down 1
        createPoint(5, 6),  // left 2, down 1
        createPoint(6, 5),  // left 1, down 2
        createPoint(6, 9),  // left 1, up 2
        createPoint(5, 8),  // left 2, up 1
      ];

      for (const target of targets) {
        expect(canPieceAttack(knight, target, board)).toBe(true);
      }
    });

    it('cannot attack non-L-shape positions', () => {
      const knight = createTestPiece(1, 7, 7, 1, 'RED', 'knight');
      const target = createPoint(9, 9);
      const board = createEmptyBoard();

      const result = canPieceAttack(knight, target, board);

      expect(result).toBe(false);
    });

    it('can attack even with pieces in between (jumps over)', () => {
      const knight = createTestPiece(1, 7, 7, 1, 'RED', 'knight');
      const target = createPoint(9, 8);
      const blockingPiece = createTestPiece(2, 8, 7, 2, 'BLUE', 'pawn');
      const board = createBoardWithPieces([blockingPiece]);

      const result = canPieceAttack(knight, target, board);

      expect(result).toBe(true);
    });
  });

  describe('pawn', () => {
    it('attacks diagonally forward for team 1 (red)', () => {
      const pawn = createTestPiece(1, 7, 7, 1, 'RED', 'pawn');
      const target = createPoint(8, 6);
      const targetPiece = createTestPiece(2, 8, 6, 2, 'BLUE', 'pawn');
      const board = createBoardWithPieces([targetPiece]);

      const result = canPieceAttack(pawn, target, board);

      expect(result).toBe(true);
    });

    it('attacks diagonally forward for team 2 (blue)', () => {
      const pawn = createTestPiece(1, 7, 7, 2, 'BLUE', 'pawn');
      const target = createPoint(8, 8);
      const targetPiece = createTestPiece(2, 8, 8, 1, 'RED', 'pawn');
      const board = createBoardWithPieces([targetPiece]);

      const result = canPieceAttack(pawn, target, board);

      expect(result).toBe(true);
    });

    it('cannot attack forward (only diagonal)', () => {
      const pawn = createTestPiece(1, 7, 7, 1, 'RED', 'pawn');
      const target = createPoint(7, 6);
      const targetPiece = createTestPiece(2, 7, 6, 2, 'BLUE', 'pawn');
      const board = createBoardWithPieces([targetPiece]);

      const result = canPieceAttack(pawn, target, board);

      expect(result).toBe(false);
    });

    it('cannot attack diagonal backward for team 1', () => {
      const pawn = createTestPiece(1, 7, 7, 1, 'RED', 'pawn');
      const target = createPoint(8, 8);
      const targetPiece = createTestPiece(2, 8, 8, 2, 'BLUE', 'pawn');
      const board = createBoardWithPieces([targetPiece]);

      const result = canPieceAttack(pawn, target, board);

      expect(result).toBe(false);
    });

    it('cannot attack diagonal backward for team 2', () => {
      const pawn = createTestPiece(1, 7, 7, 2, 'BLUE', 'pawn');
      const target = createPoint(8, 6);
      const targetPiece = createTestPiece(2, 8, 6, 1, 'RED', 'pawn');
      const board = createBoardWithPieces([targetPiece]);

      const result = canPieceAttack(pawn, target, board);

      expect(result).toBe(false);
    });

    it('cannot attack empty square', () => {
      const pawn = createTestPiece(1, 7, 7, 1, 'RED', 'pawn');
      const target = createPoint(8, 6);
      const board = createEmptyBoard();

      const result = canPieceAttack(pawn, target, board);

      expect(result).toBe(false);
    });

    it('cannot attack teammate', () => {
      const pawn = createTestPiece(1, 7, 7, 1, 'RED', 'pawn');
      const target = createPoint(8, 6);
      const targetPiece = createTestPiece(2, 8, 6, 1, 'RED', 'pawn');
      const board = createBoardWithPieces([targetPiece]);

      const result = canPieceAttack(pawn, target, board);

      expect(result).toBe(false);
    });

    it('cannot attack more than 1 square diagonally', () => {
      const pawn = createTestPiece(1, 7, 7, 1, 'RED', 'pawn');
      const target = createPoint(9, 5);
      const targetPiece = createTestPiece(2, 9, 5, 2, 'BLUE', 'pawn');
      const board = createBoardWithPieces([targetPiece]);

      const result = canPieceAttack(pawn, target, board);

      expect(result).toBe(false);
    });
  });
});

describe('isSquareUnderAttack', () => {
  it('returns true when square is attacked by rook', () => {
    const target = createPoint(10, 7);
    const rook = createTestPiece(1, 7, 7, 1, 'RED', 'rook');
    const board = createBoardWithPieces([rook]);

    const result = isSquareUnderAttack(target, 1, board);

    expect(result).toBe(true);
  });

  it('returns true when square is attacked by bishop', () => {
    const target = createPoint(10, 10);
    const bishop = createTestPiece(1, 7, 7, 1, 'RED', 'bishop');
    const board = createBoardWithPieces([bishop]);

    const result = isSquareUnderAttack(target, 1, board);

    expect(result).toBe(true);
  });

  it('returns true when square is attacked by queen', () => {
    const target = createPoint(10, 7);
    const queen = createTestPiece(1, 7, 7, 1, 'RED', 'queen');
    const board = createBoardWithPieces([queen]);

    const result = isSquareUnderAttack(target, 1, board);

    expect(result).toBe(true);
  });

  it('returns true when square is attacked by knight', () => {
    const target = createPoint(9, 8);
    const knight = createTestPiece(1, 7, 7, 1, 'RED', 'knight');
    const board = createBoardWithPieces([knight]);

    const result = isSquareUnderAttack(target, 1, board);

    expect(result).toBe(true);
  });

  it('returns true when square is attacked by pawn', () => {
    const target = createPoint(8, 6);
    const pawn = createTestPiece(1, 7, 7, 1, 'RED', 'pawn');
    const targetPiece = createTestPiece(2, 8, 6, 2, 'BLUE', 'pawn');
    const board = createBoardWithPieces([pawn, targetPiece]);

    const result = isSquareUnderAttack(target, 1, board);

    expect(result).toBe(true);
  });

  it('returns false when no pieces can attack the square', () => {
    const target = createPoint(10, 10);
    const rook = createTestPiece(1, 7, 7, 1, 'RED', 'rook');
    const board = createBoardWithPieces([rook]);

    const result = isSquareUnderAttack(target, 1, board);

    expect(result).toBe(false);
  });

  it('returns false when only opponent pieces are on board', () => {
    const target = createPoint(10, 7);
    const rook = createTestPiece(1, 7, 7, 2, 'BLUE', 'rook');
    const board = createBoardWithPieces([rook]);

    const result = isSquareUnderAttack(target, 1, board);

    expect(result).toBe(false);
  });

  it('returns false when attacking piece is blocked by teammate', () => {
    const target = createPoint(12, 7);
    const rook = createTestPiece(1, 7, 7, 1, 'RED', 'rook');
    const blockingPiece = createTestPiece(2, 9, 7, 1, 'RED', 'pawn');
    const board = createBoardWithPieces([rook, blockingPiece]);

    const result = isSquareUnderAttack(target, 1, board);

    expect(result).toBe(false);
  });

  it('returns true when multiple pieces can attack the square', () => {
    const target = createPoint(10, 7);
    const rook = createTestPiece(1, 7, 7, 1, 'RED', 'rook');
    const queen = createTestPiece(2, 7, 10, 1, 'RED', 'queen');
    const board = createBoardWithPieces([rook, queen]);

    const result = isSquareUnderAttack(target, 1, board);

    expect(result).toBe(true);
  });

  it('ignores piece on the target square itself', () => {
    const target = createPoint(7, 7);
    const pieceOnTarget = createTestPiece(1, 7, 7, 1, 'RED', 'pawn');
    const rook = createTestPiece(2, 7, 10, 1, 'RED', 'rook');
    const board = createBoardWithPieces([pieceOnTarget, rook]);

    const result = isSquareUnderAttack(target, 1, board);

    expect(result).toBe(true);
  });

  it('returns false when only piece on target square is from attacking team', () => {
    const target = createPoint(7, 7);
    const pieceOnTarget = createTestPiece(1, 7, 7, 1, 'RED', 'pawn');
    const board = createBoardWithPieces([pieceOnTarget]);

    const result = isSquareUnderAttack(target, 1, board);

    expect(result).toBe(false);
  });

  it('correctly identifies attack from team 2', () => {
    const target = createPoint(10, 7);
    const rook = createTestPiece(1, 7, 7, 2, 'BLUE', 'rook');
    const board = createBoardWithPieces([rook]);

    const result = isSquareUnderAttack(target, 2, board);

    expect(result).toBe(true);
  });

  it('returns false for empty board', () => {
    const target = createPoint(7, 7);
    const board = createEmptyBoard();

    const result = isSquareUnderAttack(target, 1, board);

    expect(result).toBe(false);
  });

  it('handles complex board with multiple pieces', () => {
    const target = createPoint(10, 10);
    const pieces = [
      createTestPiece(1, 7, 7, 1, 'RED', 'queen'),
      createTestPiece(2, 5, 5, 2, 'BLUE', 'rook'),
      createTestPiece(3, 12, 12, 1, 'RED', 'bishop'),
    ];
    const board = createBoardWithPieces(pieces);

    const result = isSquareUnderAttack(target, 1, board);

    expect(result).toBe(true);
  });
});

describe('isKingInCheck', () => {
  it('returns false when king is not under attack', () => {
    const king = createTestPiece(1, 7, 7, 1, 'RED', 'king');
    const rook = createTestPiece(2, 7, 10, 1, 'RED', 'rook');
    const board = createBoardWithPieces([king, rook]);

    const result = isKingInCheck(king, board);

    expect(result).toBe(false);
  });

  it('returns true when king is attacked by rook', () => {
    const king = createTestPiece(1, 7, 7, 1, 'RED', 'king');
    const rook = createTestPiece(2, 7, 10, 2, 'BLUE', 'rook');
    const board = createBoardWithPieces([king, rook]);

    const result = isKingInCheck(king, board);

    expect(result).toBe(true);
  });

  it('returns true when king is attacked by bishop', () => {
    const king = createTestPiece(1, 7, 7, 1, 'RED', 'king');
    const bishop = createTestPiece(2, 10, 10, 2, 'BLUE', 'bishop');
    const board = createBoardWithPieces([king, bishop]);

    const result = isKingInCheck(king, board);

    expect(result).toBe(true);
  });

  it('returns true when king is attacked by queen', () => {
    const king = createTestPiece(1, 7, 7, 1, 'RED', 'king');
    const queen = createTestPiece(2, 7, 10, 2, 'BLUE', 'queen');
    const board = createBoardWithPieces([king, queen]);

    const result = isKingInCheck(king, board);

    expect(result).toBe(true);
  });

  it('returns true when king is attacked by knight', () => {
    const king = createTestPiece(1, 7, 7, 1, 'RED', 'king');
    const knight = createTestPiece(2, 9, 8, 2, 'BLUE', 'knight');
    const board = createBoardWithPieces([king, knight]);

    const result = isKingInCheck(king, board);

    expect(result).toBe(true);
  });

  it('returns true when king is attacked by pawn', () => {
    const king = createTestPiece(1, 7, 7, 1, 'RED', 'king');
    const pawn = createTestPiece(2, 8, 6, 2, 'BLUE', 'pawn');
    const board = createBoardWithPieces([king, pawn]);

    const result = isKingInCheck(king, board);

    expect(result).toBe(true);
  });

  it('returns false when attacker is blocked by teammate', () => {
    const king = createTestPiece(1, 7, 7, 1, 'RED', 'king');
    const rook = createTestPiece(2, 7, 12, 2, 'BLUE', 'rook');
    const blockingPiece = createTestPiece(3, 7, 9, 1, 'RED', 'pawn');
    const board = createBoardWithPieces([king, rook, blockingPiece]);

    const result = isKingInCheck(king, board);

    expect(result).toBe(false);
  });

  it('returns true when multiple pieces attack the king', () => {
    const king = createTestPiece(1, 7, 7, 1, 'RED', 'king');
    const rook = createTestPiece(2, 7, 10, 2, 'BLUE', 'rook');
    const bishop = createTestPiece(3, 10, 10, 2, 'BLUE', 'bishop');
    const board = createBoardWithPieces([king, rook, bishop]);

    const result = isKingInCheck(king, board);

    expect(result).toBe(true);
  });

  it('works for team 2 king', () => {
    const king = createTestPiece(1, 7, 7, 2, 'BLUE', 'king');
    const rook = createTestPiece(2, 7, 10, 1, 'RED', 'rook');
    const board = createBoardWithPieces([king, rook]);

    const result = isKingInCheck(king, board);

    expect(result).toBe(true);
  });

  it('returns false for king alone on board', () => {
    const king = createTestPiece(1, 7, 7, 1, 'RED', 'king');
    const board = createBoardWithPieces([king]);

    const result = isKingInCheck(king, board);

    expect(result).toBe(false);
  });

  it('ignores teammate pieces when checking for check', () => {
    const king = createTestPiece(1, 7, 7, 1, 'RED', 'king');
    const teammateRook = createTestPiece(2, 7, 10, 1, 'RED', 'rook');
    const board = createBoardWithPieces([king, teammateRook]);

    const result = isKingInCheck(king, board);

    expect(result).toBe(false);
  });

  it('detects check from knight even with pieces in between', () => {
    const king = createTestPiece(1, 7, 7, 1, 'RED', 'king');
    const knight = createTestPiece(2, 9, 8, 2, 'BLUE', 'knight');
    const blockingPiece = createTestPiece(3, 8, 7, 1, 'RED', 'pawn');
    const board = createBoardWithPieces([king, knight, blockingPiece]);

    const result = isKingInCheck(king, board);

    expect(result).toBe(true);
  });

  it('handles complex board state', () => {
    const king = createTestPiece(1, 7, 7, 1, 'RED', 'king');
    const pieces = [
      createTestPiece(2, 7, 10, 1, 'RED', 'pawn'),
      createTestPiece(3, 10, 10, 2, 'BLUE', 'bishop'),
      createTestPiece(4, 5, 5, 2, 'BLUE', 'rook'),
      createTestPiece(5, 9, 8, 2, 'BLUE', 'knight'),
    ];
    const board = createBoardWithPieces([king, ...pieces]);

    const result = isKingInCheck(king, board);

    expect(result).toBe(true);
  });
});

describe('isSquareBetween', () => {
  it('returns true for point between on horizontal line', () => {
    const from = createPoint(3, 7);
    const to = createPoint(10, 7);
    const between = createPoint(6, 7);

    const result = isSquareBetween(from, to, between);

    expect(result).toBe(true);
  });

  it('returns true for point between on vertical line', () => {
    const from = createPoint(7, 3);
    const to = createPoint(7, 10);
    const between = createPoint(7, 6);

    const result = isSquareBetween(from, to, between);

    expect(result).toBe(true);
  });

  it('returns true for point between on diagonal line', () => {
    const from = createPoint(3, 3);
    const to = createPoint(10, 10);
    const between = createPoint(6, 6);

    const result = isSquareBetween(from, to, between);

    expect(result).toBe(true);
  });

  it('returns true for point between on reverse diagonal line', () => {
    const from = createPoint(10, 3);
    const to = createPoint(3, 10);
    const between = createPoint(7, 6);

    const result = isSquareBetween(from, to, between);

    expect(result).toBe(true);
  });

  it('returns false when point is not in a straight line', () => {
    const from = createPoint(3, 3);
    const to = createPoint(10, 10);
    const between = createPoint(6, 7);

    const result = isSquareBetween(from, to, between);

    expect(result).toBe(false);
  });

  it('returns false when point is at from position (exclusive)', () => {
    const from = createPoint(3, 3);
    const to = createPoint(10, 10);
    const between = createPoint(3, 3);

    const result = isSquareBetween(from, to, between);

    expect(result).toBe(false);
  });

  it('returns false when point is at to position (exclusive)', () => {
    const from = createPoint(3, 3);
    const to = createPoint(10, 10);
    const between = createPoint(10, 10);

    const result = isSquareBetween(from, to, between);

    expect(result).toBe(false);
  });

  it('returns false when point is outside the range', () => {
    const from = createPoint(3, 3);
    const to = createPoint(10, 10);
    const between = createPoint(12, 12);

    const result = isSquareBetween(from, to, between);

    expect(result).toBe(false);
  });

  it('works with reverse direction (from > to)', () => {
    const from = createPoint(10, 7);
    const to = createPoint(3, 7);
    const between = createPoint(6, 7);

    const result = isSquareBetween(from, to, between);

    expect(result).toBe(true);
  });

  it('returns false for adjacent squares (no square between)', () => {
    const from = createPoint(7, 7);
    const to = createPoint(8, 7);
    const between = createPoint(7, 7);

    const result = isSquareBetween(from, to, between);

    expect(result).toBe(false);
  });

  it('handles multiple points between on same line', () => {
    const from = createPoint(3, 3);
    const to = createPoint(10, 10);
    const between1 = createPoint(4, 4);
    const between2 = createPoint(7, 7);
    const between3 = createPoint(9, 9);

    expect(isSquareBetween(from, to, between1)).toBe(true);
    expect(isSquareBetween(from, to, between2)).toBe(true);
    expect(isSquareBetween(from, to, between3)).toBe(true);
  });

  it('returns false for point on line but before from', () => {
    const from = createPoint(5, 5);
    const to = createPoint(10, 10);
    const between = createPoint(3, 3);

    const result = isSquareBetween(from, to, between);

    expect(result).toBe(false);
  });

  it('returns false for point on line but after to', () => {
    const from = createPoint(5, 5);
    const to = createPoint(10, 10);
    const between = createPoint(12, 12);

    const result = isSquareBetween(from, to, between);

    expect(result).toBe(false);
  });

  it('handles zero-length line (from equals to)', () => {
    const from = createPoint(5, 5);
    const to = createPoint(5, 5);
    const between = createPoint(5, 5);

    const result = isSquareBetween(from, to, between);

    expect(result).toBe(false);
  });
});

describe('canCastle', () => {
  beforeEach(() => {
    resetMovedPieces();
  });

  describe('RED team (bottom, horizontal castling)', () => {
    it('allows king-side castling when conditions are met', () => {
      const king = createTestPiece(1, 7, 13, 1, 'RED', 'king');
      const rook = createTestPiece(2, 10, 13, 1, 'RED', 'rook');
      const board = createBoardWithPieces([king, rook]);

      const result = canCastle(king, board, 'RED_KING_SIDE');

      expect(result).toBe(true);
    });

    it('allows queen-side castling when conditions are met', () => {
      const king = createTestPiece(1, 7, 13, 1, 'RED', 'king');
      const rook = createTestPiece(2, 3, 13, 1, 'RED', 'rook');
      const board = createBoardWithPieces([king, rook]);

      const result = canCastle(king, board, 'RED_QUEEN_SIDE');

      expect(result).toBe(true);
    });

    it('prevents castling when king has moved', () => {
      const king = createTestPiece(1, 7, 13, 1, 'RED', 'king');
      const rook = createTestPiece(2, 10, 13, 1, 'RED', 'rook');
      const board = createBoardWithPieces([king, rook]);

      trackPieceMovement(king);

      const result = canCastle(king, board, 'RED_KING_SIDE');

      expect(result).toBe(false);
    });

    it('prevents castling when rook has moved', () => {
      const king = createTestPiece(1, 7, 13, 1, 'RED', 'king');
      const rook = createTestPiece(2, 10, 13, 1, 'RED', 'rook');
      const board = createBoardWithPieces([king, rook]);

      trackPieceMovement(rook);

      const result = canCastle(king, board, 'RED_KING_SIDE');

      expect(result).toBe(false);
    });

    it('prevents castling when king is under attack', () => {
      const king = createTestPiece(1, 7, 13, 1, 'RED', 'king');
      const rook = createTestPiece(2, 10, 13, 1, 'RED', 'rook');
      const opponentRook = createTestPiece(3, 7, 10, 2, 'BLUE', 'rook');
      const board = createBoardWithPieces([king, rook, opponentRook]);

      const result = canCastle(king, board, 'RED_KING_SIDE');

      expect(result).toBe(false);
    });

    it('prevents castling when path is blocked', () => {
      const king = createTestPiece(1, 7, 13, 1, 'RED', 'king');
      const rook = createTestPiece(2, 10, 13, 1, 'RED', 'rook');
      const blockingPiece = createTestPiece(3, 8, 13, 1, 'RED', 'pawn');
      const board = createBoardWithPieces([king, rook, blockingPiece]);

      const result = canCastle(king, board, 'RED_KING_SIDE');

      expect(result).toBe(false);
    });

    it('prevents castling when path square is under attack', () => {
      const king = createTestPiece(1, 7, 13, 1, 'RED', 'king');
      const rook = createTestPiece(2, 10, 13, 1, 'RED', 'rook');
      const opponentRook = createTestPiece(3, 8, 10, 2, 'BLUE', 'rook');
      const board = createBoardWithPieces([king, rook, opponentRook]);

      const result = canCastle(king, board, 'RED_KING_SIDE');

      expect(result).toBe(false);
    });

    it('prevents castling when rook is missing', () => {
      const king = createTestPiece(1, 7, 13, 1, 'RED', 'king');
      const board = createBoardWithPieces([king]);

      const result = canCastle(king, board, 'RED_KING_SIDE');

      expect(result).toBe(false);
    });
  });

  describe('YELLOW team (top, horizontal castling)', () => {
    it('allows king-side castling when conditions are met', () => {
      const king = createTestPiece(1, 6, 0, 1, 'YELLOW', 'king');
      const rook = createTestPiece(2, 3, 0, 1, 'YELLOW', 'rook');
      const board = createBoardWithPieces([king, rook]);

      const result = canCastle(king, board, 'YELLOW_KING_SIDE');

      expect(result).toBe(true);
    });

    it('prevents castling when path is blocked', () => {
      const king = createTestPiece(1, 6, 0, 1, 'YELLOW', 'king');
      const rook = createTestPiece(2, 3, 0, 1, 'YELLOW', 'rook');
      const blockingPiece = createTestPiece(3, 5, 0, 1, 'YELLOW', 'pawn');
      const board = createBoardWithPieces([king, rook, blockingPiece]);

      const result = canCastle(king, board, 'YELLOW_KING_SIDE');

      expect(result).toBe(false);
    });
  });

  describe('BLUE team (left, vertical castling)', () => {
    it('allows king-side castling when conditions are met', () => {
      const king = createTestPiece(1, 0, 7, 2, 'BLUE', 'king');
      const rook = createTestPiece(2, 0, 10, 2, 'BLUE', 'rook');
      const board = createBoardWithPieces([king, rook]);

      const result = canCastle(king, board, 'BLUE_KING_SIDE');

      expect(result).toBe(true);
    });

    it('allows queen-side castling when conditions are met', () => {
      const king = createTestPiece(1, 0, 7, 2, 'BLUE', 'king');
      const rook = createTestPiece(2, 0, 3, 2, 'BLUE', 'rook');
      const board = createBoardWithPieces([king, rook]);

      const result = canCastle(king, board, 'BLUE_QUEEN_SIDE');

      expect(result).toBe(true);
    });

    it('prevents castling when king is under attack', () => {
      const king = createTestPiece(1, 0, 7, 2, 'BLUE', 'king');
      const rook = createTestPiece(2, 0, 10, 2, 'BLUE', 'rook');
      const opponentRook = createTestPiece(3, 3, 7, 1, 'RED', 'rook');
      const board = createBoardWithPieces([king, rook, opponentRook]);

      const result = canCastle(king, board, 'BLUE_KING_SIDE');

      expect(result).toBe(false);
    });
  });

  describe('GREEN team (right, vertical castling)', () => {
    it('allows king-side castling when conditions are met', () => {
      const king = createTestPiece(1, 13, 6, 2, 'GREEN', 'king');
      const rook = createTestPiece(2, 13, 3, 2, 'GREEN', 'rook');
      const board = createBoardWithPieces([king, rook]);

      const result = canCastle(king, board, 'GREEN_KING_SIDE');

      expect(result).toBe(true);
    });

    it('prevents castling when path is blocked', () => {
      const king = createTestPiece(1, 13, 6, 2, 'GREEN', 'king');
      const rook = createTestPiece(2, 13, 3, 2, 'GREEN', 'rook');
      const blockingPiece = createTestPiece(3, 13, 5, 2, 'GREEN', 'pawn');
      const board = createBoardWithPieces([king, rook, blockingPiece]);

      const result = canCastle(king, board, 'GREEN_KING_SIDE');

      expect(result).toBe(false);
    });
  });

  describe('invalid castle type', () => {
    it('returns false for invalid castle type', () => {
      const king = createTestPiece(1, 7, 13, 1, 'RED', 'king');
      const rook = createTestPiece(2, 10, 13, 1, 'RED', 'rook');
      const board = createBoardWithPieces([king, rook]);

      const result = canCastle(king, board, 'INVALID_CASTLE' as CastleType);

      expect(result).toBe(false);
    });
  });
});

describe('wouldResolveCheck', () => {
  it('returns true when no king is found', () => {
    const movingPiece = createTestPiece(1, 7, 7, 1, 'RED', 'pawn');
    const to = createPoint(7, 6);
    const board = createBoardWithPieces([movingPiece]);

    const result = wouldResolveCheck(movingPiece, to, 'RED', board);

    expect(result).toBe(true);
  });

  it('returns true when king is not in check', () => {
    const king = createTestPiece(1, 7, 7, 1, 'RED', 'king');
    const movingPiece = createTestPiece(2, 5, 5, 1, 'RED', 'pawn');
    const to = createPoint(5, 4);
    const board = createBoardWithPieces([king, movingPiece]);

    const result = wouldResolveCheck(movingPiece, to, 'RED', board);

    expect(result).toBe(true);
  });

  it('returns true when king moves to safe square', () => {
    const king = createTestPiece(1, 7, 7, 1, 'RED', 'king');
    const opponentRook = createTestPiece(2, 7, 10, 2, 'BLUE', 'rook');
    const board = createBoardWithPieces([king, opponentRook]);

    const to = createPoint(8, 7);

    const result = wouldResolveCheck(king, to, 'RED', board);

    expect(result).toBe(true);
  });

  it('returns false when king moves to unsafe square', () => {
    const king = createTestPiece(1, 7, 7, 1, 'RED', 'king');
    const opponentRook = createTestPiece(2, 7, 10, 2, 'BLUE', 'rook');
    const board = createBoardWithPieces([king, opponentRook]);

    const to = createPoint(7, 8);

    const result = wouldResolveCheck(king, to, 'RED', board);

    expect(result).toBe(false);
  });

  it('returns true when piece captures the attacker', () => {
    const king = createTestPiece(1, 7, 7, 1, 'RED', 'king');
    const movingPiece = createTestPiece(2, 5, 5, 1, 'RED', 'rook');
    const attacker = createTestPiece(3, 5, 10, 2, 'BLUE', 'rook');
    const board = createBoardWithPieces([king, movingPiece, attacker]);

    const to = createPoint(5, 10);

    const result = wouldResolveCheck(movingPiece, to, 'RED', board);

    expect(result).toBe(true);
  });

  it('returns true when piece blocks the attack', () => {
    const king = createTestPiece(1, 7, 7, 1, 'RED', 'king');
    const movingPiece = createTestPiece(2, 5, 5, 1, 'RED', 'pawn');
    const attacker = createTestPiece(3, 7, 10, 2, 'BLUE', 'rook');
    const board = createBoardWithPieces([king, movingPiece, attacker]);

    const to = createPoint(7, 8);

    const result = wouldResolveCheck(movingPiece, to, 'RED', board);

    expect(result).toBe(true);
  });

  it('returns false when multiple attackers exist (only king can resolve)', () => {
    const king = createTestPiece(1, 7, 7, 1, 'RED', 'king');
    const movingPiece = createTestPiece(2, 5, 5, 1, 'RED', 'pawn');
    const attacker1 = createTestPiece(3, 7, 10, 2, 'BLUE', 'rook');
    const attacker2 = createTestPiece(4, 10, 10, 2, 'BLUE', 'bishop');
    const board = createBoardWithPieces([king, movingPiece, attacker1, attacker2]);

    const to = createPoint(7, 8);

    const result = wouldResolveCheck(movingPiece, to, 'RED', board);

    expect(result).toBe(false);
  });

  it('returns false when move does not capture or block attacker', () => {
    const king = createTestPiece(1, 7, 7, 1, 'RED', 'king');
    const movingPiece = createTestPiece(2, 5, 5, 1, 'RED', 'pawn');
    const attacker = createTestPiece(3, 7, 10, 2, 'BLUE', 'rook');
    const board = createBoardWithPieces([king, movingPiece, attacker]);

    const to = createPoint(5, 4);

    const result = wouldResolveCheck(movingPiece, to, 'RED', board);

    expect(result).toBe(false);
  });

  it('returns false when move does not block knight attack (knights cannot be blocked)', () => {
    const king = createTestPiece(1, 7, 7, 1, 'RED', 'king');
    const movingPiece = createTestPiece(2, 5, 5, 1, 'RED', 'pawn');
    const attacker = createTestPiece(3, 9, 8, 2, 'BLUE', 'knight');
    const board = createBoardWithPieces([king, movingPiece, attacker]);

    const to = createPoint(7, 8);

    const result = wouldResolveCheck(movingPiece, to, 'RED', board);

    expect(result).toBe(false);
  });

  it('works for team 2 (BLUE)', () => {
    const king = createTestPiece(1, 7, 7, 2, 'BLUE', 'king');
    const movingPiece = createTestPiece(2, 5, 5, 2, 'BLUE', 'rook');
    const attacker = createTestPiece(3, 5, 10, 1, 'RED', 'rook');
    const board = createBoardWithPieces([king, movingPiece, attacker]);

    const to = createPoint(5, 10);

    const result = wouldResolveCheck(movingPiece, to, 'BLUE', board);

    expect(result).toBe(true);
  });
});

describe('getLegalMoves - Integration Tests', () => {
  it('queen moves from position built via UCI moves', () => {
    // Set up position: Red queen at starting position
    const moves: string[] = [];
    const fen4 = fen4FromMoves(moves);
    const { basePoints } = parseFen4(fen4);

    // Find the red queen
    const queen = basePoints.find(p => p.pieceType === 'queen' && p.color === 'RED');
    expect(queen).toBeDefined();

    // Verify getLegalMoves runs without error
    const legalMoves = getLegalMoves(queen!, basePoints);
    expect(Array.isArray(legalMoves)).toBe(true);
  });

  it('king standard moves from FEN4 position', () => {
    // Simple position with king in center - must have exactly 14 ranks
    const customFen4 = 'R-0,0,0,0-1,1,1,1-1,1,1,1-0,0,0,0-0-14/14/14/14/14/14/14/14/14/14/14/14/7,rK,6/14-,,,';
    const { basePoints } = parseFen4(customFen4);

    const king = basePoints.find(p => p.pieceType === 'king' && p.color === 'RED');
    expect(king).toBeDefined();

    const legalMoves = getLegalMoves(king!, basePoints);

    // Verify king can move in multiple directions
    expect(legalMoves).toContainEqual(expect.objectContaining({ x: 8, y: 13 }));
    expect(legalMoves).toContainEqual(expect.objectContaining({ x: 6, y: 13 }));
    expect(legalMoves).toContainEqual(expect.objectContaining({ x: 8, y: 12 }));
  });

  it('pawn forward moves from UCI sequence', () => {
    // Red pawn moves forward one square
    const moves: string[] = ['d2-d3'];
    const fen4 = fen4FromMoves(moves);
    const { basePoints } = parseFen4(fen4);

    const pawn = basePoints.find(p => p.pieceType === 'pawn' && p.x === 3 && p.y === 11 && p.color === 'RED');
    expect(pawn).toBeDefined();

    const legalMoves = getLegalMoves(pawn!, basePoints);

    // Verify pawn can move forward
    expect(legalMoves).toContainEqual({ x: 3, y: 10, canCapture: false });
  });

  it('knight L-shaped moves from FEN4 position', () => {
    // Knight at center of board - must have exactly 14 ranks
    const customFen4 = 'R-0,0,0,0-1,1,1,1-1,1,1,1-0,0,0,0-0-14/14/14/14/14/14/14/7,rN,6/14/14/14/14/14/14-,,,';
    const { basePoints } = parseFen4(customFen4);

    const knight = basePoints.find(p => p.pieceType === 'knight' && p.color === 'RED');
    expect(knight).toBeDefined();

    const legalMoves = getLegalMoves(knight!, basePoints);

    // Verify knight's L-shaped moves
    expect(legalMoves).toContainEqual({ x: 9, y: 6, canCapture: false });
    expect(legalMoves).toContainEqual({ x: 8, y: 5, canCapture: false });
  });

  it('simple position with multiple pieces', () => {
    // Position with queen and knight - must have exactly 14 ranks
    const customFen4 = 'R-0,0,0,0-1,1,1,1-1,1,1,1-0,0,0,0-0-14/14/14/14/14/14/14/7,rQ,rN,5/14/14/14/14/14/14-,,,';
    const { basePoints } = parseFen4(customFen4);

    const queen = basePoints.find(p => p.pieceType === 'queen' && p.color === 'RED');
    expect(queen).toBeDefined();

    const legalMoves = getLegalMoves(queen!, basePoints);

    // Verify queen can move despite having a teammate nearby
    expect(legalMoves.length).toBeGreaterThan(0);
    expect(legalMoves).toContainEqual(expect.objectContaining({ x: 8, y: 8 }));
  });
});
