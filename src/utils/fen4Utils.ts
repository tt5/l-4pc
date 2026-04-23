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

/**
 * Parses a square notation (e.g., 'a2', 'n14') to coordinates
 * Files: a-n (0-13), Ranks: 1-14 (inverted: rank 1 = y=13, rank 14 = y=0)
 * @param square - Square notation
 * @returns {x, y} coordinates
 */
const parseSquare = (square: string): { x: number; y: number } => {
  if (square.length < 2 || square.length > 3) {
    throw new Error(`Invalid square: ${square}`);
  }
  
  const file = square.charCodeAt(0) - 97; // 'a' = 0
  const rankStr = square.substring(1);
  const rank = parseInt(rankStr, 10);
  
  if (file < 0 || file > 13) {
    throw new Error(`Invalid file in square: ${square}`);
  }
  if (rank < 1 || rank > 14) {
    throw new Error(`Invalid rank in square: ${square}`);
  }
  
  return { x: file, y: 14 - rank }; // Invert rank: rank 1 = y=13
};

/**
 * Converts PGN4 move string to a Move object
 * PGN4 format: 'Qn8-m9' (queen from n8 to m9), 'd2-d4' (pawn), 'Qg1xQn8+' (capture)
 * Castling: '0-0' (kingside), '0-0-0' (queenside)
 * @param pgn4 - PGN4 move string
 * @param basePoints - Current board state for en passant detection
 * @param moveNumber - The move number in the sequence
 * @returns Move object
 */
const pgn4ToMove = (pgn4: string, basePoints: BasePoint[], moveNumber: number): Move => {
  // Handle castling
  if (pgn4 === '0-0' || pgn4 === '0-0-0') {
    const isQueenside = pgn4 === '0-0-0';
    const piece = basePoints.find(p => p.pieceType === 'king' && !p.hasMoved);
    if (!piece) {
      throw new Error('King not found or already moved for castling');
    }
    
    return {
      fromX: piece.x,
      fromY: piece.y,
      toX: isQueenside ? piece.x - 2 : piece.x + 2,
      toY: piece.y,
      pieceType: 'king',
      id: `pgn4-${moveNumber}-${pgn4}`,
      color: piece.color as any,
      branchName: 'main',
      parentBranchName: null,
      moveNumber,
      isCastle: true,
      castleType: isQueenside ? 'queenside' : 'kingside',
      isBranch: false,
      isEnPassant: false
    };
  }
  
  // Parse regular move: [Piece][from]-[to] or [Piece][from]x[captured][to]
  let pieceType: PieceType = 'pawn'; // Default to pawn
  let rest = pgn4;
  
  // Extract piece letter if present
  // Piece letter is followed by a file letter (e.g., 'Bb4' = bishop from b4)
  // Pawn move starts with file letter directly (e.g., 'b4' = pawn at b4)
  const pieceLetter = pgn4[0].toUpperCase();
  if (['K', 'Q', 'R', 'B', 'N'].includes(pieceLetter) && pgn4.length > 2) {
    // If second char is a letter (file), then first char is a piece letter
    // If second char is a digit, then first char is a file letter (pawn move)
    const nextChar = pgn4[1];
    const isLetter = nextChar >= 'a' && nextChar <= 'z';
    if (isLetter) {
      const pieceMap: Record<string, PieceType> = {
        'K': 'king',
        'Q': 'queen',
        'R': 'rook',
        'B': 'bishop',
        'N': 'knight'
      };
      pieceType = pieceMap[pieceLetter];
      rest = pgn4.substring(1);
    }
  }
  
  // Check for capture (x)
  const isCapture = rest.includes('x');
  const parts = isCapture ? rest.split('x') : rest.split('-');
  
  if (parts.length !== 2) {
    throw new Error(`Invalid PGN4 move: ${pgn4}`);
  }
  
  const fromSquare = parts[0];
  const toPart = parts[1];
  
  // Remove check/checkmate suffix (+, #)
  const toSquare = toPart.replace(/[+#]$/, '');
  
  const from = parseSquare(fromSquare);
  const to = parseSquare(toSquare);
  
  // Find the piece at the source position
  const piece = basePoints.find(p => p.x === from.x && p.y === from.y);
  if (!piece) {
    throw new Error(`No piece found at ${fromSquare} for move: ${pgn4}`);
  }
  
  // Verify piece type matches
  if (piece.pieceType !== pieceType) {
    throw new Error(`Piece type mismatch: expected ${pieceType}, found ${piece.pieceType} at ${fromSquare}`);
  }
  
  // Detect en passant
  let isEnPassant = false;
  if (pieceType === 'pawn' && isCapture) {
    const destPiece = basePoints.find(p => p.x === to.x && p.y === to.y);
    if (!destPiece) {
      // No piece at destination, check if it's en passant
      // En passant captures the pawn that moved two squares
      const epY = piece.color === 'RED' || piece.color === 'YELLOW' ? to.y + 1 : to.y - 1;
      const epPiece = basePoints.find(p => p.x === to.x && p.y === epY);
      if (epPiece && epPiece.pieceType === 'pawn') {
        isEnPassant = true;
      }
    }
  }
  
  return {
    fromX: from.x,
    fromY: from.y,
    toX: to.x,
    toY: to.y,
    pieceType: piece.pieceType,
    id: `pgn4-${moveNumber}-${pgn4}`,
    color: piece.color as any,
    branchName: 'main',
    parentBranchName: null,
    moveNumber,
    isCastle: false,
    castleType: null,
    isBranch: false,
    isEnPassant
  };
};

/**
 * Creates a FEN4 string from a list of PGN4 moves starting from the initial position
 * @param pgn4Moves - Array of PGN4 move strings (e.g., ['d2-d4', 'b8-c8'])
 * @returns FEN4 string representing the position after all moves
 */
export const fen4FromMoves = (pgn4Moves: string[]): string => {
  // Parse the starting position
  const { basePoints, currentPlayerIndex } = parseFen4(STARTING_FEN4);
  
  // Convert PGN4 moves to full Move objects
  let currentBasePoints = [...basePoints];
  const moves: Move[] = [];
  
  for (let i = 0; i < pgn4Moves.length; i++) {
    const move = pgn4ToMove(pgn4Moves[i], currentBasePoints, i);
    moves.push(move);
    currentBasePoints = replayMoves(moves, i, basePoints);
  }
  
  // currentBasePoints already has the final position from the last iteration
  const finalBasePoints = currentBasePoints;
  
  // Calculate final player index
  const currentPlayerIdx = (currentPlayerIndex + pgn4Moves.length) % 4;
  
  // Generate the final FEN4
  return generateFen4(finalBasePoints, currentPlayerIdx);
};