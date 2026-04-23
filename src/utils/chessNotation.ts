
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

import type { BranchPoints } from '../types/board';

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
  '#F44336': 'r', // red
  '#2196F3': 'b', // blue
  '#FFEB3B': 'y', // yellow
  '#4CAF50': 'g'  // green
};

// Convert x coordinate to file (a-p)
const getFile = (x: number): string => String.fromCharCode(97 + x);

// Convert y coordinate to rank (1-14 with 1 at bottom, 14 at top)
const getRank = (y: number): string => (14 - y).toString();

// Convert coordinates to 4-player chess notation (a1-p16)
export const toChessNotation = (move: Move): string => {
  
  const { fromX, fromY, toX, toY, pieceType = 'pawn', color, isCapture = false, isCheck = false, promotionPiece } = move;
  
  // Get the moving piece's color prefix (r, b, y, g)
  let colorPrefix = '';
  if (color) {
    const colorUpper = color.toUpperCase();
    
    if (colorUpper.includes('red') || colorUpper === '#F44336') colorPrefix = 'r';
    else if (colorUpper.includes('blue') || colorUpper === '#2196F3') colorPrefix = 'b';
    else if (colorUpper.includes('yellow') || colorUpper === '#FFEB3B') colorPrefix = 'y';
    else if (colorUpper.includes('green') || colorUpper === '#4CAF50') colorPrefix = 'g';
    
  }  

  // Determine piece notation
  let pieceNotation = '';
  if (pieceType) {
    pieceNotation = PIECE_NOTATION[pieceType] || '';
  } else {
    // Default to pawn if piece type is missing
    pieceNotation = '';
  }
  
  // Get the source and target squares for long algebraic notation
  const sourceSquare = `${getFile(fromX)}${getRank(fromY)}`;
  const targetSquare = `${getFile(toX)}${getRank(toY)}`;
  
  // Handle captures
  const isActualCapture = isCapture || !!move.capturedPiece;
  const captureNotation = isActualCapture ? 'x' : '';
  
  // Handle promotion
  const promotionNotation = promotionPiece ? `=${PIECE_NOTATION[promotionPiece.toLowerCase()] || promotionPiece}` : '';
  
  // Handle check/checkmate
  const checkNotation = isCheck ? '+' : '';
  
  // Determine color prefix if not already set
  let finalColorPrefix = colorPrefix;
  if (!finalColorPrefix) {
    // Try to determine color from position if not set
    if (fromY < 3) finalColorPrefix = 'r'; // Red starts at bottom
    else if (fromX > 10) finalColorPrefix = 'b'; // Blue starts at right
    else if (fromY > 10) finalColorPrefix = 'y'; // Yellow starts at top
    else if (fromX < 3) finalColorPrefix = 'g'; // Green starts at left
  }
  
  // Build the move string using PGN4 long algebraic notation: color+piece+fromSquare+capture+toSquare+promotion+check
  const moveString = `${finalColorPrefix}${pieceNotation}${sourceSquare}${captureNotation}${targetSquare}${promotionNotation}${checkNotation}`;
  
  return moveString;
};

// Format a move for display in the move history
export const formatMove = (move: Move): string => {
  try {
    // If we have coordinates, try to format with chess notation
    if (move.fromX !== undefined && move.fromY !== undefined) {
      
      return toChessNotation(move);
    }
    // Fall back to coordinate notation
    return `(${move.fromX},${move.fromY}) → (${move.toX},${move.toY})`;
  } catch (error) {
    console.error('Error formatting move:', error, move);
    return `(${move.fromX},${move.fromY}) → (${move.toX},${move.toY})`;
  }
};

// Convert a move to PGN4 long algebraic notation (without color prefix)
const toPgn4Notation = (move: Move): string => {
  const { fromX, fromY, toX, toY, pieceType = 'pawn', isCapture = false, isCheck = false, promotionPiece } = move;
  
  // Determine piece notation
  let pieceNotation = '';
  if (pieceType) {
    pieceNotation = PIECE_NOTATION[pieceType] || '';
  } else {
    pieceNotation = '';
  }
  
  // Get the source and target squares
  const sourceSquare = `${getFile(fromX)}${getRank(fromY)}`;
  const targetSquare = `${getFile(toX)}${getRank(toY)}`;
  
  // Handle captures
  const isActualCapture = isCapture || !!move.capturedPiece;
  const captureNotation = isActualCapture ? 'x' : '-';
  
  // Handle promotion
  const promotionNotation = promotionPiece ? `=${PIECE_NOTATION[promotionPiece.toLowerCase()] || promotionPiece}` : '';
  
  // Handle check/checkmate
  const checkNotation = isCheck ? '+' : '';
  
  // Build the move string using PGN4 long algebraic notation: piece+fromSquare+capture+toSquare+promotion+check
  const moveString = `${pieceNotation}${sourceSquare}${captureNotation}${targetSquare}${promotionNotation}${checkNotation}`;
  
  return moveString;
};

// Generate complete PGN4 from moves and branches
export const generatePgn4 = (moves: Move[], branchPoints?: BranchPoints): string => {
  const today = new Date().toISOString().split('T')[0];
  
  // Generate tag pairs
  const tags = [
    '[Variant "FFA"]',
    '[Red "Player1"]',
    '[Blue "Player2"]',
    '[Yellow "Player3"]',
    '[Green "Player4"]',
    '[Result "*"]',
    `[Date "${today}"]`,
    '[Site "4pc"]',
  ];
  
  // Generate movetext
  const movetext: string[] = [];
  let moveNumber = 1;
  
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    
    // Start a new move number every 4 moves (one full turn)
    if (i % 4 === 0) {
      movetext.push(`${moveNumber}.`);
    }
    
    // Format the main move
    const moveNotation = toPgn4Notation(move);
    movetext.push(moveNotation);
    
    // Add branches if they exist at this move index
    if (branchPoints && branchPoints[i] && branchPoints[i].length > 0) {
      const branchNotations = branchPoints[i].map(branch => {
        return toPgn4Notation(branch.firstMove);
      });
      if (branchNotations.length > 0) {
        movetext.push(`(${branchNotations.join(' ')})`);
      }
    }
    
    // Add separator between moves (two periods)
    if ((i + 1) % 4 !== 0 && i < moves.length - 1) {
      movetext.push('..');
    }
    
    // Increment move number after 4 moves
    if ((i + 1) % 4 === 0) {
      moveNumber++;
    }
  }
  
  // Combine tags and movetext
  return [...tags, '', movetext.join(' '), ''].join('\n');
};
