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
  currentPlayerIndex: number,
  options: {
    kingsideCastling?: string;
    queensideCastling?: string;
    enPassantTargets?: string;
  } = {}
): string => {
  const playerColors = ['R', 'B', 'Y', 'G'];
  const currentPlayer = playerColors[currentPlayerIndex] || 'R';
  const eliminatedPlayers = '0,0,0,0';
  const kingsideCastling = options.kingsideCastling || '1,1,1,1';
  const queensideCastling = options.queensideCastling || '1,1,1,1';
  const points = '0,0,0,0';
  const halfmoveClock = '0';
  const enPassantTargets = options.enPassantTargets || ',,,';
  
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
  
  // Convert board to FEN4 notation (compact format)
  const fenRows = board.map(row => {
    let result = '';
    let emptyCount = 0;
    
    for (const square of row) {
      if (square === '') {
        emptyCount++;
      } else {
        if (emptyCount > 0) {
          result += emptyCount.toString();
          emptyCount = 0;
        }
        result += square;
      }
    }
    
    // Add any remaining empty squares
    if (emptyCount > 0) {
      result += emptyCount.toString();
    }
    
    return result;
  });
  
  // Combine all FEN4 parts
  return [
    currentPlayer,
    eliminatedPlayers,
    kingsideCastling,
    queensideCastling,
    points,
    halfmoveClock,
    fenRows.join('/'),
    enPassantTargets
  ].join('-');
};

export const parseFen4 = (fen4: string): {
  basePoints: BasePoint[];
  currentPlayerIndex: number;
  kingsideCastling: string;
  queensideCastling: string;
  enPassantTargets: string;
} => {
  const parts = fen4.split('-');
  if (parts.length !== 8) {
    throw new Error('Invalid FEN4 string: Must have 8 parts separated by hyphens');
  }

  const [currentPlayer, , kingsideCastling, queensideCastling, , , piecePlacement, enPassantTargets] = parts;
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
    let i = 0;
    
    while (i < row.length && x < 14) {
      const char = row[i];
      
      if (char >= '0' && char <= '9') {
        // Parse number (could be multi-digit)
        let numStr = char;
        while (i + 1 < row.length && row[i + 1] >= '0' && row[i + 1] <= '9') {
          i++;
          numStr += row[i];
        }
        x += parseInt(numStr, 10);
      } else if (char.toLowerCase() in PREFIX_TO_COLOR) {
        // Parse piece: color prefix + piece code
        const colorPrefix = char.toLowerCase();
        const pieceCode = row[i + 1]?.toUpperCase() || 'P';
        
        const color = PREFIX_TO_COLOR[colorPrefix] as NamedColor;
        const pieceType = FEN_TO_PIECE[pieceCode] || 'pawn';
        const team = ['r', 'y'].includes(colorPrefix) ? 1 : 2;
        
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
        
        x++;
        i++; // Skip the piece code
      }
      
      i++;
    }
  });

  return {
    basePoints,
    currentPlayerIndex: playerIndex,
    kingsideCastling,
    queensideCastling,
    enPassantTargets
  };
};

// Add this to src/utils/fen4Utils.ts

export const STARTING_FEN4 = 'R-0,0,0,0-1,1,1,1-1,1,1,1-0,0,0,0-0-3yRyNyByKyQyByNyR3/3yPyPyPyPyPyPyPyP3/14/bRbP10gPgR/bNbP10gPgN/bBbP10gPgB/bKbP10gPgQ/bQbP10gPgK/bBbP10gPgB/bNbP10gPgN/bRbP10gPgR/14/3rPrPrPrPrPrPrPrP3/3rRrNrBrQrKrBrNrR3-,,,';

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

