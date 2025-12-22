import { BasePoint } from '../types/board';
import { MoveResult } from '../types/board.types';
import { BOARD_CONFIG } from '../constants/game';
import { isInNonPlayableCorner } from '../constants/game';
import { MOVE_PATTERNS, PIECE_MOVEMENT, PIECE_TYPES } from '../constants/movePatterns';

// Track moved pieces for castling
const movedPieces = new Set<string>();

// Helper to get piece key for tracking
const getPieceKey = (piece: BasePoint): string => {
  return `${piece.id}-${piece.pieceType}-${piece.team}`;
};

// Check if a square is under attack
const isSquareUnderAttack = (
  x: number,
  y: number,
  allBasePoints: BasePoint[],
  currentTeam: number
): boolean => {
  return allBasePoints.some(piece => {
    if (piece.team === currentTeam) return false;
    
    const moves = getLegalMoves(piece, allBasePoints);
    return moves.some(move => move.x === x && move.y === y);
  });
};

// Check if castling is possible
export const canCastle = (
  king: BasePoint,
  allBasePoints: BasePoint[],
  castleType: string,  // Now accepts any string for the castling type
  currentTeam: number
): boolean => {
    console.log('Checking castling for:', { 
    kingPos: { x: king.x, y: king.y },
    castleType,
    currentTeam
  });
  // Check if king has moved
  if (movedPieces.has(getPieceKey(king))) {
    return false;
  }

  // Get the castling configuration for this type
  const castlingConfig = MOVE_PATTERNS.CASTLING[castleType as keyof typeof MOVE_PATTERNS.CASTLING];
  if (!castlingConfig) return false;

  const [dx, dy, , rookX, rookY] = castlingConfig;
  
  // Find the rook for this castling move
  const rook = allBasePoints.find(p => 
    p.pieceType === PIECE_TYPES.ROOK && 
    p.x === rookX && 
    p.y === rookY &&
    p.team === king.team
  );

  // Check if rook exists and hasn't moved
  if (!rook || movedPieces.has(getPieceKey(rook))) {
    return false;
  }

  // Determine the direction of castling (horizontal or vertical)
  const stepX = dx !== 0 ? (dx > 0 ? 1 : -1) : 0;
  const stepY = dy !== 0 ? (dy > 0 ? 1 : -1) : 0;
  
  // Check squares between king and rook are empty and not under attack
  let x = king.x + stepX;
  let y = king.y + stepY;
  const endX = king.x + dx;
  const endY = king.y + dy;

  while (x !== endX || y !== endY) {
    if (isSquareOccupied(x, y, allBasePoints) || 
        isSquareUnderAttack(x, y, allBasePoints, currentTeam)) {
      return false;
    }
    x += stepX || 0;
    y += stepY || 0;
  }

  // Check if king is in check or would move through check
  if (isSquareUnderAttack(king.x, king.y, allBasePoints, currentTeam)) {
    return false;
  }

  // Check the squares the king moves through
  const kingStepX = stepX !== 0 ? stepX : 0;
  const kingStepY = stepY !== 0 ? stepY : 0;
  const kingX1 = king.x + kingStepX;
  const kingY1 = king.y + kingStepY;
  const kingX2 = king.x + 2 * kingStepX;
  const kingY2 = king.y + 2 * kingStepY;

  if (isSquareUnderAttack(kingX1, kingY1, allBasePoints, currentTeam) ||
      isSquareUnderAttack(kingX2, kingY2, allBasePoints, currentTeam)) {
    return false;
  }

  return true;
};

const isSquareOccupied = (x: number, y: number, basePoints: BasePoint[]): boolean => {
  return basePoints.some(bp => bp.x === x && bp.y === y);
};

const getSquaresInDirection = (
  startX: number,
  startY: number,
  dx: number,
  dy: number,
  basePoints: BasePoint[],
  currentTeam: number
): MoveResult[] => {
  const result: MoveResult[] = [];
  let x = startX + dx;
  let y = startY + dy;
  
  while (x >= 0 && x < BOARD_CONFIG.GRID_SIZE && y >= 0 && y < BOARD_CONFIG.GRID_SIZE) {
    if (isInNonPlayableCorner(x, y)) break;
    
    const occupied = isSquareOccupied(x, y, basePoints);
    const piece = basePoints.find(p => p.x === x && p.y === y);
    const teammate = piece ? piece.team === currentTeam : false;
    
    if (occupied) {
      if (!teammate) result.push({ x, y, canCapture: true });
      break;
    }
    
    result.push({ x, y, canCapture: false });
    x += dx;
    y += dy;
  }
  
  return result;
};

