import { getTeamByColor, isInNonPlayableCorner, BOARD_CONFIG, normalizeColor } from '~/constants/game';

type CastleColor = 'RED' | 'YELLOW' | 'BLUE' | 'GREEN';
type CastleType = `${CastleColor}_${'KING_SIDE' | 'QUEEN_SIDE'}`;
import { MOVE_PATTERNS } from '~/constants/movePatterns';
import { canCastle } from './moveCalculations';
import type { BasePoint, PieceType } from '~/types/board';
import type { RestrictedSquareInfo } from '../types/restrictedSquares';

/**
 * Type guard for PieceType
 * @param str - The string to check
 * @returns True if the string is a valid PieceType
 */
export function isValidPieceType(str: string): str is PieceType {
  return ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'].includes(str);
}

/**
 * Check if a square is occupied by any base point
 * @param x - X coordinate to check
 * @param y - Y coordinate to check
 * @param basePoints - Array of base points to check against
 * @returns True if the square is occupied, false otherwise
 */
export function isSquareOccupied(x: number, y: number, basePoints: BasePoint[]): boolean {
  return basePoints.some(point => point.x === x && point.y === y);
}

// Color mapping for consistent color handling across the game
export const COLOR_MAP: Record<string, string> = {
  'red': '#f44336',
  'blue': '#2196f3',
  'yellow': '#ffeb3b',
  'green': '#4caf50'
};

/**
 * Converts color names to hex values
 * @param color - The color to convert (can be color name or hex value)
 * @returns The color in hex format, or the original string if not found in COLOR_MAP
 */
export function colorToHex(color: string): string {
  if (!color) return '';
  const lowerColor = color.toLowerCase();
  return COLOR_MAP[lowerColor] || color;
}

/**
 * Gets the current player's color based on the turn index
 * @param turnIndex - The current turn index
 * @returns The color of the current player
 */
export function getCurrentPlayerColor(turnIndex: number, playerColors: string[]): string {
  return playerColors[turnIndex % playerColors.length];
}


/**
 * Get all squares in a direction until an obstacle is hit
 * @param startX - Starting X coordinate
 * @param startY - Starting Y coordinate
 * @param dx - X direction (-1, 0, or 1)
 * @param dy - Y direction (-1, 0, or 1)
 * @param allBasePoints - Array of all base points on the board
 * @param team - Current team (1 or 2)
 * @returns Array of valid squares in the given direction
 */
function getSquaresInDirection(
  startX: number,
  startY: number,
  dx: number,
  dy: number,
  allBasePoints: BasePoint[],
  team: number
): {x: number, y: number, canCapture: boolean}[] {
  const result = [];
  let x = startX + dx;
  let y = startY + dy;
  
  while (x >= 0 && x < BOARD_CONFIG.GRID_SIZE && y >= 0 && y < BOARD_CONFIG.GRID_SIZE) {
    // Skip non-playable corner squares
    if (isInNonPlayableCorner(x, y)) {
      break;
    }
    
    const occupied = isSquareOccupied(x, y, allBasePoints);
    const piece = allBasePoints.find(p => p.x === x && p.y === y);
    const teammate = piece ? getTeamByColor(piece.color) === team : false;
    
    if (occupied) {
      if (!teammate) {
        // Can capture opponent's piece
        result.push({x, y, canCapture: true});
      }
      break;
    }
    
    // Add empty square
    result.push({x, y, canCapture: false});
    x += dx;
    y += dy;
  }
  
  return result;
}

/**
 * Check if the path between two squares is clear of other pieces
 * @param x1 - Starting X coordinate
 * @param y1 - Starting Y coordinate
 * @param x2 - Target X coordinate
 * @param y2 - Target Y coordinate
 * @param allBasePoints - Array of all base points on the board
 * @returns True if the path is clear, false if there are pieces in the way
 */
export function isPathClear(
  x1: number, 
  y1: number, 
  x2: number, 
  y2: number,
  allBasePoints: BasePoint[]
): boolean {
  const dx = Math.sign(x2 - x1);
  const dy = Math.sign(y2 - y1);
  let x = x1 + dx;
  let y = y1 + dy;

  // Only check up to, but not including, the end position
  // The end position is where the king is, and it's expected to be occupied
  while (!(x === x2 && y === y2)) {
    if (allBasePoints.some(p => p.x === x && p.y === y)) {
      return false;
    }
    x += dx;
    y += dy;
  }

  return true;
}

/**
 * Check if a piece can attack a specific square
 * @param piece - The piece to check
 * @param targetX - Target X coordinate
 * @param targetY - Target Y coordinate
 * @param allBasePoints - Array of all base points on the board
 * @returns True if the piece can attack the target square
 */
