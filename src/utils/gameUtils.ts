import { isInNonPlayableCorner, BOARD_CONFIG } from '~/constants/game';
import { MOVE_PATTERNS, PIECE_TYPES } from '~/constants/movePatterns';
import { type BasePoint, type PieceType, type Move, type LegalMove, type Point, createPoint, NamedColor, Color, HexColor } from '~/types/board';

export type CastleType = `${NamedColor}_${'KING_SIDE' | 'QUEEN_SIDE'}`;

export type EightDirections = 
    [0, 1]|   // up
    [1, 0]|   // right
    [0, -1]|  // down
    [-1, 0]|  // left
    [1, 1]|   // up-right
    [1, -1]|  // down-right
    [-1, -1]| // down-left
    [-1, 1]   // up-left
  

/**
 * Converts a move object to UCI (Universal Chess Interface) format
 * @param move - The move to convert
 * @returns The move in UCI format (e.g., 'a2a4')
 */
export function moveToUCI(move: Move): string {
  const fromFile = String.fromCharCode(97 + move.fromX);
  const fromRank = (14 - move.fromY).toString();
  const toFile = String.fromCharCode(97 + move.toX);
  const toRank = (14 - move.toY).toString();
  return `${fromFile}${fromRank}${toFile}${toRank}`;
}

/**
 * Type guard for PieceType
 * @param str - The string to check
 * @returns True if the string is a valid PieceType
 */
export function isValidPieceType(str: string): str is PieceType {
  return ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'].includes(str);
}

export function isSquareOccupied(target: Point, basePoints: BasePoint[]): boolean {
  return basePoints.some(point => point.x === target[0] && point.y === target[1]);
}

export const COLOR_MAP: Record<NamedColor, HexColor> = {
  'RED': '#F44336',
  'BLUE': '#2196F3',
  'YELLOW': '#FFEB3B',
  'GREEN': '#4CAF50'
};

export function colorToHex(color: NamedColor): HexColor | undefined {
  if (!color) return undefined;
  return COLOR_MAP[color];
}

export function getSquaresInDirection(
  start: Point,
  directionStep: EightDirections,
  allBasePoints: BasePoint[],
  team: 1 | 2
): LegalMove[] {
  const result: LegalMove[] = [];
  let x = start[0] + directionStep[0];
  let y = start[1] + directionStep[1];
  
  while (x >= 0 && x < BOARD_CONFIG.GRID_SIZE && y >= 0 && y < BOARD_CONFIG.GRID_SIZE) {
    // Skip non-playable corner squares
    if (isInNonPlayableCorner(x, y)) {
      break;
    }
    
    const occupied = isSquareOccupied(createPoint(x, y), allBasePoints);
    const piece = allBasePoints.find(p => p.x === x && p.y === y);
    const teammate = piece ? piece.team === team : false;
    
    if (occupied) {
      if (!teammate) {
        // Can capture opponent's piece
        result.push({x, y, canCapture: true});
      }
      break;
    }
    
    // Add empty square
    result.push({x, y, canCapture: false});
    x += directionStep[0];
    y += directionStep[1];
  }
  
  return result;
}

export function isPathClear(
  a: Point,
  b: Point,
  allBasePoints: BasePoint[]
): boolean {
  /*
  bishop, rook, queen

  Math.sign() returns:
  1 if the number is positive (moving right/down)
  -1 if the number is negative (moving left/up)
  0 if the number is zero (no movement in that direction)
  */
  const dx = Math.sign(b[0] - a[0]);
  const dy = Math.sign(b[1] - a[1]);
  let x = a[0] + dx;
  let y = a[1] + dy;

  // Only check up to, but not including, the end position
  while (!(x === b[0] && y === b[1])) {
    if (allBasePoints.some(p => p.x === x && p.y === y)) {
      return false;
    }
    x += dx;
    y += dy;
  }

  return true;
}