export const calculatePawnMoves = (
  basePoint: BasePoint,
  allBasePoints: BasePoint[],
  currentTeam: number
): MoveResult[] => {
  const moves: MoveResult[] = [];
  const { x, y, color } = basePoint;
  const pawnConfig = PIECE_MOVEMENT.PAWN[color as keyof typeof PIECE_MOVEMENT.PAWN];
  
  if (!pawnConfig) return [];
  
  // Forward moves
  const forwardX = x + pawnConfig.dx;
  const forwardY = y + pawnConfig.dy;
  
  if (!isInNonPlayableCorner(forwardX, forwardY) && 
      !isSquareOccupied(forwardX, forwardY, allBasePoints)) {
    moves.push({ x: forwardX, y: forwardY, canCapture: false });
    
    // Check for double move from starting position
    const isAtStart = 'startX' in pawnConfig 
      ? x === pawnConfig.startX 
      : y === pawnConfig.startY;
      
    if (isAtStart) {
      const doubleX = x + (2 * pawnConfig.dx);
      const doubleY = y + (2 * pawnConfig.dy);
      
      if (!isInNonPlayableCorner(doubleX, doubleY) && 
          !isSquareOccupied(doubleX, doubleY, allBasePoints)) {
        moves.push({ x: doubleX, y: doubleY, canCapture: false });
      }
    }
  }
  
  // Capture moves
  const captureDeltas = pawnConfig.dx === 0 
    ? [[-1, pawnConfig.dy], [1, pawnConfig.dy]]  // Vertical movement
    : [[pawnConfig.dx, -1], [pawnConfig.dx, 1]]; // Horizontal movement
  
  for (const [dx, dy] of captureDeltas) {
    const targetX = x + dx;
    const targetY = y + dy;
    
    if (targetX < 0 || targetX >= BOARD_CONFIG.GRID_SIZE || 
        targetY < 0 || targetY >= BOARD_CONFIG.GRID_SIZE ||
        isInNonPlayableCorner(targetX, targetY)) {
      continue;
    }
    
    const targetPiece = allBasePoints.find(p => p.x === targetX && p.y === targetY);
    if (targetPiece && targetPiece.team !== currentTeam) {
      moves.push({ x: targetX, y: targetY, canCapture: true });
    }
  }
  
  return moves;
};

export const calculateKnightMoves = (
  basePoint: BasePoint,
  allBasePoints: BasePoint[],
  currentTeam: number
): MoveResult[] => {
  return MOVE_PATTERNS.KNIGHT
    .map(([dx, dy]) => ({
      x: basePoint.x + dx,
      y: basePoint.y + dy,
      dx,
      dy
    }))
    .filter(({ x, y }) => (
      x >= 0 && x < BOARD_CONFIG.GRID_SIZE &&
      y >= 0 && y < BOARD_CONFIG.GRID_SIZE &&
      !isInNonPlayableCorner(x, y)
    ))
    .map(({ x, y }) => {
      const targetPiece = allBasePoints.find(p => p.x === x && p.y === y);
      const canCapture = targetPiece ? targetPiece.team !== currentTeam : false;
      return { x, y, canCapture };
    })
    .filter(({ x, y, canCapture }) => {
      const targetPiece = allBasePoints.find(p => p.x === x && p.y === y);
      return !targetPiece || targetPiece.team !== currentTeam;
    });
};

// Update piece moved status
export const updateMovedPieces = (piece: BasePoint, allBasePoints: BasePoint[]): void => {
  const key = getPieceKey(piece);
  
  // Mark the piece as moved
  if (!movedPieces.has(key)) {
    movedPieces.add(key);
  }
  
  // If a rook is captured, mark it as moved for castling purposes
  if (piece.pieceType === PIECE_TYPES.ROOK || piece.pieceType === PIECE_TYPES.KING) {
    // For castling, we need to mark both the king and the rook as moved
    if (piece.pieceType === PIECE_TYPES.KING) {
      // When king moves, mark both king and both rooks as moved
      const color = piece.color?.toUpperCase() as keyof typeof MOVE_PATTERNS.CASTLING;
      if (color) {
        const kingSideKey = `${color}_KING_SIDE` as const;
        const queenSideKey = `${color}_QUEEN_SIDE` as const;
        
        // Mark both rooks as moved when the king moves
        [kingSideKey, queenSideKey].forEach(side => {
          const castlingMoves = MOVE_PATTERNS.CASTLING as Record<string, readonly [number, number, boolean, number, number, number, number]>;
          if (side in castlingMoves) {
            const [,,, rookX, rookY] = castlingMoves[side];
            const rook = allBasePoints.find(p => 
              p.pieceType === PIECE_TYPES.ROOK && 
              p.x === rookX && 
              p.y === rookY &&
              p.team === piece.team
            );
            
            if (rook) {
              const rookKey = getPieceKey(rook);
              if (!movedPieces.has(rookKey)) {
                movedPieces.add(rookKey);
              }
            }
          }
        });
      }
    }
    
    // Also mark the piece itself as moved (for rooks and kings)
    movedPieces.add(key);
  }
};