export function canPieceAttack(
  piece: BasePoint, 
  targetX: number, 
  targetY: number,
  allBasePoints: BasePoint[],
  getTeamFn?: (color: string) => number
): boolean {
  const dx = Math.abs(piece.x - targetX);
  const dy = Math.abs(piece.y - targetY);
  const xDir = Math.sign(targetX - piece.x);
  const yDir = Math.sign(targetY - piece.y);
  
  // Get the piece's team if not already set
  const pieceTeam = piece.team || (getTeamFn ? getTeamFn(piece.color) : 0);
  
  // King movement (1 square in any direction)
  if (piece.pieceType === 'king') {
    return dx <= 1 && dy <= 1;
  }
  
  // Queen movement (any number of squares in any direction)
  if (piece.pieceType === 'queen') {
    // Check if moving in a straight line or diagonal
    if (piece.x === targetX || piece.y === targetY || Math.abs(dx) === Math.abs(dy)) {
      return isPathClear(piece.x, piece.y, targetX, targetY, allBasePoints);
    }
    return false;
  }

  // Rook movement (any number of squares horizontally or vertically)
  if (piece.pieceType === 'rook') {
    if (piece.x === targetX || piece.y === targetY) {
      return isPathClear(piece.x, piece.y, targetX, targetY, allBasePoints);
    }
    return false;
  }

  // Bishop movement (any number of squares diagonally)
  if (piece.pieceType === 'bishop') {
    if (dx === dy) {
      return isPathClear(piece.x, piece.y, targetX, targetY, allBasePoints);
    }
    return false;
  }

  // Knight movement (L-shape)
  if (piece.pieceType === 'knight') {
    return (dx === 2 && dy === 1) || (dx === 1 && dy === 2);
  }

  // Pawn movement (diagonal capture only)
  if (piece.pieceType === 'pawn') {
    // For pawns, we only check diagonal captures (1 square forward-diagonal)
    if (dx !== 1 || dy !== 1) return false;
    
    // Determine the attacking direction based on the piece's team
    const targetPiece = allBasePoints.find(p => p.x === targetX && p.y === targetY);
    if (targetPiece) {
      const targetTeam = targetPiece.team || (getTeamFn ? getTeamFn(targetPiece.color) : 0);
      
      // Only consider it a valid attack if the target is an opponent's piece
      if (targetTeam !== pieceTeam) {
        // For team 1 (red), pawns move up (decreasing y)
        if (pieceTeam === 1 && targetY < piece.y) return true;
        // For team 2 (blue), pawns move down (increasing y)
        if (pieceTeam === 2 && targetY > piece.y) return true;
      }
    }
    return false;
  }
  
  return false;
}

/**
 * Check if a square is between two other squares in a straight line
 * @param from - The starting point
 * @param to - The ending point
 * @param x - X coordinate of the square to check
 * @param y - Y coordinate of the square to check
 * @returns True if the square is between from and to in a straight line (exclusive)
 */
export function isSquareBetween(
  from: {x: number, y: number}, 
  to: {x: number, y: number}, 
  x: number, 
  y: number
): boolean {
  // Check if all three points are in a straight line
  const dx1 = to.x - from.x;
  const dy1 = to.y - from.y;
  const dx2 = x - from.x;
  const dy2 = y - from.y;
  
  // If not in a straight line, return false
  if (dx1 * dy2 !== dx2 * dy1) return false;
  
  // Check if (x,y) is between from and to (exclusive)
  const isBetweenX = (from.x <= x && x <= to.x) || (from.x >= x && x >= to.x);
  const isBetweenY = (from.y <= y && y <= to.y) || (from.y >= y && y >= to.y);
  
  return isBetweenX && isBetweenY && (x !== from.x || y !== from.y) && (x !== to.x || y !== to.y);
}

/**
 * Check if a square is under attack by any piece of the given team
 * @param x - X coordinate of the square to check
 * @param y - Y coordinate of the square to check
 * @param attackingTeam - The team number (1 or 2) that might be attacking
 * @param allBasePoints - Array of all base points on the board
 * @param getTeamFn - Function to get the team number from a color
 * @returns True if the square is under attack by the specified team
 */
export function isSquareUnderAttack(
  x: number, 
  y: number, 
  attackingTeam: number, 
  allBasePoints: BasePoint[],
  getTeamFn: (color: string) => number
): boolean {
  return allBasePoints.some(attacker => {
    if (getTeamFn(attacker.color) !== attackingTeam) return false;
    return canPieceAttack(attacker, x, y, allBasePoints);
  });
}

