import { createPoint } from '../types/board';

// Team color definitions
export const TEAM_1_COLORS = ['RED', 'YELLOW'] as const;
export const TEAM_2_COLORS = ['BLUE', 'GREEN'] as const;

// Keep the original turn order: red -> blue -> yellow -> green
export const PLAYER_COLORS = ['RED', 'BLUE', 'YELLOW', 'GREEN'] as const;

export type NamedColor = typeof PLAYER_COLORS[number];

export const TURN_ORDER = PLAYER_COLORS;

// Map of hex colors to their corresponding color names
export const HEX_TO_COLOR: Record<string, NamedColor> = {
  '#F44336': 'RED',
  '#FFEB3B': 'YELLOW',
  '#2196F3': 'BLUE',
  '#4CAF50': 'GREEN'
} as const;

// Map of color names to their hex values
export const COLOR_TO_HEX: Record<NamedColor, string> = {
  'RED': '#F44336',
  'YELLOW': '#FFEB3B',
  'BLUE': '#2196F3',
  'GREEN': '#4CAF50'
} as const;

/**
 * Gets the team number (1 or 2) for a given color
 * @param color - The color to check (can be name or hex code)
 * @returns The team number (1 or 2)
 * @throws Will throw an error if the color is not a valid player color
 */
export function getTeamByColor(color: string): 1 | 2 {
  if (!color) {
    throw new Error('Color cannot be empty');
  }

  const normalizedColor = normalizeColor(color);
  
  if (!normalizedColor) {
    throw new Error(`Invalid color: ${color}`);
  }

  return TEAM_1_COLORS.includes(normalizedColor as any) ? 1 : 2;
}

/**
 * Normalizes color string to match one of the PLAYER_COLORS
 * @param color - The color to normalize (can be color name or hex code)
 * @returns A normalized PlayerColor or undefined if not a valid color
 */
export function normalizeColor(color: string): NamedColor | undefined {
  if (!color) return undefined;
  
  const upperColor = color.toUpperCase().trim();
  
  // First try direct match with PLAYER_COLORS
  const directMatch = PLAYER_COLORS.find(c => c === upperColor);
  if (directMatch) return directMatch;
  
  // Map of hex codes to color names
  const hexToColorMap: Record<string, NamedColor> = {
    '#F44336': 'RED',
    '#FFEB3B': 'YELLOW',
    '#2196F3': 'BLUE',
    '#4CAF50': 'GREEN'
  };
  
  // Try to match hex code (case insensitive)
  return hexToColorMap[upperColor];
}

/**
 * Gets the current player's color based on turn index
 * @param turnIndex - The current turn index
 * @returns The current player's color
 */
export function getCurrentPlayerColor(turnIndex: number): NamedColor {
  return TURN_ORDER[turnIndex % TURN_ORDER.length];
}

export const DEFAULT_GAME_ID = 'default';