export const getLegalMoves = (
  basePoint: BasePoint,
  allBasePoints: BasePoint[]
): MoveResult[] => {
    console.log('Getting legal moves for piece:', {
    id: basePoint.id,
    type: basePoint.pieceType,
    x: basePoint.x,
    y: basePoint.y,
    color: basePoint.color,
    isKing: basePoint.pieceType === PIECE_TYPES.KING
  });
  const pieceType = basePoint.pieceType || PIECE_TYPES.PAWN;
  const currentTeam = basePoint.team;
  
  switch (pieceType) {
    case PIECE_TYPES.QUEEN:
      return PIECE_MOVEMENT.QUEEN.flatMap(([dx, dy]) => 
        getSquaresInDirection(basePoint.x, basePoint.y, dx, dy, allBasePoints, currentTeam)
      );
      
    case PIECE_TYPES.KING: {
      // Get standard king moves
      const standardMoves = PIECE_MOVEMENT.KING
        .map(([dx, dy]) => ({
          x: basePoint.x + dx,
          y: basePoint.y + dy,
          dx,
          dy,
          isCastle: false
        }))
        .filter(({ x, y }) => !isInNonPlayableCorner(x, y))
        .map(({ x, y, dx, dy }) => {
          const targetPiece = allBasePoints.find(p => p.x === x && p.y === y);
          const canCapture = targetPiece ? targetPiece.team !== currentTeam : false;
          return { x, y, canCapture, isCastle: false };
        })
        .filter(({ x, y, canCapture }) => {
          const targetPiece = allBasePoints.find(p => p.x === x && p.y === y);
          return !targetPiece || targetPiece.team !== currentTeam;
        });

      // Add castling moves if available
      const castlingMoves: MoveResult[] = [];
      
      // Get the color-specific castling keys
      const color = basePoint.color?.toUpperCase() as keyof typeof MOVE_PATTERNS.CASTLING;
      console.log('Checking castling for king at', { x: basePoint.x, y: basePoint.y, color });
      if (color) {
        const kingSideKey = `${color}_KING_SIDE` as const;
        const queenSideKey = `${color}_QUEEN_SIDE` as const;
        const castlingMovesObj = MOVE_PATTERNS.CASTLING as Record<string, readonly [number, number, boolean, number, number, number, number]>;
        
        // Check king-side castling
        if (canCastle(basePoint, allBasePoints, kingSideKey, currentTeam)) {
          const [dx] = castlingMovesObj[kingSideKey] || [0];
          castlingMoves.push({
            x: basePoint.x + dx,
            y: basePoint.y,
            canCapture: false,
            isCastle: true,
            castleType: kingSideKey
          });
        }
        
        // Check queen-side castling
        if (canCastle(basePoint, allBasePoints, queenSideKey, currentTeam)) {
          const [dx] = castlingMovesObj[queenSideKey] || [0];
          castlingMoves.push({
            x: basePoint.x + dx,
            y: basePoint.y,
            canCapture: false,
            isCastle: true,
            castleType: queenSideKey
          });
        }
      } else {
        console.log('King-side castling is NOT possible');
      }

      return [...standardMoves, ...castlingMoves];
    }
      
    case PIECE_TYPES.BISHOP:
      return PIECE_MOVEMENT.BISHOP.flatMap(([dx, dy]) => 
        getSquaresInDirection(basePoint.x, basePoint.y, dx, dy, allBasePoints, currentTeam)
      );
      
    case PIECE_TYPES.KNIGHT:
      return calculateKnightMoves(basePoint, allBasePoints, currentTeam);
      
    case PIECE_TYPES.ROOK:
      return PIECE_MOVEMENT.ROOK.flatMap(([dx, dy]) => 
        getSquaresInDirection(basePoint.x, basePoint.y, dx, dy, allBasePoints, currentTeam)
      );
      
    case PIECE_TYPES.PAWN:
      return calculatePawnMoves(basePoint, allBasePoints, currentTeam);
      
    default:
      return [];
  }
};