function canPieceAttackThroughLine(
  attacker: BasePoint,
  pinnedPiece: BasePoint,
  king: BasePoint,
  allBasePoints: BasePoint[],
  getTeamFn: (color: string) => number
): boolean {
  const log = {
    attacker: {x: attacker.x, y: attacker.y, type: attacker.pieceType, color: attacker.color},
    pinnedPiece: {x: pinnedPiece.x, y: pinnedPiece.y, type: pinnedPiece.pieceType, color: pinnedPiece.color},
    king: {x: king.x, y: king.y, color: king.color},
    timestamp: new Date().toISOString()
  };

  console.log(JSON.stringify({
    ...log,
    action: 'attack_check_start',
    message: 'Checking if piece can attack through line'
  }));

  const attackerType = attacker.pieceType;
  
  // Calculate direction from pinned piece to king
  const dx = Math.sign(king.x - pinnedPiece.x);
  const dy = Math.sign(king.y - pinnedPiece.y);

  // Log directions
  console.log(JSON.stringify({
    ...log,
    action: 'direction_check',
    kingDirection: {dx, dy},
    pinnedToKing: {dx: king.x - pinnedPiece.x, dy: king.y - pinnedPiece.y}
  }));

  // Check if attacker is on the same line as the pin
  const isOnPinLine = 
    (dx === 0 && attacker.x === pinnedPiece.x) || // Vertical line
    (dy === 0 && attacker.y === pinnedPiece.y) || // Horizontal line
    (dx !== 0 && dy !== 0 && 
     Math.abs(attacker.x - pinnedPiece.x) === Math.abs(attacker.y - pinnedPiece.y)); // Diagonal line

  if (!isOnPinLine) {
    console.log(JSON.stringify({
      ...log,
      action: 'attack_check_end',
      reason: 'not_on_pin_line',
      result: false,
      pinDirection: {dx, dy},
      attackerPosition: {x: attacker.x, y: attacker.y}
    }));
    return false;
  }

  // Check if attacker is on the opposite side of the pinned piece from the king
  let isOppositeSide = false;
  if (dx === 0) { // Vertical line
    isOppositeSide = (attacker.y - pinnedPiece.y) * dy < 0;
  } else if (dy === 0) { // Horizontal line
    isOppositeSide = (attacker.x - pinnedPiece.x) * dx < 0;
  } else { // Diagonal line
    const attackerDx = attacker.x - pinnedPiece.x;
    const attackerDy = attacker.y - pinnedPiece.y;
    isOppositeSide = (attackerDx * dx < 0) && (attackerDy * dy < 0);
  }

  if (!isOppositeSide) {
    console.log(JSON.stringify({
      ...log,
      action: 'attack_check_end',
      reason: 'not_opposite_side',
      result: false,
      pinDirection: {dx, dy},
      attackerPosition: {x: attacker.x, y: attacker.y}
    }));
    return false;
  }

  // Check if attacker's piece type can attack through this line
  let canAttack = false;
  let reason = '';
  
  if (attackerType === 'queen') {
    canAttack = true;
    reason = 'queen_can_attack_any_direction';
  } else if (attackerType === 'rook' && (dx === 0 || dy === 0)) {
    canAttack = true;
    reason = 'rook_can_attack_rank_or_file';
  } else if (attackerType === 'bishop' && dx !== 0 && dy !== 0) {
    canAttack = true;
    reason = 'bishop_can_attack_diagonal';
  } else if (attackerType === 'pawn') {
    // Pawns can only attack diagonally forward
    const isDiagonal = dx !== 0 && dy !== 0;
    const isForwardForPawn = (attacker.color === king.color) ? 
      (pinnedPiece.y > attacker.y) : (pinnedPiece.y < attacker.y);
    canAttack = isDiagonal && isForwardForPawn;
    reason = canAttack ? 'pawn_can_attack_diagonal_forward' : 'pawn_cannot_attack_this_direction';
  } else {
    reason = 'invalid_attacker_type_or_direction';
  }

  console.log(JSON.stringify({
    ...log,
    action: 'attack_check_end',
    reason,
    result: canAttack,
    attackerType,
    pinDirection: {dx, dy}
  }));
  
  return canAttack;
}

/**
 * Checks if a piece is pinned to its king
 * @param piece - The piece to check
 * @param allBasePoints - All pieces on the board
 * @param getTeamFn - Function to get team from color
 * @returns Object with pin status and direction if pinned
 */