export function canPieceAttack(
  piece: BasePoint, 
  target: Point,
  allBasePoints: BasePoint[],
): boolean {
  const dx = Math.abs(piece.x - target[0]);
  const dy = Math.abs(piece.y - target[1]);
  
  const pieceTeam = piece.team;
  const from = createPoint(piece.x, piece.y);
  
  /*
  // King movement (1 square in any direction)
  if (piece.pieceType === 'king') {
    return dx <= 1 && dy <= 1;
  }
  */
  
  // Queen movement (any number of squares in any direction)
  if (piece.pieceType === 'queen') {
    // Check if moving in a straight line or diagonal
    if (piece.x === target[0] || piece.y === target[1] || Math.abs(dx) === Math.abs(dy)) {
      const isClear = isPathClear(from, target, allBasePoints);
      return isClear
    }
    return false;
  }

  // Rook movement (any number of squares horizontally or vertically)
  if (piece.pieceType === 'rook') {
    if (piece.x === target[0] || piece.y === target[1]) {
      return isPathClear(from, target, allBasePoints);
    }
    return false;
  }

  // Bishop movement (any number of squares diagonally)
  if (piece.pieceType === 'bishop') {
    if (dx === dy) {
      return isPathClear(from, target, allBasePoints);
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
    const targetPiece = allBasePoints.find(p => p.x === target[0] && p.y === target[1]);
    if (targetPiece) {
      const targetTeam = targetPiece.team;
      
      // Only consider it a valid attack if the target is an opponent's piece
      if (targetTeam !== pieceTeam) {
        // For team 1 (red), pawns move up (decreasing y)
        if (pieceTeam === 1 && target[1] < piece.y) return true;
        // For team 2 (blue), pawns move down (increasing y)
        if (pieceTeam === 2 && target[1] > piece.y) return true;
      }
    }
    return false;
  }
  
  return false;
}

export function isSquareBetween(
  from: Point, 
  to: Point, 
  between: Point
): boolean {
  // Check if all three points are in a straight line
  const dx1 = to[0] - from[0];
  const dy1 = to[1] - from[1];
  const dx2 = between[0] - from[0];
  const dy2 = between[1] - from[1];
  
  // If not in a straight line, return false
  if (dx1 * dy2 !== dx2 * dy1) return false;
  
  // Check if (x,y) is between from and to (exclusive)
  const isBetweenX = (from[0] <= between[0] && between[0] <= to[0]) || (from[0] >= between[0] && between[0] >= to[0]);
  const isBetweenY = (from[1] <= between[1] && between[1] <= to[1]) || (from[1] >= between[1] && between[1] >= to[1]);
  
  return isBetweenX && isBetweenY && (between[0] !== from[0] || between[1] !== from[1]) && (between[0] !== to[0] || between[1] !== to[1]);
}

export function isSquareUnderAttack(
  target: Point,
  attackingTeam: 1 | 2, 
  allBasePoints: BasePoint[],
): boolean {
  return allBasePoints.some(attacker => {
    // Skip if this is a piece on the target square (can't attack its own square)
    if (attacker.x === target[0] && attacker.y === target[1]) {
      return false;
    }
    if (attacker.team !== attackingTeam) return false;
    return canPieceAttack(attacker, target, allBasePoints);
  });
}

function canPieceAttackThroughLine(
  attacker: BasePoint,
  pinnedPiece: BasePoint,
  king: BasePoint,
  allBasePoints: BasePoint[],
): boolean {
  
  // Calculate direction from pinned piece to king
  const dx = Math.sign(king.x - pinnedPiece.x);
  const dy = Math.sign(king.y - pinnedPiece.y);

  // Check if attacker is on the same line as the pin
  const isOnPinLine = 
    (dx === 0 && attacker.x === pinnedPiece.x) || // Vertical line
    (dy === 0 && attacker.y === pinnedPiece.y) || // Horizontal line
    (dx !== 0 && dy !== 0 && 
     Math.abs(attacker.x - pinnedPiece.x) === Math.abs(attacker.y - pinnedPiece.y)); // Diagonal line

  if (!isOnPinLine) {
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
    return false;
  }

  // Check for pieces between the attacker and the pinned piece
  const stepX = Math.sign(pinnedPiece.x - attacker.x);
  const stepY = Math.sign(pinnedPiece.y - attacker.y);
  let checkX = attacker.x + stepX;
  let checkY = attacker.y + stepY;
  
  while (checkX !== pinnedPiece.x || checkY !== pinnedPiece.y) {
    if (allBasePoints.some(p => p.x === checkX && p.y === checkY)) {
      return false;
    }
    checkX += stepX;
    checkY += stepY;
  }

  // Check if attacker's piece type can attack through this line
  const attackerType = attacker.pieceType;
  
  if (attackerType === 'queen') {
    return true;
  } else if (attackerType === 'rook' && (dx === 0 || dy === 0)) {
    return true;
  } else if (attackerType === 'bishop' && dx !== 0 && dy !== 0) {
    return true;
  } else if (attackerType === 'pawn') {
    // Pawns can only attack one square diagonally forward
    const isDiagonal = dx !== 0 && dy !== 0;
    const isForwardForPawn = (attacker.color === king.color) ? 
      (pinnedPiece.y > attacker.y) : (pinnedPiece.y < attacker.y);
    const isAdjacent = Math.abs(attacker.x - pinnedPiece.x) === 1 && 
                      Math.abs(attacker.y - pinnedPiece.y) === 1;
    
    const canAttack = isDiagonal && isForwardForPawn && isAdjacent;
    return canAttack;
  }

  return false;
}

export function isPiecePinned(
  piece: BasePoint,
  allBasePoints: BasePoint[],
): { isPinned: boolean; pinDirection?: [number, number] } {
  // Find the king of the same color
  const king = allBasePoints.find(p => 
    p.pieceType === 'king' && 
    p.color === piece.color
  );
  
  if (!king) {
    return { isPinned: false };
  }

  // Calculate direction from piece to king
  const dx = king.x - piece.x;
  const dy = king.y - piece.y;

  // Check if piece is aligned with king (same rank, file, or diagonal)
  const isAligned = dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy);
  
  if (!isAligned) {
    return { isPinned: false };
  }
  
  const stepX = dx === 0 ? 0 : dx > 0 ? 1 : -1;
  const stepY = dy === 0 ? 0 : dy > 0 ? 1 : -1;

  // Check for any pieces between the piece and the king
  let checkX = piece.x + stepX;
  let checkY = piece.y + stepY;
  while (checkX !== king.x || checkY !== king.y) {
    if (allBasePoints.some(p => p.x === checkX && p.y === checkY)) {
      return { isPinned: false }; // There's a piece between, so not pinned
    }
    checkX += stepX;
    checkY += stepY;
  }

  // Look for an attacking piece in the opposite direction (away from king)
  let x = piece.x - stepX;
  let y = piece.y - stepY;
  let foundAttacker = false;

  while (x >= 0 && x < BOARD_CONFIG.GRID_SIZE && y >= 0 && y < BOARD_CONFIG.GRID_SIZE) {
    const pieceInLine = allBasePoints.find(p => p.x === x && p.y === y);
    
    if (pieceInLine) {
      // Only consider pieces that can attack through the line (queen, rook, bishop)
      const isAttacker = pieceInLine.team !== piece.team && 
                       ['queen', 'rook', 'bishop'].includes(pieceInLine.pieceType);
      
      if (isAttacker) {
        // Check if the attacker can attack through the line
        const canAttack = canPieceAttackThroughLine(pieceInLine, piece, king, allBasePoints);
        if (canAttack) {
          foundAttacker = true;
        }
      }
      break;
    }
    
    x -= stepX;
    y -= stepY;
  }

  if (!foundAttacker) {
    return { isPinned: false };
  }

  return { 
    isPinned: true, 
    pinDirection: [stepX, stepY] as [number, number] 
  };
}

