import { BasePoint } from '../types/board';
import { MoveResult } from '../types/board.types';
import { BOARD_CONFIG, COLOR_TO_HEX, getTeamByColor } from '../constants/game';
import { isInNonPlayableCorner } from '../constants/game';
import { MOVE_PATTERNS, PIECE_MOVEMENT, PIECE_TYPES } from '../constants/movePatterns';
import { isSquareUnderAttack } from '../utils/gameUtils';


type CastlingKey = keyof typeof MOVE_PATTERNS.CASTLING;

// Track moved pieces for castling
const movedPieces = new Set<string>();

// Helper to get piece key for tracking
const getPieceKey = (piece: BasePoint): string => {
  return `${piece.id}-${piece.pieceType}-${piece.team}`;
};

// Check if castling is possible
export const canCastle = (
  king: BasePoint,
  allBasePoints: BasePoint[],
  castleType: string,  // Now accepts any string for the castling type
  currentTeam: number,
  getTeamFn: (color: string) => number = getTeamByColor
): boolean => {

  console.log('Checking castling for:', JSON.stringify({ 
    kingPos: { x: king.x, y: king.y },
    castleType,
    currentTeam
  }));

    // Check if king has moved - we'll rely on the movedPieces set
  const kingKey = getPieceKey(king);
  if (movedPieces.has(kingKey)) {
    console.log('King has moved, cannot castle');
    return false;
  }

  // Get the color name from the color code (case-insensitive)
  const getColorName = (colorCode: string): string => {
    console.log('getColorName called with:', colorCode);
    if (!colorCode) {
      console.log('No color code provided');
      return '';
    }
    
    // Normalize to uppercase for comparison
    const normalizedCode = colorCode.toUpperCase();
    console.log('Normalized color code:', normalizedCode);
    
    const colorMap: Record<string, string> = {
      '#F44336': 'RED',
      '#FFEB3B': 'YELLOW',
      '#2196F3': 'BLUE',
      '#4CAF50': 'GREEN',
      // Add direct color name mappings
      'RED': 'RED',
      'YELLOW': 'YELLOW',
      'BLUE': 'BLUE',
      'GREEN': 'GREEN'
    };
    
    console.log('Color map keys:', Object.keys(colorMap));
    
    // Try exact match first
    if (colorMap[normalizedCode]) {
      console.log('Exact match found:', colorMap[normalizedCode]);
      return colorMap[normalizedCode];
    }
    
    // Try to find a match by value (in case the key is different)
    for (const [code, name] of Object.entries(colorMap)) {
      if (code.toUpperCase() === normalizedCode) {
        console.log('Case-insensitive match found:', name);
        return name;
      }
    }
    
    console.log('Color code not found in map:', colorCode);
    console.log('Available colors:', Object.entries(colorMap).map(([k, v]) => `${k} -> ${v}`).join(', '));
    return '';
  };

  // Extract color and side from castleType
  const [colorCode, ...sideParts] = castleType.split('_');
  const side = sideParts.join('_'); // This will handle "KING_SIDE" or "QUEEN_SIDE"
  console.log('Processing castling:', JSON.stringify({ colorCode, side, castleType }));
  
  const colorName = getColorName(colorCode);
  
  if (!colorName) {
    console.log('Invalid color code for castling. Code:', colorCode, 'Type:', typeof colorCode, 'Full castleType:', castleType);
    return false;
  }

  const castlingKey = `${colorName}_${side}` as CastlingKey;
  const castlingConfig = MOVE_PATTERNS.CASTLING[castlingKey];
  
  if (!castlingConfig) {
    console.log('No castling config found for:', castlingKey);
    return false;
  }

  const [dx, dy, , rookX, rookY] = castlingConfig;
  
  // Find the rook for this castling move
  const rook = allBasePoints.find(p => 
    p.pieceType === PIECE_TYPES.ROOK && 
    p.x === rookX && 
    p.y === rookY &&
    p.team === king.team
  );

  if (!rook) {
    console.log('Rook not found at position:', { rookX, rookY });
    return false;
  }
  const rookKey = getPieceKey(rook);
  if (movedPieces.has(rookKey)) {
    console.log('Rook has moved, cannot castle');
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
    console.log(`checking square ${x},${y}`);
    const occupied = isSquareOccupied(x, y, allBasePoints);

    const opponentTeam = currentTeam === 1 ? 2 : 1;
    const underAttack = isSquareUnderAttack(x, y, opponentTeam, allBasePoints, getTeamFn);
    console.log('Square:', { x, y, occupied, underAttack });
    
    if (occupied || underAttack) {
      console.log('Castling blocked at:', { x, y, occupied, underAttack });
      return false;
    }
    x += stepX || 0;
    y += stepY || 0;
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