export function isPiecePinned(
  piece: BasePoint,
  allBasePoints: BasePoint[],
  getTeamFn: (color: string) => number
): { isPinned: boolean; pinDirection?: [number, number] } {
  const log = { 
    piece: {x: piece.x, y: piece.y, type: piece.pieceType, color: piece.color},
    timestamp: new Date().toISOString()
  };

  // Log function start
  console.log(JSON.stringify({
    ...log,
    action: 'check_pin_start',
    message: 'Starting pin check for piece'
  }));

  // Find the king of the same color
  const king = allBasePoints.find(p => 
    p.pieceType === 'king' && 
    p.team === getTeamFn(piece.color)
  );
  
  if (!king) {
    console.log(JSON.stringify({
      ...log,
      action: 'pin_check_end',
      reason: 'no_king_found',
      result: 'not_pinned'
    }));
    return { isPinned: false };
  }

  // Log king found
  console.log(JSON.stringify({
    ...log,
    action: 'king_found',
    king: {x: king.x, y: king.y, color: king.color}
  }));

  // Calculate direction from piece to king
  const dx = king.x - piece.x;
  const dy = king.y - piece.y;

  // Log alignment check
  console.log(JSON.stringify({
    ...log,
    action: 'check_alignment',
    kingPos: {x: king.x, y: king.y},
    piecePos: {x: piece.x, y: piece.y},
    dx,
    dy
  }));

  // Check if piece is aligned with king (same rank, file, or diagonal)
  const isAligned = dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
  
  if (!isAligned) {
    console.log(JSON.stringify({
      ...log,
      action: 'pin_check_end',
      reason: 'not_aligned_with_king',
      result: 'not_pinned',
      dx,
      dy,
      alignmentType: 'none'
    }));
    return { isPinned: false };
  }
  
  // Log alignment type
  const alignmentType = dx === 0 ? 'vertical' : 
                      dy === 0 ? 'horizontal' : 
                      Math.abs(dx) === Math.abs(dy) ? 'diagonal' : 'none';
  
  console.log(JSON.stringify({
    ...log,
    action: 'alignment_check',
    alignment: {
      type: alignmentType,
      dx,
      dy,
      isAligned: true
    }
  }));

  const stepX = dx === 0 ? 0 : dx > 0 ? 1 : -1;
  const stepY = dy === 0 ? 0 : dy > 0 ? 1 : -1;

  // Log pin direction
  console.log(JSON.stringify({
    ...log,
    action: 'pin_direction',
    direction: [stepX, stepY],
    directionType: 
      stepX === 0 ? 'vertical' : 
      stepY === 0 ? 'horizontal' : 
      'diagonal'
  }));

  // Look for an attacking piece in the opposite direction
  let x = piece.x - stepX;
  let y = piece.y - stepY;
  let steps = 0;

  while (x >= 0 && x < BOARD_CONFIG.GRID_SIZE && y >= 0 && y < BOARD_CONFIG.GRID_SIZE) {
    steps++;
    const square = allBasePoints.find(p => p.x === x && p.y === y);
    
    if (square) {
      // Log square found
      console.log(JSON.stringify({
        ...log,
        action: 'square_found',
        step: steps,
        square: {x: square.x, y: square.y, type: square.pieceType, color: square.color},
        isFriendly: getTeamFn(square.color) === getTeamFn(piece.color)
      }));

      // If we find a friendly piece first, no pin
      if (getTeamFn(square.color) === getTeamFn(piece.color)) {
        console.log(JSON.stringify({
          ...log,
          action: 'pin_check_end',
          reason: 'friendly_blocker',
          blocker: {x: square.x, y: square.y, type: square.pieceType},
          result: 'not_pinned'
        }));
        return { isPinned: false };
      }

      // If we find an enemy piece that can attack through this line, it's a pin
      const canAttack = canPieceAttackThroughLine(square, piece, king, allBasePoints, getTeamFn);
      
      if (canAttack) {
        console.log(JSON.stringify({
          ...log,
          action: 'pin_found',
          attacker: {x: square.x, y: square.y, type: square.pieceType},
          direction: [stepX, stepY],
          result: 'pinned'
        }));
        return { 
          isPinned: true, 
          pinDirection: [stepX, stepY] as [number, number] 
        };
      } else {
        console.log(JSON.stringify({
          ...log,
          action: 'attacker_cannot_pin',
          reason: 'attacker_cannot_attack_through_line',
          attacker: {x: square.x, y: square.y, type: square.pieceType}
        }));
      }
      break;
    }

    x -= stepX;
    y -= stepY;
  }

  // If we get here, no pin was found
  console.log(JSON.stringify({
    ...log,
    action: 'pin_check_end',
    reason: 'no_attacker_found',
    result: 'not_pinned',
    steps_checked: steps
  }));

  return { isPinned: false };
}

/**
 * Calculate all legal moves for a given piece
 * @param basePoint - The piece to calculate moves for
 * @param allBasePoints - Array of all pieces on the board
 * @returns Array of legal moves with their coordinates and capture status
 */
/**
 * Check if a move would resolve a check
 * @param from - Starting position [x, y]
 * @param to - Target position [x, y]
 * @param color - Color of the moving piece
 * @param allBasePoints - Array of all pieces on the board
 * @param getTeamFn - Function to get team from color
 * @param isSquareUnderAttackFn - Function to check if a square is under attack
 * @param isSquareBetweenFn - Function to check if a square is between two points
 * @returns True if the move would resolve the check
 */
/**
 * Check if a king is in check
 * @param king - The king to check
 * @param allBasePoints - All pieces on the board
 * @param getTeamFn - Function to get team from color
 * @returns True if the king is in check
 */
export function isKingInCheck(
  king: BasePoint, 
  allBasePoints: BasePoint[],
  getTeamFn: (color: string) => number
): boolean {
  const opponentTeam = getTeamFn(king.color) === 1 ? 2 : 1;
  let isInCheck = false;
  
  // Check each opponent piece to see if it attacks the king
  for (const piece of allBasePoints) {
    const pieceTeam = getTeamFn(piece.color);
    
    // Skip pieces that aren't opponents or are the king itself
    if (pieceTeam !== opponentTeam || (piece.x === king.x && piece.y === king.y)) {
      continue;
    }
    
    console.log(`Checking if ${piece.pieceType} at (${piece.x},${piece.y}) can attack king at (${king.x},${king.y})`);
    const canAttack = canPieceAttack(piece, king.x, king.y, allBasePoints, getTeamFn);
    
    if (canAttack) {
      console.log(`King is in check from ${piece.pieceType} at (${piece.x},${piece.y})`);
      isInCheck = true;
      break;
    }
  }
  
  return isInCheck;
}

