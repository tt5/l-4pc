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

// Convert y coordinate to rank (1-14 with 1 at bottom, 14 at top)
const getRank = (y: number): string => (14 - y).toString();

// Convert coordinates to 4-player chess notation (a1-p16)
export const toChessNotation = (move: Move, basePoints: BasePoint[] = []): string => {
  console.log('toChessNotation - Input move:', JSON.stringify(move, null, 2));
  console.log('toChessNotation - basePoints:', basePoints);
  
  const { fromX, fromY, toX, toY, pieceType = 'pawn', color, isCapture = false, isCheck = false, promotionPiece } = move;
  
  // Get the moving piece's color prefix (r, b, y, g)
  let colorPrefix = '';
  if (color) {
    const colorLower = color.toLowerCase();
    console.log('toChessNotation - Processing color:', colorLower);
    
    if (colorLower.includes('red') || colorLower === '#f44336') colorPrefix = 'r';
    else if (colorLower.includes('blue') || colorLower === '#2196f3') colorPrefix = 'b';
    else if (colorLower.includes('yellow') || colorLower === '#ffeb3b') colorPrefix = 'y';
    else if (colorLower.includes('green') || colorLower === '#4caf50') colorPrefix = 'g';
    
    console.log('toChessNotation - Determined color prefix from color:', colorPrefix);
  } else {
    console.log('toChessNotation - No color provided, looking in basePoints');
    // Fallback to finding the piece in basePoints
    const piece = basePoints.find(p => p.x === fromX && p.y === fromY);
    console.log('toChessNotation - Found piece in basePoints:', piece);
    
    if (piece && piece.color) {
      const pieceColor = piece.color.toLowerCase();
      console.log('toChessNotation - Piece color:', pieceColor);
      
      if (pieceColor.includes('red') || pieceColor === '#f44336') colorPrefix = 'r';
      else if (pieceColor.includes('blue') || pieceColor === '#2196f3') colorPrefix = 'b';
      else if (pieceColor.includes('yellow') || pieceColor === '#ffeb3b') colorPrefix = 'y';
      else if (pieceColor.includes('green') || pieceColor === '#4caf50') colorPrefix = 'g';
      
      console.log('toChessNotation - Determined color prefix from piece:', colorPrefix);
    }
  }
  
  // Determine piece notation
  let pieceNotation = '';
  if (pieceType) {
    pieceNotation = PIECE_NOTATION[pieceType.toLowerCase()] || '';
  } else {
    // Default to pawn if piece type is missing
    pieceNotation = '';
  }
  console.log('toChessNotation - Piece notation:', pieceNotation, 'for type:', pieceType);
  
  // Get the target square
  const targetSquare = `${getFile(toX)}${getRank(toY)}`;
  console.log('toChessNotation - Target square:', targetSquare);
  
  // Handle captures
  const isActualCapture = isCapture || !!move.capturedPiece;
  const captureNotation = isActualCapture ? 'x' : '';
  console.log('toChessNotation - Is capture:', isActualCapture);
  
  // Handle promotion
  const promotionNotation = promotionPiece ? `=${PIECE_NOTATION[promotionPiece.toLowerCase()] || promotionPiece}` : '';
  console.log('toChessNotation - Promotion:', promotionNotation);
  
  // Handle check/checkmate
  const checkNotation = isCheck ? '+' : '';
  console.log('toChessNotation - Is check:', isCheck);
  
  // Determine color prefix if not already set
  let finalColorPrefix = colorPrefix;
  if (!finalColorPrefix) {
    // Try to determine color from position if not set
    if (fromY < 3) finalColorPrefix = 'r'; // Red starts at bottom
    else if (fromX > 10) finalColorPrefix = 'b'; // Blue starts at right
    else if (fromY > 10) finalColorPrefix = 'y'; // Yellow starts at top
    else if (fromX < 3) finalColorPrefix = 'g'; // Green starts at left
    console.log('toChessNotation - Determined color from position:', finalColorPrefix);
  }
  
  // Build the move string - always include color prefix and piece notation
  const moveString = `${finalColorPrefix}${pieceNotation}${captureNotation}${targetSquare}${promotionNotation}${checkNotation}`;
  console.log('toChessNotation - Final move string:', moveString);
  
  return moveString;
};

// Format a move for display in the move history
export const formatMove = (move: Move, basePoints: BasePoint[] = []): string => {
  try {
    // If we have coordinates, try to format with chess notation
    if (move.fromX !== undefined && move.fromY !== undefined) {
      // If pieceType is missing, try to find it in basePoints
      if (!move.pieceType && basePoints.length > 0) {
        const piece = basePoints.find(p => 
          p.x === move.fromX && 
          p.y === move.fromY
        );
        
        if (piece) {
          return toChessNotation({
            ...move,
            pieceType: piece.pieceType,
            color: piece.color
          }, basePoints);
        }
      }
      
      // If we still don't have pieceType, use a default
      if (!move.pieceType) {
        return toChessNotation({
          ...move,
          pieceType: 'pawn' // Default to pawn if we can't determine the piece type
        }, basePoints);
      }
      
      return toChessNotation(move, basePoints);
    }
    // Fall back to coordinate notation
    return `(${move.fromX},${move.fromY}) → (${move.toX},${move.toY})`;
  } catch (error) {
    console.error('Error formatting move:', error, move);
    return `(${move.fromX},${move.fromY}) → (${move.toX},${move.toY})`;
  }
};
