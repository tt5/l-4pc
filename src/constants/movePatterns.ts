import { BOARD_CONFIG } from './game';

export const MOVE_PATTERNS = {
  STRAIGHT: [
    [0, 1],   // up
    [1, 0],   // right
    [0, -1],  // down
    [-1, 0]   // left
  ],
  DIAGONAL: [
    [1, 1],   // up-right
    [1, -1],  // down-right
    [-1, -1], // down-left
    [-1, 1]   // up-left
  ],
  KNIGHT: [
    [1, 2],   // right 1, up 2
    [2, 1],   // right 2, up 1
    [2, -1],  // right 2, down 1
    [1, -2],  // right 1, down 2
    [-1, -2], // left 1, down 2
    [-2, -1], // left 2, down 1
    [-2, 1],  // left 2, up 1
    [-1, 2]   // left 1, up 2
  ],
  KING: [
    [0, 1], [1, 1], [1, 0], [1, -1],
    [0, -1], [-1, -1], [-1, 0], [-1, 1]
  ],
  // Castling moves: [dx, dy, isCastle, rookX, rookY, rookDx, rookDy]
  CASTLING: {
    // Red (bottom) - horizontal castling
    RED_KING_SIDE: [2, 0, true, 10, 13, -2, 0],
    RED_QUEEN_SIDE: [-2, 0, true, 3, 13, 3, 0],
    
    // Yellow (top) - horizontal castling
    YELLOW_KING_SIDE: [-2, 0, true, 3, 0, -2, 0],
    YELLOW_QUEEN_SIDE: [2, 0, true, 10, 0, 3, 0],
    
    // Blue (left) - vertical castling
    BLUE_KING_SIDE: [0, 2, true, 0, 10, 0, -2],
    BLUE_QUEEN_SIDE: [0, -2, true, 0, 3, 0, 3],
    
    // Green (right) - vertical castling
    GREEN_KING_SIDE: [0, -2, true, 13, 3, 0, -2],
    GREEN_QUEEN_SIDE: [0, 2, true, 13, 10, 0, 3]
  }
} as const;

export const PIECE_MOVEMENT = {
  QUEEN: [...MOVE_PATTERNS.STRAIGHT, ...MOVE_PATTERNS.DIAGONAL],
  KING: MOVE_PATTERNS.KING,
  BISHOP: MOVE_PATTERNS.DIAGONAL,
  KNIGHT: MOVE_PATTERNS.KNIGHT,
  ROOK: MOVE_PATTERNS.STRAIGHT,
  PAWN: {
    RED: { dx: 0, dy: -1, startY: BOARD_CONFIG.GRID_SIZE - 2 },
    YELLOW: { dx: 0, dy: 1, startY: 1 },
    BLUE: { dx: 1, dy: 0, startX: 1 },
    GREEN: { dx: -1, dy: 0, startX: BOARD_CONFIG.GRID_SIZE - 2 }
  }
} as const;

export const PIECE_TYPES = {
  PAWN: 'pawn',
  KNIGHT: 'knight',
  BISHOP: 'bishop',
  ROOK: 'rook',
  QUEEN: 'queen',
  KING: 'king'
} as const;
