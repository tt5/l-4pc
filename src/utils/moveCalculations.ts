import { BasePoint } from '../types/board';
import { MoveResult } from '../types/board.types';
import { BOARD_CONFIG } from '../constants/game';
import { isInNonPlayableCorner } from '../constants/game';
import { MOVE_PATTERNS, PIECE_MOVEMENT, PIECE_TYPES } from '../constants/movePatterns';

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

export const getLegalMoves = (
  basePoint: BasePoint,
  allBasePoints: BasePoint[]
): MoveResult[] => {
  const pieceType = basePoint.pieceType || PIECE_TYPES.PAWN;
  const currentTeam = basePoint.team;
  
  switch (pieceType) {
    case PIECE_TYPES.QUEEN:
      return PIECE_MOVEMENT.QUEEN.flatMap(([dx, dy]) => 
        getSquaresInDirection(basePoint.x, basePoint.y, dx, dy, allBasePoints, currentTeam)
      );
      
    case PIECE_TYPES.KING:
      return PIECE_MOVEMENT.KING
        .map(([dx, dy]) => ({
          x: basePoint.x + dx,
          y: basePoint.y + dy,
          dx,
          dy
        }))
        .filter(({ x, y }) => !isInNonPlayableCorner(x, y))
        .map(({ x, y }) => {
          const targetPiece = allBasePoints.find(p => p.x === x && p.y === y);
          const canCapture = targetPiece ? targetPiece.team !== currentTeam : false;
          return { x, y, canCapture };
        })
        .filter(({ x, y, canCapture }) => {
          const targetPiece = allBasePoints.find(p => p.x === x && p.y === y);
          return !targetPiece || targetPiece.team !== currentTeam;
        });
      
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
