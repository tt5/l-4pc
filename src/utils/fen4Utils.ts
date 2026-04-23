// src/utils/fen4Utils.ts
import type { BasePoint, Color, NamedColor, PieceType } from '~/types/board';

const PIECE_TO_FEN: Record<string, string> = {
  pawn: 'P',
  knight: 'N',
  bishop: 'B',
  rook: 'R',
  queen: 'Q',
  king: 'K'
} as const;

const FEN_TO_PIECE: Record<string, PieceType> = {
  'P': 'pawn',
  'N': 'knight',
  'B': 'bishop',
  'R': 'rook',
  'Q': 'queen',
  'K': 'king'
} as const;

const COLOR_TO_PREFIX: Record<string, string> = {
  red: 'r',
  blue: 'b',
  yellow: 'y',
  green: 'g'
} as const;

const PREFIX_TO_COLOR: Record<string, string> = {
  'r': 'RED',
  'b': 'BLUE',
  'y': 'YELLOW',
  'g': 'GREEN'
} as const;

export const generateFen4 = (
  basePoints: BasePoint[],
  currentPlayerIndex: number
): string => {
  const playerColors = ['R', 'B', 'Y', 'G'];
  const currentPlayer = playerColors[currentPlayerIndex] || 'R';
  const eliminatedPlayers = '0,0,0,0';
  const kingsideCastling = '1,1,1,1';
  const queensideCastling = '1,1,1,1';
  const points = '0,0,0,0';
  const halfmoveClock = '0';
  
  // Initialize 14x14 board with empty strings
  const board = Array(14).fill(null).map(() => Array(14).fill(''));
  
  // Place pieces on the board
  basePoints.forEach(point => {
    const { x, y, pieceType, color } = point;
    if (x >= 0 && x < 14 && y >= 0 && y < 14) {
      const colorPrefix = COLOR_TO_PREFIX[color] || 'r';
      const pieceChar = PIECE_TO_FEN[pieceType] || 'P';
      board[y][x] = `${colorPrefix}${pieceChar}`;
    }
  });
  
  // Convert board to FEN4 notation
  const fenRows = board.map(row => {
    const rowPieces: string[] = [];
    let emptyCount = 0;
    
    for (const square of row) {
      if (square === '') {
        emptyCount++;
      } else {
        if (emptyCount > 0) {
          rowPieces.push(emptyCount.toString());
          emptyCount = 0;
        }
        rowPieces.push(square);
      }
    }
    
    // Add any remaining empty squares
    if (emptyCount > 0) {
      rowPieces.push(emptyCount.toString());
    }
    
    return rowPieces.join(',');
  });
  
  // Combine all FEN4 parts
  return [
    currentPlayer,
    eliminatedPlayers,
    kingsideCastling,
    queensideCastling,
    points,
    halfmoveClock,
    fenRows.join('/')
  ].join('-');
};

export const parseFen4 = (fen4: string): {
  basePoints: BasePoint[];
  currentPlayerIndex: number;
} => {
  const parts = fen4.split('-');
  if (parts.length !== 7) {
    throw new Error('Invalid FEN4 string: Must have 7 parts separated by hyphens');
  }

  const [currentPlayer, , , , , , piecePlacement] = parts;
  const playerIndex = ['R', 'B', 'Y', 'G'].indexOf(currentPlayer);
  if (playerIndex === -1) {
    throw new Error('Invalid current player in FEN4');
  }

  const basePoints: BasePoint[] = [];
  const rows = piecePlacement.split('/');
  
  if (rows.length !== 14) {
    throw new Error('Invalid FEN4: Must have exactly 14 ranks');
  }

  let idCounter = 1; // Start from 1 to match game.ts
  rows.forEach((row, y) => {
    let x = 0;
    const elements = row.split(',');
    
    for (const element of elements) {
      if (element === '') continue;
      
      // Handle empty squares
      const emptySquares = parseInt(element, 10);
      if (!isNaN(emptySquares)) {
        x += emptySquares;
        continue;
      }
      
      // Handle pieces
      const colorPrefix = element[0].toLowerCase();
      const pieceCode = element[1]?.toUpperCase() || 'P';
      
      const color = PREFIX_TO_COLOR[colorPrefix] as NamedColor;
      const pieceType = FEN_TO_PIECE[pieceCode] || 'pawn';
      const team = ['r', 'y'].includes(colorPrefix) ? 1 : 2;
      
      if (x < 14) {  // Ensure we don't go beyond the board width
        basePoints.push({
          id: idCounter++,
          x,
          y,
          color,
          pieceType,
          team,
          hasMoved: false,
          isCastle: false,
          castleType: null
        });
      }
      
      x++;
    }
  });

  return {
    basePoints,
    currentPlayerIndex: playerIndex
  };
};

// Add this to src/utils/fen4Utils.ts

const STARTING_FEN4 = 'R-0,0,0,0-1,1,1,1-1,1,1,1-0,0,0,0-0-3,yR,yN,yB,yK,yQ,yB,yN,yR,3/3,yP,yP,yP,yP,yP,yP,yP,yP,3/14/bR,bP,10,gP,gR/bN,bP,10,gP,gN/bB,bP,10,gP,gB/bK,bP,10,gP,gQ/bQ,bP,10,gP,gK/bB,bP,10,gP,gB/bN,bP,10,gP,gN/bR,bP,10,gP,gR/14/3,rP,rP,rP,rP,rP,rP,rP,rP,3/3,rR,rN,rB,rQ,rK,rB,rN,rR,3';

interface SimpleMove {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

/**
 * Applies a move to the basePoints array
 * @param basePoints - Current board state
 * @param move - Move to apply
 * @returns Updated basePoints
 */
const applyMove = (basePoints: BasePoint[], move: SimpleMove): BasePoint[] => {
  const { fromX, fromY, toX, toY } = move;
  
  // Find the piece being moved
  const movingPieceIndex = basePoints.findIndex(p => p.x === fromX && p.y === fromY);
  if (movingPieceIndex === -1) {
    throw new Error(`No piece found at position (${fromX}, ${fromY})`);
  }
  
  const movingPiece = basePoints[movingPieceIndex];
  
  // Check if there's a piece at the destination (capture)
  const capturedPieceIndex = basePoints.findIndex(p => p.x === toX && p.y === toY);
  
  // Create a new array with the move applied
  const newBasePoints = basePoints.map((point, index) => {
    if (index === movingPieceIndex) {
      // Update the moving piece's position
      return {
        ...point,
        x: toX,
        y: toY,
        hasMoved: true
      };
    }
    // Remove captured piece (if any)
    if (index === capturedPieceIndex) {
      return null;
    }
    return point;
  }).filter((point): point is BasePoint => point !== null);
  
  return newBasePoints;
};

/**
 * Creates a FEN4 string from a list of moves starting from the initial position
 * @param moves - Array of moves to apply
 * @returns FEN4 string representing the position after all moves
 */
export const fen4FromMoves = (moves: SimpleMove[]): string => {
  // Parse the starting position
  const { basePoints, currentPlayerIndex } = parseFen4(STARTING_FEN4);
  
  // Apply each move sequentially
  let currentBasePoints = [...basePoints];
  let currentPlayerIdx = currentPlayerIndex;
  
  for (const move of moves) {
    currentBasePoints = applyMove(currentBasePoints, move);
    // Alternate to next player (R -> B -> Y -> G -> R)
    currentPlayerIdx = (currentPlayerIdx + 1) % 4;
  }
  
  // Generate the final FEN4
  return generateFen4(currentBasePoints, currentPlayerIdx);
};