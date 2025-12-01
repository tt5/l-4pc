import { getDb } from '~/lib/server/db';
import { BasePointRepository } from '~/lib/server/repositories/base-point.repository';
import { withAuth } from '~/middleware/auth';
import { createErrorResponse, generateRequestId } from '~/utils/api';
import { BOARD_CONFIG, isInNonPlayableCorner } from '~/constants/game';
import { performanceTracker } from '~/utils/performance';

type Point = [number, number];

// Team definitions
const TEAM_1_COLORS = ['#F44336', '#FFEB3B']; // Red and Yellow
const TEAM_2_COLORS = ['#2196F3', '#4CAF50']; // Blue and Green

import type { PieceType } from '~/types/board';

type BasePointWithTeam = {
  id: string | number;
  x: number;
  y: number;
  userId: string;
  color: string;
  team: 1 | 2;
  pieceType: PieceType;
};

interface SquareWithOrigin {
  index: number;
  x: number;
  y: number;
  isRestricted: boolean;
  restrictedBy: Array<{
    basePointId: string | number;
    basePointX: number;
    basePointY: number;
    canCapture: boolean;
  }>;
}

interface CalculateSquaresRequest {
  currentPosition: Point;
  destination: Point;
}

// Determine team based on color
function getTeamByColor(color: string): 1 | 2 {
  return TEAM_1_COLORS.includes(color) ? 1 : 2;
}

// Check if a square is occupied by a base point
function isSquareOccupied(x: number, y: number, basePoints: BasePointWithTeam[]): boolean {
  return basePoints.some(bp => bp.x === x && bp.y === y);
}

// Check if a square is occupied by a teammate
function isTeammate(x: number, y: number, team: number, basePoints: BasePointWithTeam[]): boolean {
  const point = basePoints.find(bp => bp.x === x && bp.y === y);
  return point ? point.team === team : false;
}

