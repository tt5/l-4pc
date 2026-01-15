import { BasePoint } from '../types/board';

type Move = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  pieceType?: string;
  color?: string;
  isCapture?: boolean;
  isCheck?: boolean;
  promotionPiece?: string;
  capturedPiece?: any;
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
  const { fromX, fromY, toX, toY, pieceType = 'pawn', color, isCapture = false, isCheck = false, promotionPiece } = move;
  
  // Get the moving piece's color prefix (r, b, y, g)
  let colorPrefix = '';
  if (color) {
    const colorLower = color.toLowerCase();
    if (colorLower.includes('red')) colorPrefix = 'r';
    else if (colorLower.includes('blue')) colorPrefix = 'b';
    else if (colorLower.includes('yellow')) colorPrefix = 'y';
    else if (colorLower.includes('green')) colorPrefix = 'g';
  } else {
    // Fallback to finding the piece in basePoints
    const piece = basePoints.find(p => p.x === fromX && p.y === fromY);
    if (piece) {
      const pieceColor = piece.color.toLowerCase();
      if (pieceColor.includes('red')) colorPrefix = 'r';
      else if (pieceColor.includes('blue')) colorPrefix = 'b';
      else if (pieceColor.includes('yellow')) colorPrefix = 'y';
      else if (pieceColor.includes('green')) colorPrefix = 'g';
    }
  }
  
  // Get the piece notation (empty string for pawns)
  const pieceNotation = pieceType ? (PIECE_NOTATION[pieceType.toLowerCase()] || '') : '';
  
  // Get the target square
  const targetSquare = `${getFile(toX)}${getRank(toY)}`;
  
  // Handle captures
  const captureNotation = isCapture || move.capturedPiece ? 'x' : '';
  
  // Handle promotion
  const promotionNotation = promotionPiece ? `=${PIECE_NOTATION[promotionPiece.toLowerCase()] || promotionPiece}` : '';
  
  // Handle check/checkmate
  const checkNotation = isCheck ? '+' : '';
  
  // Build the move string
  return `${colorPrefix}${pieceNotation}${captureNotation}${targetSquare}${promotionNotation}${checkNotation}`;
};

// Format a move for display in the move history
export const formatMove = (move: Move, basePoints: BasePoint[] = []): string => {
  try {
    // If we have enough information, format with chess notation
    if (move.pieceType || (move.fromX !== undefined && move.fromY !== undefined)) {
      return toChessNotation(move, basePoints);
    }
    // Fall back to coordinate notation
    return `(${move.fromX},${move.fromY}) → (${move.toX},${move.toY})`;
  } catch (error) {
    console.error('Error formatting move:', error, move);
    return `(${move.fromX},${move.fromY}) → (${move.toX},${move.toY})`;
  }
};