export function wouldResolveCheck(
  from: [number, number],
  to: [number, number],
  color: string,
  allBasePoints: BasePoint[],
  getTeamFn: (color: string) => number,
  isSquareUnderAttackFn: (x: number, y: number, team: number, points: BasePoint[], getTeam: (color: string) => number) => boolean,
  isSquareBetweenFn: (from: {x: number, y: number}, to: {x: number, y: number}, x: number, y: number) => boolean
): boolean {
  const currentTeam = getTeamFn(color);

  // Find the king of the current player (exact color match)
  const king = allBasePoints.find(p => {
    const isKing = p.pieceType === 'king' && p.color === color;
    return isKing;
  });
  
  // If no king found, can't be in check
  if (!king) {
    console.log(`[King Check] No king found for team ${currentTeam}`);
    return true;
  }
  
  // Check if the king is currently in check
  console.log(`[King Check] Checking if king at (${king.x},${king.y}) is in check`);
  const currentCheck = isKingInCheck(king, allBasePoints, getTeamFn);
  if (!currentCheck) {
    console.log(`[King Check] King at (${king.x},${king.y}) is not in check, move is allowed`);
    return true;
  }
  
  console.log(`[King Check] King at (${king.x},${king.y}) is in check, verifying move...`);
  
  const movingPiece = allBasePoints.find(bp => bp.x === from[0] && bp.y === from[1]);
  if (!movingPiece) {
    console.log(`[King Check] No piece found at (${from[0]},${from[1]})`);
    return false;
  }

  // If the piece being moved is the king, check if the new position is safe
  if (movingPiece.pieceType === 'king') {
    const newPositionSafe = !isSquareUnderAttackFn(to[0], to[1], getTeamFn(color) === 1 ? 2 : 1, allBasePoints, getTeamFn);
    console.log(`[King Check] Moving king to (${to[0]},${to[1]}) - position is ${newPositionSafe ? 'safe' : 'under attack'}`);
    return newPositionSafe;
  }

  // Reuse the king variable that was already found at the start of the function
  // If we got here, king should be defined since we already checked !king earlier

  // Get all squares that are attacking the king
  const attackers = allBasePoints.filter(attacker => 
    getTeamFn(attacker.color) !== getTeamFn(color) &&
    canPieceAttack(attacker, king.x, king.y, allBasePoints)
  );

  console.log(`[King Check] Found ${attackers.length} attackers targeting the king at (${king.x},${king.y})`);
  attackers.forEach((attacker, i) => {
    console.log(`[King Check] Attacker ${i+1}: ${attacker.pieceType} at (${attacker.x},${attacker.y})`);
  });

  // If there are multiple attackers, only a king move can resolve check
  if (attackers.length > 1) {
    console.log(`[King Check] Multiple attackers detected, only king moves can resolve check`);
    return false;
  }

  const attacker = attackers[0];
  // Check if the move captures the attacker
  if (to[0] === attacker.x && to[1] === attacker.y) {
    // If the attacker is a king, allow capturing it even if in check
    if (attacker.pieceType === 'king') {
      console.log(`[King Check] Move captures enemy king at (${attacker.x},${attacker.y}) - check resolved`);
      return true;
    }
    // For other pieces, check if this capture resolves the check
    console.log(`[King Check] Move captures attacker (${attacker.pieceType}) at (${attacker.x},${attacker.y}) - check resolved`);
    return true;
  }

  // Check if the move blocks the attack
  const blocksAttack = isSquareBetweenFn(attacker, king, to[0], to[1]);
  if (blocksAttack) {
    console.log(`[King Check] Move to (${to[0]},${to[1]}) blocks the attack from (${attacker.x},${attacker.y})`);
    return true;
  }

  return false;
}

/**
 * Validates if a piece can be placed or moved to a specific square
 * @param index - The index of the target square
 * @param basePoints - Array of all base points on the board
 * @param userBasePoints - Array of base points belonging to the current user
 * @param pickedUp - The coordinates of the picked up piece [x, y] or null if placing a new piece
 * @param restrictedSquaresInfo - Array of restricted squares information
 * @param getRestrictedSquares - Function that returns array of restricted square indices
 * @param kingInCheck - Function that returns the current check status
 * @param getTeam - Function to get team from color
 * @param isSquareUnderAttack - Function to check if a square is under attack
 * @param wouldResolveCheck - Function to check if a move would resolve check
 * @param isSquareBetween - Function to check if a square is between two other squares in a straight line
 * @returns Object with validation result and optional reason for failure
 */
