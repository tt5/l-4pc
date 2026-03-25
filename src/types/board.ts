import { ApiResponse } from "~/utils/api";

// Simple tuple type for better compatibility with spread operators
export type Point = [number, number];

//export type SquareIndex = number;
export type SquareIndex = number & { readonly __brand: 'SquareIndex' };


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
  team: 1 | 2; // 1 for team 1 (red/yellow), 2 for team 2 (blue/green)
  createdAtMs: number;
  hasMoved?: boolean; // Tracks if the piece has moved from its starting position
  isCastle?: boolean; // Indicates if this is a castling move
  castleType?: 'KING_SIDE' | 'QUEEN_SIDE' | null; // Type of castling (king-side or queen-side)
}

export type RestrictedSquares = SquareIndex[];

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

export interface GameState {
  position: Point;
  direction: Direction | null;
  selectedSquares: number[];
  basePoints: BasePoint[];
  gridSize: number;
}

export interface RestrictedByInfo {
  basePointId: string;
  basePointX: number;
  basePointY: number;
}

export interface RestrictedSquareInfo {
  index: SquareIndex;
  x: number;
  y: number;
  canCapture?: boolean;
  originX?: number;
  originY?: number;
  pieceType?: string;
  team?: number;
  restrictedBy: RestrictedByInfo[];
}

export interface SimpleMove {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export interface Move extends SimpleMove{
  pieceType: PieceType;
  id: string;
  basePointId?: string;
  timestamp?: number;
  playerId?: string;
  color?: string;
  branchName?: string;
  parentBranchName?: string | null;
  moveNumber: number;
  isCastle?: boolean;
  castleType?: 'KING_SIDE' | 'QUEEN_SIDE' | null;
  isBranch?: boolean;
  isEnPassant?: boolean;
  capturedPiece?: {
    x: number;
    y: number;
    color: string;
    pieceType: string;
  };
  capturedPieceId?: string | null;
  gameId?: string;
  userId?: string;
}

export interface BoardProps {
  gameId?: string;
}

export interface MoveResult {
  x: number;
  y: number;
  canCapture: boolean;
  isCastle?: boolean;
  castleType?: string;
  isEnPassant?: boolean;
  rookX?: number;
  rookY?: number;
  rookNewX?: number;
  rookNewY?: number;
  dx?: number;
  dy?: number;
  capturedPiece?: {
    x: number;
    y: number;
    color: string;
    pieceType: string;
  };
}

export type BranchPoints = Record<number, Array<{
  branchName: string;
  parentBranch: string;
  firstMove: SimpleMove;
}>>;


