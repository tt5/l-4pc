import { PlayerColor } from '~/constants/game';

type ColorMap = Record<PlayerColor, string>;

export const COLOR_MAP: ColorMap = {
  'red': '#f44336',
  'blue': '#2196f3',
  'yellow': '#ffeb3b',
  'green': '#4caf50'
} as const;

export function getColorHex(color: string): string {
  if (!color) return '';
  const normalizedColor = color.toLowerCase() as PlayerColor;
  return COLOR_MAP[normalizedColor] || color;
}

export function isPlayerColor(color: string): color is PlayerColor {
  return Object.keys(COLOR_MAP).includes(color.toLowerCase());
}