export function validateSquarePlacement(
  index: number,
  basePoints: () => BasePoint[],
  userBasePoints: BasePoint[],
  pickedUp: [number, number] | null,
  restrictedSquaresInfo: () => RestrictedSquareInfo[],
  getRestrictedSquares: () => number[],
  kingInCheck: () => { team: number } | null,
  getTeam: (color: string) => number,
  isSquareUnderAttack: (x: number, y: number, team: number, points: BasePoint[], getTeamFn: (color: string) => number) => boolean,
  wouldResolveCheck: (from: [number, number], to: [number, number], color: string, allBasePoints: BasePoint[], getTeamFn: (color: string) => number, isSquareUnderAttackFn: any, isSquareBetweenFn: any) => boolean,
  isSquareBetween: (from: {x: number, y: number}, to: {x: number, y: number}, x: number, y: number) => boolean
): { isValid: boolean; reason?: string } {
  // Get the target position in world coordinates
  const gridX = index % BOARD_CONFIG.GRID_SIZE;
  const gridY = Math.floor(index / BOARD_CONFIG.GRID_SIZE);
    
  // If we're moving a base point
  if (pickedUp) {
    const [startX, startY] = pickedUp;
    const movingPiece = userBasePoints.find(bp => bp.x === startX && bp.y === startY);
    
    if (!movingPiece) {
      return { isValid: false, reason: 'Piece not found' };
    }

    // First check if this is a valid capture move based on server response
    const restrictionInfo = restrictedSquaresInfo().find(sq => {
      const [sqX, sqY] = [sq.index % BOARD_CONFIG.GRID_SIZE, Math.floor(sq.index / BOARD_CONFIG.GRID_SIZE)];
      return sqX === gridX && sqY === gridY;
    });
    
    const isRestrictedByPickedUp = restrictionInfo?.restrictedBy?.some(
      restriction => 
        restriction.basePointX === pickedUp[0] && 
        restriction.basePointY === pickedUp[1]
    ) ?? false;

    // If this is a restricted square (including captures), check if it's a valid move
    if (isRestrictedByPickedUp) {
      // Check if the move captures an enemy king
      const targetPiece = basePoints().find(bp => bp.x === gridX && bp.y === gridY);
      const isCapturingEnemyKing = targetPiece?.pieceType === 'king' && getTeam(targetPiece.color) !== getTeam(movingPiece.color);
      
      // If not capturing an enemy king, apply normal check rules
      if (!isCapturingEnemyKing) {
        // If the piece being moved is a king, check if the target square is under attack
        if (movingPiece.pieceType === 'king') {
          const opponentTeam = getTeam(movingPiece.color) === 1 ? 2 : 1;

          if (isSquareUnderAttack(gridX, gridY, opponentTeam, basePoints(), getTeam)) {
            return {
              isValid: false,
              reason: `Cannot move king into check ${gridX}, ${gridY} ${movingPiece.color}`
            };
          }
        }
        
        // If the current player's king is in check, verify the move resolves it
        const currentCheck = kingInCheck();
        if (currentCheck && getTeam(movingPiece.color) === currentCheck.team) {
          if (!wouldResolveCheck(
            [startX, startY], 
            [gridX, gridY], 
            movingPiece.color,
            basePoints(),
            getTeam,
            isSquareUnderAttack,
            isSquareBetween
          )) {
            return { 
              isValid: false, 
              reason: 'You must move your king out of check, block the check, or capture the threatening piece' 
            };
          }
        }
      }
      
      return { isValid: true };
    }

    // If not a restricted square, check for friendly pieces
    if (userBasePoints.some(bp => 
      bp.x === gridX && 
      bp.y === gridY && 
      !(bp.x === pickedUp[0] && bp.y === pickedUp[1])
    )) {
      return { isValid: false, reason: 'You already have a base point here' };
    }
    
    // If we get here, it's not a restricted square and not occupied by a friendly piece
    return { 
      isValid: false, 
      reason: 'Base points can only be moved to squares they restrict' 
    };
  }
  
  // For new base points, check if the user already has a base point at the target position
  if (userBasePoints.some(bp => bp.x === gridX && bp.y === gridY)) {
    return { isValid: false, reason: 'You already have a base point here' };
  }
  
  // For new base points, they can only be placed on restricted squares
  if (!getRestrictedSquares().includes(index)) {
    return { 
      isValid: false, 
      reason: 'Base points can only be placed on restricted squares' 
    };
  }
  
  return { isValid: true };
}

