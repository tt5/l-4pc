import { PlayerColor } from '~/constants/game';
import { HexColor } from '~/types/board';

type ColorMap = Record<string, HexColor>;

export const COLOR_MAP: ColorMap = {
  'RED': '#F44336',
  'BLUE': '#2196F3',
  'YELLOW': '#FFEB3B',
  'GREEN': '#4CAF50',
  '#F44336': '#F44336',
  '#2196F3': '#2196F3',
  '#FFEB3B': '#FFEB3B',
  '#4CAF50': '#4CAF50'
} as const;

export function getColorHex(color: string | undefined): HexColor | undefined {
  if (!color) {
    return undefined
  }
  return COLOR_MAP[color];
}

export function isPlayerColor(color: string): color is PlayerColor {
  return Object.keys(COLOR_MAP).includes(color.toUpperCase());
}
