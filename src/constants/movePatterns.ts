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
  ]
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