export function getLegalMoves(
  basePoint: BasePoint,
  allBasePoints: BasePoint[],
  options: {
    isKingInCheck?: boolean;
    wouldResolveCheck?: (
      from: [number, number],
      to: [number, number],
      color: string,
      allBasePoints: BasePoint[],
      getTeamFn: (color: string) => number,
      isSquareUnderAttackFn: any,
      isSquareBetweenFn: any
    ) => boolean;
    isSquareUnderAttack?: (x: number, y: number, team: number, points: BasePoint[], getTeamFn: (color: string) => number) => boolean;
    isSquareBetween?: (from: {x: number, y: number}, to: {x: number, y: number}, x: number, y: number) => boolean;
    getTeamFn?: (color: string) => number;
  } = {}
): Array<{x: number, y: number, canCapture: boolean, isCastle?: boolean, castleType?: string}> {

  const { 
    isKingInCheck = false, 
    wouldResolveCheck,
    isSquareUnderAttack,
    isSquareBetween,
    getTeamFn = getTeamByColor
  } = options;

  const pieceType = basePoint.pieceType || 'pawn'; // Default to pawn if not specified
  console.log(`--- getLegalMoves --- ${pieceType}`)
  const team = getTeamByColor(basePoint.color);
  let possibleMoves: Array<{x: number, y: number, canCapture: boolean, isCastle?: boolean, castleType?: string}> = [];
  
  if (pieceType === 'queen') {
    // Queen moves any number of squares in any direction
    const directions = [
      [0, 1],   // up
      [1, 0],   // right
      [0, -1],  // down
      [-1, 0],  // left
      [1, 1],   // up-right
      [1, -1],  // down-right
      [-1, -1], // down-left
      [-1, 1]   // up-left
    ];
    
    possibleMoves = directions.flatMap(([dx, dy]) => 
      getSquaresInDirection(basePoint.x, basePoint.y, dx, dy, allBasePoints, team)
    );
  } else if (pieceType === 'king') {
    // Standard king moves (1 square in any direction)
    const standardMoves = [
      [0, 1],   // up
      [1, 0],   // right
      [0, -1],  // down
      [-1, 0],  // left
      [1, 1],   // up-right
      [1, -1],  // down-right
      [-1, -1], // down-left
      [-1, 1]   // up-left
    ].map(([dx, dy]) => {
      const x = basePoint.x + dx;
      const y = basePoint.y + dy;

      // Check if the move is within board bounds
      if (x < 0 || x >= BOARD_CONFIG.GRID_SIZE || y < 0 || y >= BOARD_CONFIG.GRID_SIZE) {
        return null;
      }
      
      // Check if the square is occupied
      const targetPiece = allBasePoints.find(bp => bp.x === x && bp.y === y);
      
      // If occupied by a teammate, can't move there
      if (targetPiece && getTeamByColor(targetPiece.color) === team) {
        return null;
      }
      
      // If occupied by an enemy, can capture
      const canCapture = targetPiece ? getTeamByColor(targetPiece.color) !== team : false;
      
      return {
        x,
        y,
        canCapture,
        isCastle: false
      };
    }).filter((move): move is { x: number; y: number; canCapture: boolean; isCastle: boolean } => move !== null);

    // Add castling moves if available
    const castlingMoves: Array<{x: number, y: number, canCapture: boolean, isCastle: boolean, castleType: string}> = [];
    const color = basePoint.color?.toUpperCase();
    
    // Get color name from hex code
    const getColorName = (hexColor: string): CastleColor | undefined => {
      const colorMap: Record<string, CastleColor> = {
        '#F44336': 'RED',
        '#FFEB3B': 'YELLOW',
        '#2196F3': 'BLUE',
        '#4CAF50': 'GREEN'
      };
      return colorMap[hexColor.toUpperCase()];
    };
    
    if (color) {
      const colorName = getColorName(color);
      if (!colorName) {
        console.log(`Color not found for castling: ${JSON.stringify(color, null, 2)}`);
        return standardMoves; // Return standard moves without castling
      }
      
      // King-side castling
      const kingSideCastleType: CastleType = `${colorName}_KING_SIDE`;
      if (canCastle(basePoint, allBasePoints, kingSideCastleType, team)) {
        const [dx, dy] = MOVE_PATTERNS.CASTLING[kingSideCastleType];
        castlingMoves.push({
          x: basePoint.x + dx,
          y: basePoint.y + dy,
          canCapture: false,
          isCastle: true,
          castleType: 'KING_SIDE'
        });
      }
      // Queen-side castling
      const queenSideCastleType: CastleType = `${colorName}_QUEEN_SIDE`;
      if (canCastle(basePoint, allBasePoints, queenSideCastleType, team)) {
        const [dx, dy] = MOVE_PATTERNS.CASTLING[queenSideCastleType];
        castlingMoves.push({
          x: basePoint.x + dx,
          y: basePoint.y + dy,
          canCapture: false,
          isCastle: true,
          castleType: 'QUEEN_SIDE'
        });
      }

      
    }
    
    possibleMoves = [...standardMoves, ...castlingMoves];
  } else if (pieceType === 'pawn') {
    const moves: {x: number, y: number, canCapture: boolean}[] = [];
    
    // Determine movement direction based on color
    let dx = 0;
    let dy = 0;
    let isVertical = true;
    let startPosition = 0;
    
    // Determine direction toward center based on starting position
    if (basePoint.color === '#F44336') { // Red - starts at bottom, moves up
      dy = -1; // Move up (decreasing y)
      startPosition = BOARD_CONFIG.GRID_SIZE - 2; // Start near bottom
    } else if (basePoint.color === '#FFEB3B') { // Yellow - starts at top, moves down
      dy = 1; // Move down (increasing y)
      startPosition = 1; // Start near top
    } else if (basePoint.color === '#2196F3') { // Blue - starts at left, moves right
      dx = 1; // Move right (increasing x)
      isVertical = false;
      startPosition = 1; // Start near left
    } else if (basePoint.color === '#4CAF50') { // Green - starts at right, moves left
      dx = -1; // Move left (decreasing x)
      isVertical = false;
      startPosition = BOARD_CONFIG.GRID_SIZE - 2; // Start near right
    }
    
    // Check one square forward
    const oneForward = {
      x: basePoint.x + dx,
      y: basePoint.y + dy,
      canCapture: false
    };
    
    // Skip if the target square is in a non-playable corner
    if (!isInNonPlayableCorner(oneForward.x, oneForward.y)) {
      // Check if one square forward is valid and not occupied
      if (oneForward.x >= 0 && oneForward.x < BOARD_CONFIG.GRID_SIZE &&
          oneForward.y >= 0 && oneForward.y < BOARD_CONFIG.GRID_SIZE &&
          !isSquareOccupied(oneForward.x, oneForward.y, allBasePoints)) {
        moves.push(oneForward);
        
        // Check two squares forward from starting position
        const isAtStartPosition = isVertical 
          ? (basePoint.y === startPosition) 
          : (basePoint.x === startPosition);
          
        if (isAtStartPosition) {
          const twoForward = {
            x: basePoint.x + (2 * dx),
            y: basePoint.y + (2 * dy),
            canCapture: false
          };
          
          if (twoForward.x >= 0 && twoForward.x < BOARD_CONFIG.GRID_SIZE &&
              twoForward.y >= 0 && twoForward.y < BOARD_CONFIG.GRID_SIZE &&
              !isSquareOccupied(twoForward.x, twoForward.y, allBasePoints)) {
            moves.push(twoForward);
          }
        }
      }
    }
    
    // Set up capture directions based on pawn movement
    let captureOffsets;
    
    // For vertically moving pawns (Red and Yellow)
    if (isVertical) {
      captureOffsets = [
        { dx: -1, dy: dy },  // Diagonal left
        { dx: 1, dy: dy }    // Diagonal right
      ];
    } 
    // For horizontally moving pawns (Blue and Green)
    else {
      captureOffsets = [
        { dx: dx, dy: -1 },  // Diagonal up
        { dx: dx, dy: 1 }    // Diagonal down
      ];
    }
    
    for (const offset of captureOffsets) {
      const targetX = basePoint.x + offset.dx;
      const targetY = basePoint.y + offset.dy;
      
      // Check if target square is within bounds
      if (targetX >= 0 && targetX < BOARD_CONFIG.GRID_SIZE && 
          targetY >= 0 && targetY < BOARD_CONFIG.GRID_SIZE) {
        
        // Skip non-playable corners
        if (isInNonPlayableCorner(targetX, targetY)) {
          continue;
        }
        
        // Check if there's an opponent's piece to capture
        const targetPiece = allBasePoints.find(p => p.x === targetX && p.y === targetY);
        if (targetPiece && getTeamByColor(targetPiece.color) !== team) {
          moves.push({
            x: targetX,
            y: targetY,
            canCapture: true
          });
        }
      }
    }
    
    possibleMoves = [...moves];
  } else if (pieceType === 'bishop') {
    // Bishop moves any number of squares diagonally
    const directions = [
      [1, 1],   // up-right
      [1, -1],  // down-right
      [-1, -1], // down-left
      [-1, 1]   // up-left
    ];
    
    possibleMoves = [...directions.flatMap(([dx, dy]) => 
      getSquaresInDirection(basePoint.x, basePoint.y, dx, dy, allBasePoints, team)
    )];
  } else if (pieceType === 'knight') {
    // Knight moves in an L-shape: 2 squares in one direction and then 1 square perpendicular
    const moves = [
      [1, 2],   // right 1, up 2
      [2, 1],   // right 2, up 1
      [2, -1],  // right 2, down 1
      [1, -2],  // right 1, down 2
      [-1, -2], // left 1, down 2
      [-2, -1], // left 2, down 1
      [-2, 1],  // left 2, up 1
      [-1, 2]   // left 1, up 2
    ];

    possibleMoves = [...moves
      .map(([dx, dy]) => {
        const x = basePoint.x + dx;
        const y = basePoint.y + dy;
        
        // Skip if out of bounds
        if (x < 0 || x >= BOARD_CONFIG.GRID_SIZE || y < 0 || y >= BOARD_CONFIG.GRID_SIZE) {
          return null;
        }
        
        // Skip non-playable corners
        if (isInNonPlayableCorner(x, y)) {
          return null;
        }
        
        // Check if the square is occupied
        const targetPiece = allBasePoints.find(bp => bp.x === x && bp.y === y);
        
        // If occupied by a teammate, can't move there
        if (targetPiece && getTeamByColor(targetPiece.color) === team) {
          return null;
        }
        
        // If occupied by an enemy, can capture
        const canCapture = targetPiece ? getTeamByColor(targetPiece.color) !== team : false;
        
        return {
          x,
          y,
          canCapture
        };
      })
      .filter(Boolean) as {x: number, y: number, canCapture: boolean}[]];
  } else {
    // Default movement for any other piece type (like rook)
    const directions = [
      [0, 1],   // up
      [1, 0],   // right
      [0, -1],  // down
      [-1, 0]   // left
    ];
    
    possibleMoves = [...directions.flatMap(([dx, dy]) => 
      getSquaresInDirection(basePoint.x, basePoint.y, dx, dy, allBasePoints, team)
    )];
  }

  // First check if the piece is pinned
  const { isPinned, pinDirection } = isPiecePinned(basePoint, allBasePoints, getTeamFn);

  // If pinned, only allow moves along the pin line
  if (isPinned) {
    const pinDir = pinDirection!;
    possibleMoves = possibleMoves.filter(move => {
      // Knights can't move if pinned
      if (basePoint.pieceType === 'knight') {
        return false;
      }
      const dx = move.x - basePoint.x;
      const dy = move.y - basePoint.y;
      
      // Allow moves along the pin line
      return (dx === 0 && pinDir[0] === 0) ||  // Vertical pin
             (dy === 0 && pinDir[1] === 0) ||  // Horizontal pin
             (dx !== 0 && dy !== 0 && Math.abs(dx / dy) === 1 &&  // Diagonal pin
              Math.sign(dx) === Math.sign(pinDir[0]) && 
              Math.sign(dy) === Math.sign(pinDir[1]));
    });
  }

  // Then filter moves that would leave the king in check
  if (isKingInCheck && wouldResolveCheck && pieceType !== 'king') {
    const playerColor = basePoint.color;
    
    possibleMoves = possibleMoves.filter(move => {
      return wouldResolveCheck(
        [basePoint.x, basePoint.y],
        [move.x, move.y],
        playerColor,
        allBasePoints,
        getTeamByColor,
        isSquareUnderAttack,
        isSquareBetween
      );
    });
  }

  return possibleMoves;
  
}
