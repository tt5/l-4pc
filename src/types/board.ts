import { ApiResponse } from "~/utils/api";

// Core types
declare const brand: unique symbol;
type Brand<T, B> = T & { [brand]: B };

// Simple tuple type for better compatibility with spread operators
export type Point = [number, number];

export function createPoint(x: number, y: number): Point {
  return [x, y] as Point;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

export interface BasePoint {
  id: number;
  x: number;
  y: number;
  userId: string;
  color: string; // CSS color value
  pieceType: PieceType;
  createdAtMs: number;
}

export interface Item {
  id: number;
  data: string;
  created_at: string;
  created_at_ms: number;
  userId: string;
}

export type RestrictedSquares = number[];

export interface BoardConfig {
  readonly GRID_SIZE: number;
  readonly DEFAULT_POSITION: Point;
  readonly DIRECTION_MAP: {
    readonly [key: string]: Direction;
    readonly ArrowUp: Direction;
    readonly ArrowDown: Direction;
    readonly ArrowLeft: Direction;
    readonly ArrowRight: Direction;
  };
  readonly BUTTONS: readonly {
    readonly label: string;
    readonly className: string;
  }[];
  readonly DIRECTIONS: readonly {
    readonly key: Direction;
    readonly label: string;
  }[];
}

export interface AddBasePointResponse extends ApiResponse<BasePoint> {}

// Game state types
export interface Move {
  id: number;
  basePointId: number;
  from: Point;
  to: Point;
  playerId: string;
  timestamp: number;
  color: string;
  // For backward compatibility, alias userId to playerId
  userId?: string;
}

export interface GameState {
  position: Point;
  direction: Direction | null;
  selectedSquares: number[];
  basePoints: BasePoint[];
  gridSize: number;
}
