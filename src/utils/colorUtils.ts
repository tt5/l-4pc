import { PlayerColor } from '~/constants/game';

type ColorMap = Record<PlayerColor, string>;

export const COLOR_MAP: ColorMap = {
  'RED': '#F44336',
  'BLUE': '#2196F3',
  'YELLOW': '#FFEB3B',
  'GREEN': '#4CAF50'
} as const;

export function getColorHex(color: string): string {
  if (!color) return '';
  const normalizedColor = color.toUpperCase() as PlayerColor;
  return COLOR_MAP[normalizedColor] || color;
}

export function isPlayerColor(color: string): color is PlayerColor {
  return Object.keys(COLOR_MAP).includes(color.toUpperCase());
}
