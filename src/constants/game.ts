import { createPoint } from '../types/board';

// Team color definitions
export const TEAM_1_COLORS = ['red', 'yellow'] as const;
export const TEAM_2_COLORS = ['blue', 'green'] as const;

// Keep the original turn order: red -> blue -> yellow -> green
export const PLAYER_COLORS = ['red', 'blue', 'yellow', 'green'] as const;

export type PlayerColor = typeof PLAYER_COLORS[number];

export const TURN_ORDER = PLAYER_COLORS;

// Map of hex colors to their corresponding color names
const HEX_TO_COLOR: Record<string, PlayerColor> = {
  '#f44336': 'red',
  '#ffeb3b': 'yellow',
  '#2196f3': 'blue',
  '#4caf50': 'green'
} as const;

// Map of color names to their hex values
export const COLOR_TO_HEX: Record<PlayerColor, string> = {
  'red': '#f44336',
  'yellow': '#ffeb3b',
  'blue': '#2196f3',
  'green': '#4caf50'
} as const;

type TeamNumber = 1 | 2;

/**
 * Gets the team number (1 or 2) for a given color
 * @param color - The color to check (can be name or hex code)
 * @returns The team number (1 or 2)
 * @throws Will throw an error if the color is not a valid player color
 */
export function getTeamByColor(color: string): TeamNumber {
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
export function normalizeColor(color: string): PlayerColor | undefined {
  if (!color) return undefined;
  
  const lowerColor = color.toLowerCase().trim();
  
  // First try direct match with PLAYER_COLORS
  const directMatch = PLAYER_COLORS.find(c => c === lowerColor);
  if (directMatch) return directMatch;
  
  // Map of hex codes to color names
  const hexToColorMap: Record<string, PlayerColor> = {
    '#f44336': 'red',
    '#ffeb3b': 'yellow',
    '#2196f3': 'blue',
    '#4caf50': 'green'
  };
  
  // Try to match hex code (case insensitive)
  return hexToColorMap[lowerColor];
}

/**
 * Gets the current player's color based on turn index
 * @param turnIndex - The current turn index
 * @returns The current player's color
 */
export function getCurrentPlayerColor(turnIndex: number): PlayerColor {
  return TURN_ORDER[turnIndex % TURN_ORDER.length];
}

export const DEFAULT_GAME_ID = 'default';

// Initial board setup - matches the reset-board.ts configuration
export const INITIAL_BASE_POINTS = [
  // Yellow pieces (top)
  { id: 1, x: 7, y: 0, userId: 'system', color: '#FFEB3B', pieceType: 'queen', team: 1, createdAtMs: Date.now() },
  { id: 2, x: 8, y: 0, userId: 'system', color: '#FFEB3B', pieceType: 'bishop', team: 1, createdAtMs: Date.now() },
  { id: 3, x: 6, y: 0, userId: 'system', color: '#FFEB3B', pieceType: 'king', team: 1, createdAtMs: Date.now() },
  { id: 4, x: 5, y: 0, userId: 'system', color: '#FFEB3B', pieceType: 'bishop', team: 1, createdAtMs: Date.now() },
  { id: 5, x: 4, y: 0, userId: 'system', color: '#FFEB3B', pieceType: 'knight', team: 1, createdAtMs: Date.now() },
  { id: 6, x: 9, y: 0, userId: 'system', color: '#FFEB3B', pieceType: 'knight', team: 1, createdAtMs: Date.now() },
  { id: 7, x: 3, y: 0, userId: 'system', color: '#FFEB3B', pieceType: 'rook', team: 1, createdAtMs: Date.now() },
  { id: 8, x: 10, y: 0, userId: 'system', color: '#FFEB3B', pieceType: 'rook', team: 1, createdAtMs: Date.now() },
  { id: 9, x: 7, y: 1, userId: 'system', color: '#FFEB3B', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
  { id: 10, x: 6, y: 1, userId: 'system', color: '#FFEB3B', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
  { id: 11, x: 8, y: 1, userId: 'system', color: '#FFEB3B', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
  { id: 12, x: 5, y: 1, userId: 'system', color: '#FFEB3B', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
  { id: 13, x: 4, y: 1, userId: 'system', color: '#FFEB3B', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
  { id: 14, x: 9, y: 1, userId: 'system', color: '#FFEB3B', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
  { id: 15, x: 3, y: 1, userId: 'system', color: '#FFEB3B', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
  { id: 16, x: 10, y: 1, userId: 'system', color: '#FFEB3B', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
  
  // Red pieces (bottom)
  { id: 17, x: 6, y: 13, userId: 'system', color: '#F44336', pieceType: 'queen', team: 1, createdAtMs: Date.now() },
  { id: 18, x: 5, y: 13, userId: 'system', color: '#F44336', pieceType: 'bishop', team: 1, createdAtMs: Date.now() },
  { id: 19, x: 7, y: 13, userId: 'system', color: '#F44336', pieceType: 'king', team: 1, createdAtMs: Date.now() },
  { id: 20, x: 8, y: 13, userId: 'system', color: '#F44336', pieceType: 'bishop', team: 1, createdAtMs: Date.now() },
  { id: 21, x: 4, y: 13, userId: 'system', color: '#F44336', pieceType: 'knight', team: 1, createdAtMs: Date.now() },
  { id: 22, x: 9, y: 13, userId: 'system', color: '#F44336', pieceType: 'knight', team: 1, createdAtMs: Date.now() },
  { id: 23, x: 3, y: 13, userId: 'system', color: '#F44336', pieceType: 'rook', team: 1, createdAtMs: Date.now() },
  { id: 24, x: 10, y: 13, userId: 'system', color: '#F44336', pieceType: 'rook', team: 1, createdAtMs: Date.now() },
  { id: 25, x: 6, y: 12, userId: 'system', color: '#F44336', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
  { id: 26, x: 7, y: 12, userId: 'system', color: '#F44336', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
  { id: 27, x: 5, y: 12, userId: 'system', color: '#F44336', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
  { id: 28, x: 8, y: 12, userId: 'system', color: '#F44336', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
  { id: 29, x: 4, y: 12, userId: 'system', color: '#F44336', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
  { id: 30, x: 9, y: 12, userId: 'system', color: '#F44336', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
  { id: 31, x: 3, y: 12, userId: 'system', color: '#F44336', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
  { id: 32, x: 10, y: 12, userId: 'system', color: '#F44336', pieceType: 'pawn', team: 1, createdAtMs: Date.now() },
  
  // Blue pieces (left)
  { id: 33, x: 0, y: 6, userId: 'system', color: '#2196F3', pieceType: 'queen', team: 2, createdAtMs: Date.now() },
  { id: 34, x: 0, y: 5, userId: 'system', color: '#2196F3', pieceType: 'bishop', team: 2, createdAtMs: Date.now() },
  { id: 35, x: 0, y: 7, userId: 'system', color: '#2196F3', pieceType: 'king', team: 2, createdAtMs: Date.now() },
  { id: 36, x: 0, y: 8, userId: 'system', color: '#2196F3', pieceType: 'bishop', team: 2, createdAtMs: Date.now() },
  { id: 37, x: 0, y: 4, userId: 'system', color: '#2196F3', pieceType: 'knight', team: 2, createdAtMs: Date.now() },
  { id: 38, x: 0, y: 9, userId: 'system', color: '#2196F3', pieceType: 'knight', team: 2, createdAtMs: Date.now() },
  { id: 39, x: 0, y: 3, userId: 'system', color: '#2196F3', pieceType: 'rook', team: 2, createdAtMs: Date.now() },
  { id: 40, x: 0, y: 10, userId: 'system', color: '#2196F3', pieceType: 'rook', team: 2, createdAtMs: Date.now() },
  { id: 41, x: 1, y: 6, userId: 'system', color: '#2196F3', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
  { id: 42, x: 1, y: 7, userId: 'system', color: '#2196F3', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
  { id: 43, x: 1, y: 5, userId: 'system', color: '#2196F3', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
  { id: 44, x: 1, y: 8, userId: 'system', color: '#2196F3', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
  { id: 45, x: 1, y: 4, userId: 'system', color: '#2196F3', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
  { id: 46, x: 1, y: 9, userId: 'system', color: '#2196F3', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
  { id: 47, x: 1, y: 3, userId: 'system', color: '#2196F3', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
  { id: 48, x: 1, y: 10, userId: 'system', color: '#2196F3', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
  
  // Green pieces (right)
  { id: 49, x: 13, y: 7, userId: 'system', color: '#4CAF50', pieceType: 'queen', team: 2, createdAtMs: Date.now() },
  { id: 50, x: 13, y: 8, userId: 'system', color: '#4CAF50', pieceType: 'bishop', team: 2, createdAtMs: Date.now() },
  { id: 51, x: 13, y: 6, userId: 'system', color: '#4CAF50', pieceType: 'king', team: 2, createdAtMs: Date.now() },
  { id: 52, x: 13, y: 5, userId: 'system', color: '#4CAF50', pieceType: 'bishop', team: 2, createdAtMs: Date.now() },
  { id: 53, x: 13, y: 4, userId: 'system', color: '#4CAF50', pieceType: 'knight', team: 2, createdAtMs: Date.now() },
  { id: 54, x: 13, y: 9, userId: 'system', color: '#4CAF50', pieceType: 'knight', team: 2, createdAtMs: Date.now() },
  { id: 55, x: 13, y: 3, userId: 'system', color: '#4CAF50', pieceType: 'rook', team: 2, createdAtMs: Date.now() },
  { id: 56, x: 13, y: 10, userId: 'system', color: '#4CAF50', pieceType: 'rook', team: 2, createdAtMs: Date.now() },
  { id: 57, x: 12, y: 7, userId: 'system', color: '#4CAF50', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
  { id: 58, x: 12, y: 6, userId: 'system', color: '#4CAF50', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
  { id: 59, x: 12, y: 8, userId: 'system', color: '#4CAF50', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
  { id: 60, x: 12, y: 5, userId: 'system', color: '#4CAF50', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
  { id: 61, x: 12, y: 4, userId: 'system', color: '#4CAF50', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
  { id: 62, x: 12, y: 9, userId: 'system', color: '#4CAF50', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
  { id: 63, x: 12, y: 3, userId: 'system', color: '#4CAF50', pieceType: 'pawn', team: 2, createdAtMs: Date.now() },
  { id: 64, x: 12, y: 10, userId: 'system', color: '#4CAF50', pieceType: 'pawn', team: 2, createdAtMs: Date.now() }
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