// Initial board setup - matches the reset-board.ts configuration
export const INITIAL_BASE_POINTS = [
  // Yellow pieces (top)
  { id: 1, x: 7, y: 0, userId: 'system', color: 'YELLOW', pieceType: 'queen', team: 1, isCastle: false, castleType: null },
  { id: 2, x: 8, y: 0, userId: 'system', color: 'YELLOW', pieceType: 'bishop', team: 1, isCastle: false, castleType: null },
  { id: 3, x: 6, y: 0, userId: 'system', color: 'YELLOW', pieceType: 'king', team: 1, isCastle: false, castleType: null },
  { id: 4, x: 5, y: 0, userId: 'system', color: 'YELLOW', pieceType: 'bishop', team: 1, isCastle: false, castleType: null },
  { id: 5, x: 4, y: 0, userId: 'system', color: 'YELLOW', pieceType: 'knight', team: 1, isCastle: false, castleType: null },
  { id: 6, x: 9, y: 0, userId: 'system', color: 'YELLOW', pieceType: 'knight', team: 1, isCastle: false, castleType: null },
  { id: 7, x: 3, y: 0, userId: 'system', color: 'YELLOW', pieceType: 'rook', team: 1, isCastle: false, castleType: null },
  { id: 8, x: 10, y: 0, userId: 'system', color: 'YELLOW', pieceType: 'rook', team: 1, isCastle: false, castleType: null },
  { id: 9, x: 7, y: 1, userId: 'system', color: 'YELLOW', pieceType: 'pawn', team: 1, isCastle: false, castleType: null },
  { id: 10, x: 6, y: 1, userId: 'system', color: 'YELLOW', pieceType: 'pawn', team: 1, isCastle: false, castleType: null },
  { id: 11, x: 8, y: 1, userId: 'system', color: 'YELLOW', pieceType: 'pawn', team: 1, isCastle: false, castleType: null },
  { id: 12, x: 5, y: 1, userId: 'system', color: 'YELLOW', pieceType: 'pawn', team: 1, isCastle: false, castleType: null },
  { id: 13, x: 4, y: 1, userId: 'system', color: 'YELLOW', pieceType: 'pawn', team: 1, isCastle: false, castleType: null },
  { id: 14, x: 9, y: 1, userId: 'system', color: 'YELLOW', pieceType: 'pawn', team: 1, isCastle: false, castleType: null },
  { id: 15, x: 3, y: 1, userId: 'system', color: 'YELLOW', pieceType: 'pawn', team: 1, isCastle: false, castleType: null },
  { id: 16, x: 10, y: 1, userId: 'system', color: 'YELLOW', pieceType: 'pawn', team: 1, isCastle: false, castleType: null },
  
  // Red pieces (bottom)
  { id: 17, x: 6, y: 13, userId: 'system', color: 'RED', pieceType: 'queen', team: 1, isCastle: false, castleType: null },
  { id: 18, x: 5, y: 13, userId: 'system', color: 'RED', pieceType: 'bishop', team: 1, isCastle: false, castleType: null },
  { id: 19, x: 7, y: 13, userId: 'system', color: 'RED', pieceType: 'king', team: 1, isCastle: false, castleType: null },
  { id: 20, x: 8, y: 13, userId: 'system', color: 'RED', pieceType: 'bishop', team: 1, isCastle: false, castleType: null },
  { id: 21, x: 4, y: 13, userId: 'system', color: 'RED', pieceType: 'knight', team: 1, isCastle: false, castleType: null },
  { id: 22, x: 9, y: 13, userId: 'system', color: 'RED', pieceType: 'knight', team: 1, isCastle: false, castleType: null },
  { id: 23, x: 3, y: 13, userId: 'system', color: 'RED', pieceType: 'rook', team: 1, isCastle: false, castleType: null },
  { id: 24, x: 10, y: 13, userId: 'system', color: 'RED', pieceType: 'rook', team: 1, isCastle: false, castleType: null },
  { id: 25, x: 6, y: 12, userId: 'system', color: 'RED', pieceType: 'pawn', team: 1, isCastle: false, castleType: null },
  { id: 26, x: 7, y: 12, userId: 'system', color: 'RED', pieceType: 'pawn', team: 1, isCastle: false, castleType: null },
  { id: 27, x: 5, y: 12, userId: 'system', color: 'RED', pieceType: 'pawn', team: 1, isCastle: false, castleType: null },
  { id: 28, x: 8, y: 12, userId: 'system', color: 'RED', pieceType: 'pawn', team: 1, isCastle: false, castleType: null },
  { id: 29, x: 4, y: 12, userId: 'system', color: 'RED', pieceType: 'pawn', team: 1, isCastle: false, castleType: null },
  { id: 30, x: 9, y: 12, userId: 'system', color: 'RED', pieceType: 'pawn', team: 1, isCastle: false, castleType: null },
  { id: 31, x: 3, y: 12, userId: 'system', color: 'RED', pieceType: 'pawn', team: 1, isCastle: false, castleType: null },
  { id: 32, x: 10, y: 12, userId: 'system', color: 'RED', pieceType: 'pawn', team: 1, isCastle: false, castleType: null },
  
  // Blue pieces (left)
  { id: 33, x: 0, y: 6, userId: 'system', color: 'BLUE', pieceType: 'queen', team: 2, isCastle: false, castleType: null },
  { id: 34, x: 0, y: 5, userId: 'system', color: 'BLUE', pieceType: 'bishop', team: 2, isCastle: false, castleType: null },
  { id: 35, x: 0, y: 7, userId: 'system', color: 'BLUE', pieceType: 'king', team: 2, isCastle: false, castleType: null },
  { id: 36, x: 0, y: 8, userId: 'system', color: 'BLUE', pieceType: 'bishop', team: 2, isCastle: false, castleType: null },
  { id: 37, x: 0, y: 4, userId: 'system', color: 'BLUE', pieceType: 'knight', team: 2, isCastle: false, castleType: null },
  { id: 38, x: 0, y: 9, userId: 'system', color: 'BLUE', pieceType: 'knight', team: 2, isCastle: false, castleType: null },
  { id: 39, x: 0, y: 3, userId: 'system', color: 'BLUE', pieceType: 'rook', team: 2, isCastle: false, castleType: null },
  { id: 40, x: 0, y: 10, userId: 'system', color: 'BLUE', pieceType: 'rook', team: 2, isCastle: false, castleType: null },
  { id: 41, x: 1, y: 6, userId: 'system', color: 'BLUE', pieceType: 'pawn', team: 2, isCastle: false, castleType: null },
  { id: 42, x: 1, y: 7, userId: 'system', color: 'BLUE', pieceType: 'pawn', team: 2, isCastle: false, castleType: null },
  { id: 43, x: 1, y: 5, userId: 'system', color: 'BLUE', pieceType: 'pawn', team: 2, isCastle: false, castleType: null },
  { id: 44, x: 1, y: 8, userId: 'system', color: 'BLUE', pieceType: 'pawn', team: 2, isCastle: false, castleType: null },
  { id: 45, x: 1, y: 4, userId: 'system', color: 'BLUE', pieceType: 'pawn', team: 2, isCastle: false, castleType: null },
  { id: 46, x: 1, y: 9, userId: 'system', color: 'BLUE', pieceType: 'pawn', team: 2, isCastle: false, castleType: null },
  { id: 47, x: 1, y: 3, userId: 'system', color: 'BLUE', pieceType: 'pawn', team: 2, isCastle: false, castleType: null },
  { id: 48, x: 1, y: 10, userId: 'system', color: 'BLUE', pieceType: 'pawn', team: 2, isCastle: false, castleType: null },
  
  // Green pieces (right)
  { id: 49, x: 13, y: 7, userId: 'system', color: 'GREEN', pieceType: 'queen', team: 2, isCastle: false, castleType: null },
  { id: 50, x: 13, y: 8, userId: 'system', color: 'GREEN', pieceType: 'bishop', team: 2, isCastle: false, castleType: null },
  { id: 51, x: 13, y: 6, userId: 'system', color: 'GREEN', pieceType: 'king', team: 2, isCastle: false, castleType: null },
  { id: 52, x: 13, y: 5, userId: 'system', color: 'GREEN', pieceType: 'bishop', team: 2, isCastle: false, castleType: null },
  { id: 53, x: 13, y: 4, userId: 'system', color: 'GREEN', pieceType: 'knight', team: 2, isCastle: false, castleType: null },
  { id: 54, x: 13, y: 9, userId: 'system', color: 'GREEN', pieceType: 'knight', team: 2, isCastle: false, castleType: null },
  { id: 55, x: 13, y: 3, userId: 'system', color: 'GREEN', pieceType: 'rook', team: 2, isCastle: false, castleType: null },
  { id: 56, x: 13, y: 10, userId: 'system', color: 'GREEN', pieceType: 'rook', team: 2, isCastle: false, castleType: null },
  { id: 57, x: 12, y: 7, userId: 'system', color: 'GREEN', pieceType: 'pawn', team: 2, isCastle: false, castleType: null },
  { id: 58, x: 12, y: 6, userId: 'system', color: 'GREEN', pieceType: 'pawn', team: 2, isCastle: false, castleType: null },
  { id: 59, x: 12, y: 8, userId: 'system', color: 'GREEN', pieceType: 'pawn', team: 2, isCastle: false, castleType: null },
  { id: 60, x: 12, y: 5, userId: 'system', color: 'GREEN', pieceType: 'pawn', team: 2, isCastle: false, castleType: null },
  { id: 61, x: 12, y: 4, userId: 'system', color: 'GREEN', pieceType: 'pawn', team: 2, isCastle: false, castleType: null },
  { id: 62, x: 12, y: 9, userId: 'system', color: 'GREEN', pieceType: 'pawn', team: 2, isCastle: false, castleType: null },
  { id: 63, x: 12, y: 3, userId: 'system', color: 'GREEN', pieceType: 'pawn', team: 2, isCastle: false, castleType: null },
  { id: 64, x: 12, y: 10, userId: 'system', color: 'GREEN', pieceType: 'pawn', team: 2, isCastle: false, castleType: null }
] as const;

