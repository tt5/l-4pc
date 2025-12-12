import { createPoint } from '../types/board';

export const PLAYER_COLORS = ['red', 'blue', 'yellow', 'green'] as const;

export type PlayerColor = typeof PLAYER_COLORS[number];

export const TURN_ORDER = PLAYER_COLORS;

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