export const pgn4ToString = (pgn4Content: string): string[] => {
  const moves: string[] = [];
  
  // Split into lines
  const lines = pgn4Content.split('\n');
  
  // Find where movetext starts (after tag pairs)
  let inMovetext = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines
    if (!trimmed) continue;
    
    // Check if we're still in tag pairs
    if (trimmed.startsWith('[')) {
      inMovetext = false;
      continue;
    }
    
    // We're now in movetext
    inMovetext = true;
    
    // Remove move numbers (e.g., "1.", "2.")
    let moveLine = trimmed.replace(/^\d+\.\s*/, '');
    
    // Remove check/checkmate/elimination markers (+, #, R, T)
    moveLine = moveLine.replace(/[+#RT]/g, '');
    
    // Remove variations (parentheses and their contents) to keep only main line
    moveLine = moveLine.replace(/\([^)]*\)/g, '');
    
    // Split by two periods to get individual moves
    const parts = moveLine.split(/\.\./);
    
    for (const part of parts) {
      const move = part.trim();
      // Skip empty moves (indicated by ".." in PGN4)
      if (move && move !== '..') {
        moves.push(move);
      }
    }
  }
  
  return moves;
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
export const pgn4StringToMove = (pgn4: string, basePoints: BasePoint[], moveNumber: number): Move => {
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
      castleType: isQueenside ? 'QUEEN_SIDE' : 'KING_SIDE',
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

export const fen4FromMoves = (pgn4Moves: string[]): string => {
  // Parse the starting position
  const { basePoints, currentPlayerIndex, kingsideCastling, queensideCastling } = parseFen4(STARTING_FEN4);
  
  // Convert PGN4 moves to full Move objects
  let currentBasePoints = [...basePoints];
  const moves: Move[] = [];
  
  // Track castling rights (0 = lost, 1 = available) for each player [R, B, Y, G]
  let ksCastling = kingsideCastling.split(',').map(Number);
  let qsCastling = queensideCastling.split(',').map(Number);
  
  // Track en passant targets (square notation or empty string for each player)
  let enPassantTargets = ['R', 'B', 'Y', 'G'].map(() => '');
  
  for (let i = 0; i < pgn4Moves.length; i++) {
    const move = pgn4StringToMove(pgn4Moves[i], currentBasePoints, i);
    moves.push(move);
    
    // Update en passant targets: when a pawn moves 2 squares, the skipped square becomes target
    if (move.pieceType === 'pawn') {
      const dy = Math.abs(move.toY - move.fromY);
      const dx = Math.abs(move.toX - move.fromX);
      
      // Check if this is a 2-square pawn move
      if ((dy === 2 && dx === 0) || (dx === 2 && dy === 0)) {
        // Calculate the square that was skipped (the en passant target)
        const skippedX = (move.fromX + move.toX) / 2;
        const skippedY = (move.fromY + move.toY) / 2;
        
        // Convert to square notation
        const file = String.fromCharCode(97 + skippedX);
        const rank = (14 - skippedY).toString();
        const square = `${file}${rank}`;
        
        // Set en passant target for the current player's next opponent
        const playerIdx = (currentPlayerIndex + i) % 4;
        enPassantTargets[playerIdx] = square;
      } else {
        // Reset en passant target for this player after any other pawn move
        const playerIdx = (currentPlayerIndex + i) % 4;
        enPassantTargets[playerIdx] = '';
      }
    } else {
      // Reset en passant target for current player after non-pawn move
      const playerIdx = (currentPlayerIndex + i) % 4;
      enPassantTargets[playerIdx] = '';
    }
    
    // Update castling rights when king or rook moves
    const playerIdx = ['RED', 'BLUE', 'YELLOW', 'GREEN'].indexOf(move.color);
    if (playerIdx !== -1) {
      if (move.pieceType === 'king') {
        // King moves: lose all castling rights for this player
        ksCastling[playerIdx] = 0;
        qsCastling[playerIdx] = 0;
      } else if (move.pieceType === 'rook') {
        // Rook moves: check if it's a castling rook and lose that side's rights
        // For simplicity, we'll lose castling rights if any rook moves
        // A more precise implementation would check the starting position
        ksCastling[playerIdx] = 0;
        qsCastling[playerIdx] = 0;
      }
    }
    
    const { basePoints: replayedBasePoints } = replayMoves(moves, i, basePoints);
    currentBasePoints = replayedBasePoints;
  }
  
  // currentBasePoints already has the final position from the last iteration
  const finalBasePoints = currentBasePoints;
  
  // Calculate final player index
  const currentPlayerIdx = (currentPlayerIndex + pgn4Moves.length) % 4;
  
  // Format en passant targets as comma-separated string
  const enPassantStr = enPassantTargets.join(',');
  
  // Generate the final FEN4
  return generateFen4(finalBasePoints, currentPlayerIdx, {
    kingsideCastling: ksCastling.join(','),
    queensideCastling: qsCastling.join(','),
    enPassantTargets: enPassantStr
  });
};