// src/utils/fen4Utils.ts
import type { BasePoint, PieceType } from '~/types/board';

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
  'r': 'red',
  'b': 'blue',
  'y': 'yellow',
  'g': 'green'
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
      const colorPrefix = COLOR_TO_PREFIX[color.toLowerCase()] || 'r';
      const pieceChar = PIECE_TO_FEN[pieceType.toLowerCase()] || 'P';
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
      
      const color = PREFIX_TO_COLOR[colorPrefix] || 'red';
      const pieceType = FEN_TO_PIECE[pieceCode] || 'pawn';
      const team = ['r', 'y'].includes(colorPrefix) ? 1 : 2;
      
      if (x < 14) {  // Ensure we don't go beyond the board width
        basePoints.push({
          id: Date.now() + Math.random(), // Generate a unique ID
          x,
          y,
          color,
          pieceType,
          userId: '',
          team,
          createdAtMs: Date.now(),
          hasMoved: false
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