export const BOARD_CONFIG = {
  GRID_SIZE: 14, // 14x14 grid
  WORLD_SIZE: 14, // World size matches grid size
  DEFAULT_POSITION: createPoint(0, 0),
  BUTTONS: [
    { label: 'Random', className: 'randomButton' },
    { label: 'Clear All', className: 'clearButton' }
  ],
  DIRECTIONS: [
    { key: 'up', label: '↑ Up' },
    { key: 'down', label: '↓ Down' },
    { key: 'left', label: '← Left' },
    { key: 'right', label: '→ Right' }
  ]
} as const;

export type BoardConfig = typeof BOARD_CONFIG;

// Non-playable corner squares (3x3 in each corner)
export const NON_PLAYABLE_CORNERS = [
  // Top-left corner (0,0)
  { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
  { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 },
  { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 },
  
  // Top-right corner (11,0)
  { x: 11, y: 0 }, { x: 12, y: 0 }, { x: 13, y: 0 },
  { x: 11, y: 1 }, { x: 12, y: 1 }, { x: 13, y: 1 },
  { x: 11, y: 2 }, { x: 12, y: 2 }, { x: 13, y: 2 },
  
  // Bottom-left corner (0,11)
  { x: 0, y: 11 }, { x: 1, y: 11 }, { x: 2, y: 11 },
  { x: 0, y: 12 }, { x: 1, y: 12 }, { x: 2, y: 12 },
  { x: 0, y: 13 }, { x: 1, y: 13 }, { x: 2, y: 13 },
  
  // Bottom-right corner (11,11)
  { x: 11, y: 11 }, { x: 12, y: 11 }, { x: 13, y: 11 },
  { x: 11, y: 12 }, { x: 12, y: 12 }, { x: 13, y: 12 },
  { x: 11, y: 13 }, { x: 12, y: 13 }, { x: 13, y: 13 }
];

// Helper function to check if a square is in a non-playable corner
export function isInNonPlayableCorner(x: number, y: number): boolean {
  return NON_PLAYABLE_CORNERS.some(corner => corner.x === x && corner.y === y);
}

// Precalculated restricted squares for the initial board position
export const INITIAL_RESTRICTED_SQUARES = [
  33,31,38,36,35,49,34,48,50,47,32,46,37,51,45,52,
  159,157,164,162,160,146,161,147,145,148,158,144,163,149,143,150
];

export const INITIAL_RESTRICTED_SQUARES_INFO = [
  {"index":33,"x":5,"y":2,"restrictedBy":[{"basePointId":5,"basePointX":4,"basePointY":0},{"basePointId":"12","basePointX":5,"basePointY":1}],"canCapture":false,"pieceType":"knight","team":1},
  {"index":31,"x":3,"y":2,"restrictedBy":[{"basePointId":5,"basePointX":4,"basePointY":0},{"basePointId":"15","basePointX":3,"basePointY":1}],"canCapture":false,"pieceType":"knight","team":1},
  {"index":38,"x":10,"y":2,"restrictedBy":[{"basePointId":6,"basePointX":9,"basePointY":0},{"basePointId":"16","basePointX":10,"basePointY":1}],"canCapture":false,"pieceType":"knight","team":1},
  {"index":36,"x":8,"y":2,"restrictedBy":[{"basePointId":6,"basePointX":9,"basePointY":0},{"basePointId":"11","basePointX":8,"basePointY":1}],"canCapture":false,"pieceType":"knight","team":1},
  {"index":35,"x":7,"y":2,"restrictedBy":[{"basePointId":9,"basePointX":7,"basePointY":1}],"canCapture":false,"pieceType":"pawn","team":1},
  {"index":49,"x":7,"y":3,"restrictedBy":[{"basePointId":9,"basePointX":7,"basePointY":1}],"canCapture":false,"pieceType":"pawn","team":1},
  {"index":34,"x":6,"y":2,"restrictedBy":[{"basePointId":10,"basePointX":6,"basePointY":1}],"canCapture":false,"pieceType":"pawn","team":1},
  {"index":48,"x":6,"y":3,"restrictedBy":[{"basePointId":10,"basePointX":6,"basePointY":1}],"canCapture":false,"pieceType":"pawn","team":1},
  {"index":50,"x":8,"y":3,"restrictedBy":[{"basePointId":11,"basePointX":8,"basePointY":1}],"canCapture":false,"pieceType":"pawn","team":1},
  {"index":47,"x":5,"y":3,"restrictedBy":[{"basePointId":12,"basePointX":5,"basePointY":1}],"canCapture":false,"pieceType":"pawn","team":1},
  {"index":32,"x":4,"y":2,"restrictedBy":[{"basePointId":13,"basePointX":4,"basePointY":1}],"canCapture":false,"pieceType":"pawn","team":1},
  {"index":46,"x":4,"y":3,"restrictedBy":[{"basePointId":13,"basePointX":4,"basePointY":1}],"canCapture":false,"pieceType":"pawn","team":1},
  {"index":37,"x":9,"y":2,"restrictedBy":[{"basePointId":14,"basePointX":9,"basePointY":1}],"canCapture":false,"pieceType":"pawn","team":1},
  {"index":51,"x":9,"y":3,"restrictedBy":[{"basePointId":14,"basePointX":9,"basePointY":1}],"canCapture":false,"pieceType":"pawn","team":1},
  {"index":45,"x":3,"y":3,"restrictedBy":[{"basePointId":15,"basePointX":3,"basePointY":1}],"canCapture":false,"pieceType":"pawn","team":1},
  {"index":52,"x":10,"y":3,"restrictedBy":[{"basePointId":16,"basePointX":10,"basePointY":1}],"canCapture":false,"pieceType":"pawn","team":1},
  {"index":159,"x":5,"y":11,"restrictedBy":[{"basePointId":21,"basePointX":4,"basePointY":13},{"basePointId":"27","basePointX":5,"basePointY":12}],"canCapture":false,"pieceType":"knight","team":1},
  {"index":157,"x":3,"y":11,"restrictedBy":[{"basePointId":21,"basePointX":4,"basePointY":13},{"basePointId":"31","basePointX":3,"basePointY":12}],"canCapture":false,"pieceType":"knight","team":1},
  {"index":164,"x":10,"y":11,"restrictedBy":[{"basePointId":22,"basePointX":9,"basePointY":13},{"basePointId":"32","basePointX":10,"basePointY":12}],"canCapture":false,"pieceType":"knight","team":1},
  {"index":162,"x":8,"y":11,"restrictedBy":[{"basePointId":22,"basePointX":9,"basePointY":13},{"basePointId":"28","basePointX":8,"basePointY":12}],"canCapture":false,"pieceType":"knight","team":1},
  {"index":160,"x":6,"y":11,"restrictedBy":[{"basePointId":25,"basePointX":6,"basePointY":12}],"canCapture":false,"pieceType":"pawn","team":1},
  {"index":146,"x":6,"y":10,"restrictedBy":[{"basePointId":25,"basePointX":6,"basePointY":12}],"canCapture":false,"pieceType":"pawn","team":1},
  {"index":161,"x":7,"y":11,"restrictedBy":[{"basePointId":26,"basePointX":7,"basePointY":12}],"canCapture":false,"pieceType":"pawn","team":1},
  {"index":147,"x":7,"y":10,"restrictedBy":[{"basePointId":26,"basePointX":7,"basePointY":12}],"canCapture":false,"pieceType":"pawn","team":1},
  {"index":145,"x":5,"y":10,"restrictedBy":[{"basePointId":27,"basePointX":5,"basePointY":12}],"canCapture":false,"pieceType":"pawn","team":1},
  {"index":148,"x":8,"y":10,"restrictedBy":[{"basePointId":28,"basePointX":8,"basePointY":12}],"canCapture":false,"pieceType":"pawn","team":1},
  {"index":158,"x":4,"y":11,"restrictedBy":[{"basePointId":29,"basePointX":4,"basePointY":12}],"canCapture":false,"pieceType":"pawn","team":1},
  {"index":144,"x":4,"y":10,"restrictedBy":[{"basePointId":29,"basePointX":4,"basePointY":12}],"canCapture":false,"pieceType":"pawn","team":1},
  {"index":163,"x":9,"y":11,"restrictedBy":[{"basePointId":30,"basePointX":9,"basePointY":12}],"canCapture":false,"pieceType":"pawn","team":1},
  {"index":149,"x":9,"y":10,"restrictedBy":[{"basePointId":30,"basePointX":9,"basePointY":12}],"canCapture":false,"pieceType":"pawn","team":1},
  {"index":143,"x":3,"y":10,"restrictedBy":[{"basePointId":31,"basePointX":3,"basePointY":12}],"canCapture":false,"pieceType":"pawn","team":1},
  {"index":150,"x":10,"y":10,"restrictedBy":[{"basePointId":32,"basePointX":10,"basePointY":12}],"canCapture":false,"pieceType":"pawn","team":1}
];
