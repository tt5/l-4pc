// src/utils/fen4Utils.ts
import { replayMoves } from './boardUtils';
import type { Move } from '../types/board';
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
 * Converts a UCI move string to SimpleMove coordinates
 * UCI format: 'a2a4' for ranks 1-9, 'a10a12' for ranks 10-14
 * where a=0, n=13 for files and 1-14 for ranks (inverted)
 * @param uci - UCI move string (e.g., 'a2a4' or 'a10a12')
 * @returns SimpleMove with coordinates
 */
const uciToSimpleMove = (uci: string): SimpleMove => {
  // Handle both 4-char (ranks 1-9) and 6-char (ranks 10-14) formats
  if (uci.length !== 4 && uci.length !== 6) {
    throw new Error(`Invalid UCI move: ${uci}. Must be 4 or 6 characters.`);
  }

  const fromFile = uci.charCodeAt(0) - 97; // 'a' = 0
  
  let fromRankStr: string;
  let toRankStr: string;
  let toFileOffset: number;

  if (uci.length === 4) {
    // Format: a2a4 (single digit ranks)
    fromRankStr = uci[1];
    toFileOffset = 2;
    toRankStr = uci[3];
  } else {
    // Format: a10a12 (double digit ranks)
    fromRankStr = uci.substring(1, 3);
    toFileOffset = 3;
    toRankStr = uci.substring(4, 6);
  }

  const fromRank = 14 - parseInt(fromRankStr, 10); // Rank 1 is at y=13
  const toFile = uci.charCodeAt(toFileOffset) - 97;
  const toRank = 14 - parseInt(toRankStr, 10);

  if (fromFile < 0 || fromFile > 13 || toFile < 0 || toFile > 13 ||
      fromRank < 0 || fromRank > 13 || toRank < 0 || toRank > 13) {
    throw new Error(`Invalid UCI move: ${uci}. Coordinates out of bounds.`);
  }

  return {
    fromX: fromFile,
    fromY: fromRank,
    toX: toFile,
    toY: toRank
  };
};

/**
 * Converts a UCI move string to a full Move object by looking up the piece
 * @param uci - UCI move string (e.g., 'a2a4')
 * @param basePoints - Current board state to look up piece info
 * @param moveNumber - The move number in the sequence
 * @returns Full Move object
 */
const uciToMove = (uci: string, basePoints: BasePoint[], moveNumber: number): Move => {
  const simpleMove = uciToSimpleMove(uci);
  const { fromX, fromY, toX, toY } = simpleMove;
  
  // Find the piece being moved
  const piece = basePoints.find(p => p.x === fromX && p.y === fromY);
  if (!piece) {
    throw new Error(`No piece found at position (${fromX}, ${fromY}) for UCI: ${uci}`);
  }
  
  // Convert NamedColor to HexColor
  const colorMap: Record<NamedColor, string> = {
    'RED': '#F44336',
    'BLUE': '#2196F3',
    'YELLOW': '#FFEB3B',
    'GREEN': '#4CAF50'
  };
  
  return {
    fromX,
    fromY,
    toX,
    toY,
    pieceType: piece.pieceType,
    id: `uci-${moveNumber}-${uci}`,
    color: colorMap[piece.color] as any,
    branchName: 'main',
    parentBranchName: null,
    moveNumber,
    isCastle: false,
    castleType: null,
    isBranch: false,
    isEnPassant: false
  };
};

/**
 * Applies a move to the basePoints array
 * @param basePoints - Current board state
 * @param move - Move to apply
 * @returns Updated basePoints
 */
const applySimpleMove = (basePoints: BasePoint[], move: SimpleMove): BasePoint[] => {
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
 * Creates a FEN4 string from a list of UCI moves starting from the initial position
 * @param uciMoves - Array of UCI move strings (e.g., ['a2a4', 'b2b4'])
 * @returns FEN4 string representing the position after all moves
 */
export const fen4FromMoves = (uciMoves: string[]): string => {
  // Parse the starting position
  const { basePoints, currentPlayerIndex } = parseFen4(STARTING_FEN4);
  
  // Convert UCI moves to full Move objects
  let currentBasePoints = [...basePoints];
  const moves: Move[] = [];
  
  for (let i = 0; i < uciMoves.length; i++) {
    const move = uciToMove(uciMoves[i], currentBasePoints, i);
    moves.push(move);
    currentBasePoints = applySimpleMove(currentBasePoints, move);
  }
  
  // Use replayMoves to get the final position
  const finalBasePoints = replayMoves(moves, moves.length - 1, basePoints);
  
  // Calculate final player index
  const currentPlayerIdx = (currentPlayerIndex + uciMoves.length) % 4;
  
  // Generate the final FEN4
  return generateFen4(finalBasePoints, currentPlayerIdx);
};