export function isKingInCheck(
  king: BasePoint, 
  allBasePoints: BasePoint[],
): boolean {
  const opponentTeam = king.team === 1 ? 2 : 1;
  let isInCheck = false;
  
  // Check each opponent piece to see if it attacks the king
  for (const piece of allBasePoints) {
    const pieceTeam = piece.team;
    
    if (pieceTeam === opponentTeam) {
    
      const canAttack = canPieceAttack(piece, createPoint(king.x, king.y), allBasePoints);
      
      if (canAttack) {
        isInCheck = true;
        break;
      }
    }
  }
  
  return isInCheck;
}

export function wouldResolveCheck(
  movingPiece: BasePoint,
  to: Point,
  color: Color,
  allBasePoints: BasePoint[],
): boolean {

  const team = movingPiece.team;
  const king = allBasePoints.find(p => {
    const isKing = p.pieceType === 'king' && p.color === color;
    return isKing;
  });
  
  if (!king) {
    return true;
  }
  
  // this is necessary! 
  const currentCheck = isKingInCheck(king, allBasePoints);
  if (!currentCheck) {
    return true;
  }
  
  // If the piece being moved is the king, check if the new position is safe
  if (movingPiece.pieceType === 'king') {
    return !isSquareUnderAttack(to, team === 1 ? 2 : 1, allBasePoints);
  }

  // Get all squares that are attacking the king
  const attackers = allBasePoints.filter(attacker => 
    attacker.team !== team &&
    canPieceAttack(attacker, createPoint(king.x, king.y), allBasePoints)
  );

  // If there are multiple attackers, only a king move can resolve check
  if (attackers.length > 1) {
    return false;
  }

  const attacker = attackers[0];
  // Check if the move captures the attacker
  if (to[0] === attacker.x && to[1] === attacker.y) {
    // the move must be legal (not pinned)
    return true;
  }

  // Check if the move blocks the attack from queen, rook or bishop
  const blocksAttack = isSquareBetween(createPoint(attacker.x, attacker.y), createPoint(king.x, king.y), to);
  if (blocksAttack) {
    // the move must be legal (not pinned)
    return true;
  }

  return false;
}

