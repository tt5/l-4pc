import { createPoint } from '../types/board';

export const PLAYER_COLORS = ['red', 'blue', 'yellow', 'green'] as const;

export type PlayerColor = typeof PLAYER_COLORS[number];

export const TURN_ORDER = PLAYER_COLORS;

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