// Get all squares in a direction until an obstacle is hit
function getSquaresInDirection(
  startX: number,
  startY: number,
  dx: number,
  dy: number,
  basePoints: BasePointWithTeam[],
  currentTeam: number
): {x: number, y: number, canCapture: boolean}[] {
  const result = [];
  let x = startX + dx;
  let y = startY + dy;
  const directionName = `${dx === 0 ? '' : dx > 0 ? 'right' : 'left'}${dy === 0 ? '' : dy > 0 ? 'down' : 'up'}`.replace('rightleft', 'left').replace('downup', 'up') || 'nowhere';
  
  console.log(`[${startX},${startY}] Scanning ${directionName} direction...`);
  
  while (x >= 0 && x < BOARD_CONFIG.GRID_SIZE && y >= 0 && y < BOARD_CONFIG.GRID_SIZE) {
    // Skip non-playable corner squares
    if (isInNonPlayableCorner(x, y)) {
      console.log(`  [${x},${y}] BLOCKED by non-playable corner`);
      break;
    }
    const occupied = isSquareOccupied(x, y, basePoints);
    const piece = basePoints.find(p => p.x === x && p.y === y);
    const teammate = piece ? piece.team === currentTeam : false;
    
    console.log(`  [${x},${y}]: ${occupied ? `Occupied by ${teammate ? 'TEAMMATE' : 'OPPONENT'}` : 'Empty'}`);
    
    if (occupied) {
      if (!teammate) {
        // Can capture opponent's piece
        console.log(`  [${x},${y}] CAPTURE OPPORTUNITY: ${piece?.color} at [${x},${y}] (team ${piece?.team}) can be captured by team ${currentTeam}`);
        console.log(`  - Piece details:`, piece);
        result.push({x, y, canCapture: true});
      } else {
        console.log(`  [${x},${y}] BLOCKED by ${piece?.color} at [${x},${y}] (team ${piece?.team})`);
        console.log(`  - Current team: ${currentTeam}, Piece team: ${piece?.team}, Same team: ${teammate}`);
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

// Get all legal moves for a base point based on its type
function getLegalMoves(
  basePoint: BasePointWithTeam,
  allBasePoints: BasePointWithTeam[]
): {x: number, y: number, canCapture: boolean}[] {
  const pieceType = basePoint.pieceType || 'pawn'; // Default to pawn if not specified
  
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
    
    return directions.flatMap(([dx, dy]) => 
      getSquaresInDirection(basePoint.x, basePoint.y, dx, dy, allBasePoints, basePoint.team)
    );
  } else if (pieceType === 'king') {
    // King moves one square in any direction, with proper blocking and capture rules
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
    
    return directions.flatMap(([dx, dy]) => {
      // Get just the first square in each direction
      const x = basePoint.x + dx;
      const y = basePoint.y + dy;
      
      // Skip if out of bounds
      if (x < 0 || x >= BOARD_CONFIG.GRID_SIZE || y < 0 || y >= BOARD_CONFIG.GRID_SIZE) {
        return [];
      }
      
      // Check if the square is occupied
      const targetPiece = allBasePoints.find(bp => bp.x === x && bp.y === y);
      
      // If occupied by a teammate, can't move there
      if (targetPiece && targetPiece.team === basePoint.team) {
        return [];
      }
      
      // If occupied by an enemy, can capture
      const canCapture = targetPiece ? targetPiece.team !== basePoint.team : false;
      
      return [{
        x,
        y,
        canCapture
      }];
    });
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
    if (isInNonPlayableCorner(oneForward.x, oneForward.y)) {
      console.log(`[${basePoint.x},${basePoint.y}] Cannot move to non-playable corner at [${oneForward.x},${oneForward.y}]`);
      return [];
    }
    
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
    
    // Capture diagonally in the direction of movement
    let captureOffsets = [
      { dx: dx !== 0 ? dx : -1, dy: dy !== 0 ? dy : -1 },  // Diagonal 1
      { dx: dx !== 0 ? dx : 1, dy: dy !== 0 ? dy : 1 }     // Diagonal 2
    ];
    
    // If moving vertically, allow horizontal captures
    if (isVertical) {
      captureOffsets = [
        { dx: -1, dy: 0 },  // Left
        { dx: 1, dy: 0 }    // Right
      ];
    } else {
      // If moving horizontally, allow vertical captures
      captureOffsets = [
        { dx: 0, dy: -1 },  // Up
        { dx: 0, dy: 1 }    // Down
      ];
    }
    
    for (const offset of captureOffsets) {
      const targetX = basePoint.x + offset.dx;
      const targetY = basePoint.y + offset.dy;
      
      // Check if target square is within bounds
      if (targetX >= 0 && targetX < BOARD_CONFIG.GRID_SIZE && 
          targetY >= 0 && targetY < BOARD_CONFIG.GRID_SIZE) {
        
        // Check if there's an opponent's piece to capture
        const targetPiece = allBasePoints.find(p => p.x === targetX && p.y === targetY);
        if (targetPiece && targetPiece.team !== basePoint.team) {
          moves.push({
            x: targetX,
            y: targetY,
            canCapture: true
          });
        }
      }
    }
    
    return moves;
  } else if (pieceType === 'bishop') {
    // Bishop moves any number of squares diagonally
    const directions = [
      [1, 1],   // up-right
      [1, -1],  // down-right
      [-1, -1], // down-left
      [-1, 1]   // up-left
    ];
    
    return directions.flatMap(([dx, dy]) => 
      getSquaresInDirection(basePoint.x, basePoint.y, dx, dy, allBasePoints, basePoint.team)
    );
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

    return moves.map(([dx, dy]) => {
      const x = basePoint.x + dx;
      const y = basePoint.y + dy;
      
      // Skip if out of bounds
      if (x < 0 || x >= BOARD_CONFIG.GRID_SIZE || y < 0 || y >= BOARD_CONFIG.GRID_SIZE) {
        return null;
      }
      
      // Check if the square is occupied
      const targetPiece = allBasePoints.find(bp => bp.x === x && bp.y === y);
      
      // If occupied by a teammate, can't move there
      if (targetPiece && targetPiece.team === basePoint.team) {
        return null;
      }
      
      // If occupied by an enemy, can capture
      const canCapture = targetPiece ? targetPiece.team !== basePoint.team : false;
      
      return {
        x,
        y,
        canCapture
      };
    }).filter(Boolean) as {x: number, y: number, canCapture: boolean}[]; // Remove null values and assert type
  } else {
    // Default movement for any other piece type (like rook)
    const directions = [
      [0, 1],   // up
      [1, 0],   // right
      [0, -1],  // down
      [-1, 0]   // left
    ];
    
    return directions.flatMap(([dx, dy]) => 
      getSquaresInDirection(basePoint.x, basePoint.y, dx, dy, allBasePoints, basePoint.team)
    );
  }
}

export const POST = withAuth(async ({ request, user }) => {
  const requestId = generateRequestId();
  try {
    let requestBody;
    try {
      requestBody = await request.json();
    } catch (e) {
      throw new Error('Invalid JSON in request body');
    }
    
    if (!requestBody || typeof requestBody !== 'object') {
      throw new Error('Request body must be a JSON object');
    }
    
    const { currentPosition, destination } = requestBody as CalculateSquaresRequest;
    
    const validatePoint = (point: unknown, name: string): point is Point => {
      if (!Array.isArray(point) || point.length !== 2 || 
          typeof point[0] !== 'number' || typeof point[1] !== 'number') {
        throw new Error(`${name} must be a tuple of two numbers [x, y]`);
      }
      return true;
    };
    
    validatePoint(currentPosition, 'currentPosition');
    validatePoint(destination, 'destination');
    
    // Get database connection and initialize repository
    const db = await getDb();
    const basePointRepository = new BasePointRepository(db);
    
    // Get all base points (not just current user's)
    const allBasePoints = (await basePointRepository.getAll()).map(point => {
      const team = getTeamByColor(point.color);
      console.log(`[${point.x},${point.y}]: Color=${point.color}, Team=${team}, User=${point.userId}`);
      return {
        ...point,
        team
      };
    });
    
    console.log('\n=== ALL BASE POINTS ===');
    allBasePoints.forEach(bp => {
      console.log(`- [${bp.x},${bp.y}]: Team ${bp.team} (${bp.color}) - User: ${bp.userId}`);
    });

    // If we're moving a base point, update its position in the array
    const updatedBasePoints = allBasePoints.map(point => {
      // If this is the point being moved (same as currentPosition), use destination
      if (point.x === currentPosition[0] && point.y === currentPosition[1]) {
        return { ...point, x: destination[0], y: destination[1] };
      }
      return point;
    });

    // Get current user's base points
    const currentUserBasePoints = updatedBasePoints.filter(p => p.userId === user.userId);
    
    // For each of the current user's base points, calculate legal moves
    const squaresWithOrigins: SquareWithOrigin[] = [];
    
    console.log('\n=== PROCESSING BASE POINTS ===');
    for (const basePoint of currentUserBasePoints) {
      console.log(`\nProcessing base point [${basePoint.x},${basePoint.y}] - Team ${basePoint.team} (${basePoint.color})`);
      const legalMoves = getLegalMoves(basePoint, updatedBasePoints);
      
      for (const move of legalMoves) {
        const index = move.x + move.y * BOARD_CONFIG.GRID_SIZE;
        const existingSquare = squaresWithOrigins.find(sq => sq.index === index);
        
        const restriction = {
          basePointId: basePoint.id,
          basePointX: basePoint.x,
          basePointY: basePoint.y,
          canCapture: move.canCapture
        };
        
        if (existingSquare) {
          existingSquare.restrictedBy.push(restriction);
        } else {
          squaresWithOrigins.push({
            index,
            x: move.x,
            y: move.y,
            isRestricted: true,
            restrictedBy: [{
              ...restriction,
              canCapture: move.canCapture
            }]
          });
        }
      }
    }
    
    // Add all squares (even unrestricted ones) for consistent response format
    const allSquares = Array.from({length: 196}, (_, i) => {
      const x = i % BOARD_CONFIG.GRID_SIZE;
      const y = Math.floor(i / BOARD_CONFIG.GRID_SIZE);
      const existingSquare = squaresWithOrigins.find(sq => sq.x === x && sq.y === y);
      
      return existingSquare || {
        index: i,
        x,
        y,
        isRestricted: false,
        restrictedBy: [],
        canCapture: false
      };
    });
    
    const responseData = {
      success: true,
      data: {
        squares: allSquares.filter(sq => sq.isRestricted).map(sq => sq.index),
        squaresWithOrigins: allSquares.filter(sq => sq.isRestricted)
      }
    };
    
    return new Response(JSON.stringify(responseData), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const statusCode = error instanceof Error && error.message.includes('must be') ? 400 : 500; // 400 for validation errors
    return createErrorResponse('Failed to calculate squares', statusCode, errorMessage, { requestId });
  }
});