export function getLegalMoves(
  basePoint: BasePoint,
  allBasePoints: BasePoint[],
  options: {
    enPassantTarget?: Record<NamedColor, {x: number, y: number, color: NamedColor} | null>;
  } = {}
): LegalMove[] {

  const from = createPoint(basePoint.x, basePoint.y);
  const pieceType = basePoint.pieceType
  const team = basePoint.team;
  const color = basePoint.color;
  let possibleMoves: LegalMove[] = [];

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
      getSquaresInDirection(from, [dx, dy] as EightDirections, allBasePoints, team)
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
      const isCapture = targetPiece && targetPiece.team !== team;
      
      // If occupied by a teammate, can't move there
      if (targetPiece && targetPiece.team === team) {
        return null;
      }
      
      return {
        x,
        y,
        canCapture: isCapture,
        isCastle: false
      };
    }).filter((move): move is { x: number; y: number; canCapture: boolean; isCastle: boolean } => {
      if (!move) return false;
      
      return true;
    });

    // Add castling moves if available
    const castlingMoves = [];
    
    if (color) {
      
      // King-side castling
      const kingSideCastleType: CastleType = `${color}_KING_SIDE`;
      if (canCastle(basePoint, allBasePoints, kingSideCastleType)) {
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
      const queenSideCastleType: CastleType = `${color}_QUEEN_SIDE`;
      if (canCastle(basePoint, allBasePoints, queenSideCastleType)) {
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
    // Add en passant capture if available
    const enPassantTargets = options.enPassantTarget || {};
    
    // Check all en passant targets for valid captures
    for (const [colorEP, currentEnPassantTarget]
       of Object.entries(enPassantTargets) as [NamedColor, {x: number, y: number, color: NamedColor} | null][]
      ) {
      if (!currentEnPassantTarget || colorEP === color) continue;
      
      // For en passant, the target should be adjacent to the pawn
      const dx = Math.abs(currentEnPassantTarget.x - basePoint.x);
      const dy = Math.abs(currentEnPassantTarget.y - basePoint.y);
      
      // Check if the pawn is in position to capture en passant
      const isVertical = basePoint.team === 1;
      const isHorizontal = basePoint.team === 2;
      
      // For en passant, we need to check diagonal adjacency (dx=1, dy=1)
      // since the capturing pawn moves diagonally to capture
      const isAdjacent = (isVertical && dx === 1 && dy === 1) || 
                        (isHorizontal && dx === 1 && dy === 1);
      
      if (isAdjacent) {
        // Add the en passant capture move
        // The actual capture square is one square behind the target in the direction of movement
        let captureX = currentEnPassantTarget.x;
        let captureY = currentEnPassantTarget.y;
        
        // Determine the captured pawn's position based on movement direction
        if (isVertical) {
          captureX += (color === 'RED' ? -1 : 1);
        } else {
          captureY += (color === 'BLUE' ? -1 : 1);
        }
        
        possibleMoves.push({
          x: currentEnPassantTarget.x,
          y: currentEnPassantTarget.y,
          canCapture: true,
          isEnPassant: true,
          capturedPiece: {
            x: captureX,
            y: captureY,
            color: currentEnPassantTarget.color as NamedColor,
            pieceType: 'pawn'
          }
        });
      }
    }
    // Determine movement direction based on color
    let dx = 0;
    let dy = 0;
    let isVertical = true;
    let startPosition = 0;
    const moves: LegalMove[] = [];
    
    // Determine direction toward center based on starting position
    if (color === 'RED') { // Red - starts at bottom, moves up
      dy = -1; // Move up (decreasing y)
      startPosition = BOARD_CONFIG.GRID_SIZE - 2; // Start near bottom
    } else if (color === 'YELLOW') { // Yellow - starts at top, moves down
      dy = 1; // Move down (increasing y)
      startPosition = 1; // Start near top
    } else if (color === 'BLUE') { // Blue - starts at left, moves right
      dx = 1; // Move right (increasing x)
      isVertical = false;
      startPosition = 1; // Start near left
    } else if (color === 'GREEN') { // Green - starts at right, moves left
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
          !isSquareOccupied(createPoint(oneForward.x, oneForward.y), allBasePoints)) {
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
              !isSquareOccupied(createPoint(twoForward.x, twoForward.y), allBasePoints)) {
            moves.push(twoForward);
          }
        }
      }
    }
    
    // Set up capture directions based on pawn movement
    let captureOffsets: Array<{dx: number, dy: number}> = [];
    
    // Set capture directions based on pawn color
    if (color === 'RED') { // Red - moves up
      captureOffsets = [
        { dx: -1, dy: -1 },  // Left-up
        { dx: 1, dy: -1 }    // Right-up
      ];
    } else if (color === 'YELLOW') { // Yellow - moves down
      captureOffsets = [
        { dx: -1, dy: 1 },   // Left-down
        { dx: 1, dy: 1 }     // Right-down
      ];
    } else if (color === 'BLUE') { // Blue - moves right
      captureOffsets = [
        { dx: 1, dy: -1 },   // Right-up
        { dx: 1, dy: 1 }     // Right-down
      ];
    } else if (color === 'GREEN') { // Green - moves left
      captureOffsets = [
        { dx: -1, dy: -1 },  // Left-up
        { dx: -1, dy: 1 }    // Left-down
      ];
    }
    
    // First process capture moves into a separate array
    const captureMoves = [];
    
    for (const offset of captureOffsets) {
      const captureX = basePoint.x + offset.dx;
      const captureY = basePoint.y + offset.dy;
      
      // Check if target square is within bounds
      if (captureX >= 0 && captureX < BOARD_CONFIG.GRID_SIZE && 
          captureY >= 0 && captureY < BOARD_CONFIG.GRID_SIZE) {
        
        // Skip non-playable corners
        if (isInNonPlayableCorner(captureX, captureY)) {
          continue;
        }
        
        // Check if there's an opponent's piece to capture
        const targetPiece = allBasePoints.find(p => {
          const isSamePosition = p.x === captureX && p.y === captureY;
          return isSamePosition;
        });
        
        if (targetPiece) {
          const targetTeam = targetPiece.team;
          
          if (targetTeam !== team) {
            captureMoves.push({
              x: captureX,
              y: captureY,
              canCapture: true
            });
          } else {
          }
        }
      }
    }

    // Combine all possible moves: standard moves, en passant moves, and capture moves
    possibleMoves = [...moves, ...possibleMoves, ...captureMoves];

  } else if (pieceType === 'bishop') {
    // Bishop moves any number of squares diagonally
    const directions = [
      [1, 1],   // up-right
      [1, -1],  // down-right
      [-1, -1], // down-left
      [-1, 1]   // up-left
    ];
    
    possibleMoves = [...directions.flatMap(([dx, dy]) => 
      getSquaresInDirection(from, [dx, dy] as EightDirections, allBasePoints, team)
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
        if (targetPiece && targetPiece.team === team) {
          return null;
        }
        
        // If occupied by an enemy, can capture
        const canCapture = targetPiece ? targetPiece.team !== team : false;
        
        return {
          x,
          y,
          canCapture
        };
      })
      .filter(Boolean) as LegalMove[]];
  } else {
    // Default movement for any other piece type (like rook)
    const directions = [
      [0, 1],   // up
      [1, 0],   // right
      [0, -1],  // down
      [-1, 0]   // left
    ];
    
    possibleMoves = [...directions.flatMap(([dx, dy]) => 
      getSquaresInDirection(from, [dx, dy] as EightDirections, allBasePoints, team)
    )];
  }

  // First check if the piece is pinned
  const { isPinned, pinDirection } = isPiecePinned(basePoint, allBasePoints);

  if (isPinned) {
    const pinDir = pinDirection!;
    
    // For bishops, rooks, and queens, allow movement along the pin line
    if (['bishop', 'rook', 'queen'].includes(basePoint.pieceType)) {
      possibleMoves = possibleMoves.filter(move => {
        const dx = move.x - basePoint.x;
        const dy = move.y - basePoint.y;
        
        // Allow moves along the pin line (both directions for bishops, rooks, and queens)
        return (dx === 0 && pinDir[0] === 0) ||  // Vertical
               (dy === 0 && pinDir[1] === 0) ||  // Horizontal
               (dx !== 0 && dy !== 0 && Math.abs(dx) === Math.abs(dy) &&  // Diagonal
                ((Math.sign(dx) === Math.sign(pinDir[0]) && Math.sign(dy) === Math.sign(pinDir[1])) ||  // Same direction
                 (Math.sign(dx) === -Math.sign(pinDir[0]) && Math.sign(dy) === -Math.sign(pinDir[1])))); // Opposite direction
      });
    } 
    // For other pieces (pawns, kings), only allow moves away from the king
    else {
      possibleMoves = possibleMoves.filter(move => {
        // Knights can't move if pinned
        if (basePoint.pieceType === 'knight') {
          return false;
        }
        
        const dx = move.x - basePoint.x;
        const dy = move.y - basePoint.y;
        
        // Only allow moves along the pin line in the direction away from the king
        return (dx === 0 && pinDir[0] === 0) ||  // Vertical
               (dy === 0 && pinDir[1] === 0) ||  // Horizontal
               (dx !== 0 && dy !== 0 && Math.abs(dx) === Math.abs(dy) &&  // Diagonal
                Math.sign(dx) === Math.sign(pinDir[0]) && 
                Math.sign(dy) === Math.sign(pinDir[1]));
      });
    }
  }

  // Then filter moves that would leave the king in check
  if (pieceType !== 'king') {
    // moves are legal (not pinned)
    possibleMoves = possibleMoves.filter(move => {
      return wouldResolveCheck(
        basePoint,
        createPoint(move.x, move.y),
        color,
        allBasePoints,
      );
    });
  }

  return possibleMoves;
}

