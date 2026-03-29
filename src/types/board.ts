import { ApiResponse } from "~/utils/api";

export type Point = [number, number] & { readonly __brand: 'Point' };
export function createPoint(x: number, y: number): Point {
  return [x, y] as Point;
}

export type SquareIndex = number & { readonly __brand: 'SquareIndex' };
export type RestrictedSquares = SquareIndex[];

export type Direction = 'up' | 'down' | 'left' | 'right';

export type PieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

export type NamedColor = 'RED' | 'BLUE' | 'YELLOW' | 'GREEN'
export type HexColor = '#F44336' | '#2196F3' | '#FFEB3B' | '#4CAF50'
export type Color = NamedColor | HexColor

export interface BasePoint {
  readonly id: number;
  x: number;
  y: number;
  color: NamedColor;
  pieceType: PieceType;
  team: 1 | 2; // 1 for team 1 (red/yellow), 2 for team 2 (blue/green)
  hasMoved?: boolean; // Tracks if the piece has moved from its starting position
  isCastle?: boolean; // Indicates if this is a castling move
  castleType?: 'KING_SIDE' | 'QUEEN_SIDE' | null; // Type of castling (king-side or queen-side)
}

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

export interface RestrictedByInfo {
  basePointId: number;
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
  pieceType?: PieceType;
  team?: 1 | 2;
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
  color: HexColor;
  branchName: string;
  parentBranchName: string | null;
  moveNumber: number;
  isCastle: boolean;
  castleType: 'KING_SIDE' | 'QUEEN_SIDE' | null;
  isBranch: boolean;
  isEnPassant: boolean;
  capturedPiece?: CapturedPiece;
  capturedPieceId?: number | null;
}

export interface ApiMove {
  id: string;
  gameId: string;
  userId: string;
  pieceType: PieceType;
  color: HexColor;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  moveNumber: number;
  capturedPieceId: number | null;
  createdAtMs: number;
  isBranch: boolean;
  branchName: string;
}
      

export interface BoardProps {
  gameId?: string;
}

interface CapturedPiece {
    x: number;
    y: number;
    color: NamedColor;
    pieceType: PieceType;
}

export interface MoveResult extends LegalMove{
  rookX?: number;
  rookY?: number;
  rookNewX?: number;
  rookNewY?: number;
  dx?: number;
  dy?: number;
}

export interface LegalMove {
  x: number;
  y: number;
  canCapture: boolean;
  isCastle?: boolean;
  castleType?: 'KING_SIDE' | 'QUEEN_SIDE' | null;
  isEnPassant?: boolean;
  capturedPiece?: CapturedPiece;
}

export type BranchPoints = Record<number, Array<{
  branchName: string;
  parentBranch: string;
  firstMove: SimpleMove;
}>>;


