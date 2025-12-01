import { getDb } from '~/lib/server/db';
import { BasePointRepository } from '~/lib/server/repositories/base-point.repository';
import { withAuth } from '~/middleware/auth';
import { createErrorResponse, generateRequestId } from '~/utils/api';
import { BOARD_CONFIG } from '~/constants/game';
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
    const direction = basePoint.team === 1 ? 1 : -1; // Team 1 moves up (increasing y), Team 2 moves down (decreasing y)
    const startRow = basePoint.team === 1 ? 1 : BOARD_CONFIG.GRID_SIZE - 2; // Starting row for each team
    
    // Check one square forward
    const oneForward = {
      x: basePoint.x,
      y: basePoint.y + direction,
      canCapture: false
    };
    
    // Check if one square forward is valid and not occupied
    if (oneForward.y >= 0 && oneForward.y < BOARD_CONFIG.GRID_SIZE && 
        !isSquareOccupied(oneForward.x, oneForward.y, allBasePoints)) {
      moves.push(oneForward);
      
      // Check two squares forward from starting position
      if (basePoint.y === startRow) {
        const twoForward = {
          x: basePoint.x,
          y: basePoint.y + (2 * direction),
          canCapture: false
        };
        
        if (twoForward.y >= 0 && twoForward.y < BOARD_CONFIG.GRID_SIZE && 
            !isSquareOccupied(twoForward.x, twoForward.y, allBasePoints)) {
          moves.push(twoForward);
        }
      }
    }
    
    // Check diagonal captures
    const captureOffsets = [
      { dx: -1, dy: direction },  // Left diagonal
      { dx: 1, dy: direction }    // Right diagonal
    ];
    
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