// Track moved pieces for castling
export const movedPieces = new Set<number>();

// Helper to get piece key for tracking
export const getPieceKey = (piece: BasePoint): number => {
  return piece.id;
};

export const trackPieceMovement = (piece: BasePoint): void => {
  const pieceKey = getPieceKey(piece);
  movedPieces.add(pieceKey);
};

export const resetMovedPieces = (): void => {
  movedPieces.clear();
};

export const canCastle = (
  king: BasePoint,
  allBasePoints: BasePoint[],
  castleType: CastleType,
): boolean => {

  // Check if king has moved - we'll rely on the movedPieces set
  const kingKey = getPieceKey(king);
  if (movedPieces.has(kingKey)) {
    return false;
  }

  const opponentTeam = king.team === 1 ? 2 : 1;
  if (isSquareUnderAttack(createPoint(king.x, king.y), opponentTeam, allBasePoints)) {
    return false;
  }

  const castlingConfig = MOVE_PATTERNS.CASTLING[castleType];
  
  if (!castlingConfig) {
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
    return false;
  }

  const rookKey = getPieceKey(rook);
  if (movedPieces.has(rookKey)) {
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
    const occupied = isSquareOccupied(createPoint(x, y), allBasePoints);

    const opponentTeam = king.team === 1 ? 2 : 1;
    const underAttack = isSquareUnderAttack(createPoint(x, y), opponentTeam, allBasePoints);
    
    if (occupied || underAttack) {
      return false;
    }
    x += stepX || 0;
    y += stepY || 0;
  }

  return true;
};