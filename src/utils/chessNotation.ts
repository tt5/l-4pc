import { BasePoint } from '../types/board';

type Move = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  pieceType?: string;
  isCapture?: boolean;
  isCheck?: boolean;
  promotionPiece?: string;
};

// Map piece types to their algebraic notation letters
const PIECE_NOTATION: Record<string, string> = {
  king: 'K',
  queen: 'Q',
  rook: 'R',
  bishop: 'B',
  knight: 'N',
  pawn: ''
};

// Map colors to their prefixes
const COLOR_PREFIXES: Record<string, string> = {
  '#f44336': 'r', // red
  '#2196f3': 'b', // blue
  '#ffeb3b': 'y', // yellow
  '#4caf50': 'g'  // green
};

// Convert x coordinate to file (a-p)
const getFile = (x: number): string => String.fromCharCode(97 + x);

// Convert y coordinate to rank (1-16)
const getRank = (y: number): string => (y + 1).toString();

// Convert coordinates to 4-player chess notation (a1-p16)
export const toChessNotation = (move: Move, basePoints: BasePoint[] = []): string => {
  const { fromX, fromY, toX, toY, pieceType = 'pawn', isCapture = false, isCheck = false, promotionPiece } = move;
  
  // Get the moving piece's color
  const piece = basePoints.find(p => p.x === fromX && p.y === fromY);
  const colorPrefix = piece ? (COLOR_PREFIXES[piece.color.toLowerCase()] || '') : '';
  
  // Get the piece notation (empty string for pawns)
  const pieceNotation = PIECE_NOTATION[pieceType.toLowerCase()] || '';
  
  // Get the target square
  const targetSquare = `${getFile(toX)}${getRank(toY)}`;
  
  // Handle captures
  const captureNotation = isCapture ? 'x' : '';
  
  // Handle promotion
  const promotionNotation = promotionPiece ? `=${PIECE_NOTATION[promotionPiece.toLowerCase()]}` : '';
  
  // Handle check/checkmate
  const checkNotation = isCheck ? '+' : '';
  
  // Build the move string
  let moveString = `${colorPrefix}${pieceNotation}${captureNotation}${targetSquare}${promotionNotation}${checkNotation}`;
  
  return moveString;
};

// Format a move for display in the move history
export const formatMove = (move: Move, basePoints: BasePoint[] = []): string => {
  const { fromX, fromY, toX, toY } = move;
  
  // For now, fall back to coordinate notation if we can't determine the piece
  if (!move.pieceType) {
    return `(${fromX},${fromY}) → (${toX},${toY})`;
  }
  
  return toChessNotation(move, basePoints);
};
