// Color mapping for consistent color handling across the game
export const COLOR_MAP: Record<string, string> = {
  'red': '#f44336',
  'blue': '#2196f3',
  'yellow': '#ffeb3b',
  'green': '#4caf50'
};

/**
 * Normalizes color input to handle different color formats
 * @param color - The color to normalize (can be color name or hex value)
 * @returns The normalized color in hex format
 */
export function normalizeColor(color: string): string {
  if (!color) return '';
  const lowerColor = color.toLowerCase();
  return COLOR_MAP[lowerColor] || color;
}

/**
 * Gets the current player's color based on the turn index
 * @param turnIndex - The current turn index
 * @returns The color of the current player
 */
export function getCurrentPlayerColor(turnIndex: number, playerColors: string[]): string {
  return playerColors[turnIndex % playerColors.length];
}
