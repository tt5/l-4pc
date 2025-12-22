import type { PieceType } from './board';

export interface RestrictedByInfo {
  basePointId: string;
  basePointX: number;
  basePointY: number;
}

export interface RestrictedSquareInfo {
  index: number;
  x: number;
  y: number;
  canCapture?: boolean;
  originX?: number;
  originY?: number;
  pieceType?: string;
  team?: number;
  restrictedBy: RestrictedByInfo[];
}

export interface Move {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  pieceType: PieceType;
  id: string;
  branchName?: string;
  moveNumber: number;
  isCastle?: boolean;
  castleType?: string;
}

export interface BoardProps {
  gameId?: string;
}

export interface Direction {
  dx: number;
  dy: number;
}

export interface MoveResult {
  x: number;
  y: number;
  canCapture: boolean;
  isCastle?: boolean;
  castleType?: string;
  rookX?: number;
  rookY?: number;
  rookNewX?: number;
  rookNewY?: number;
  dx?: number;
  dy?: number;
}
