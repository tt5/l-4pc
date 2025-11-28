import { getDb } from '~/lib/server/db';
import { BasePointRepository } from '~/lib/server/repositories/base-point.repository';
import { withAuth } from '~/middleware/auth';
import { createErrorResponse, generateRequestId } from '~/utils/api';
import { BOARD_CONFIG } from '~/constants/game';
import { performanceTracker } from '~/utils/performance';

type Point = [number, number];

type CalculateSquaresRequest = {
  borderIndices: number[];
  currentPosition: Point;
  destination: Point;
};

// Calculate direction vector from current position to destination
function getDirectionVector(current: Point, destination: Point): Point {
  // Calculate the difference between destination and current position
  const dx = Math.sign(destination[0] - current[0]);
  const dy = Math.sign(destination[1] - current[1]);
  return [dx, dy];
}

export const POST = withAuth(async ({ request, user }) => {
  const requestId = generateRequestId();
  
  const startTime = performance.now();
  
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
    
    const { borderIndices, currentPosition, destination } = requestBody as CalculateSquaresRequest;
    
    // Validate required fields
    if (!Array.isArray(borderIndices)) {
      throw new Error('borderIndices must be an array of numbers');
    }
    
    const validatePoint = (point: unknown, name: string): point is Point => {
      if (!Array.isArray(point) || point.length !== 2 || 
          typeof point[0] !== 'number' || typeof point[1] !== 'number') {
        throw new Error(`${name} must be a tuple of two numbers [x, y]`);
      }
      return true;
    };
    
    validatePoint(currentPosition, 'currentPosition');
    validatePoint(destination, 'destination');
    
    // Calculate direction vector
    const [dx, dy] = getDirectionVector(currentPosition, destination);
    
    // Track request start
    const dbStartTime = performance.now();
    
    // Get database connection and initialize repository
    const db = await getDb();
    const basePointRepository = new BasePointRepository(db);
    
    // Get base points and remove duplicates
    const basePoints = await basePointRepository.getAll();
    if (!Array.isArray(basePoints)) {
      throw new Error(`Expected basePoints to be an array, got ${typeof basePoints}`);
    }

    const uniqueBasePoints = basePoints.length > 0 
      ? [...new Map(basePoints.map(p => [`${p.x},${p.y}`, p])).values()]
      : [{ x: 0, y: 0, userId: 'default' }];
    
    const newSquares = Array.from({length: 196}, (_, i) => i).flatMap((i, index) => {
      const x = (i % BOARD_CONFIG.GRID_SIZE);
      const y = Math.floor(i / BOARD_CONFIG.GRID_SIZE);
      
      return uniqueBasePoints.flatMap(({ x: bx, y: by }) => {
        if (bx === x && by === y) return [];
        const xdiff = Math.abs(x - bx);
        const ydiff = Math.abs(y - by);
        
        if (xdiff === 0 || ydiff === 0 || xdiff === ydiff
          ) {
          const nx = x;
          const ny = y;
          
            // Original logic for straight lines and diagonals
            return nx >= 0 && nx < BOARD_CONFIG.GRID_SIZE && ny >= 0 && ny < BOARD_CONFIG.GRID_SIZE 
              ? [nx + ny * BOARD_CONFIG.GRID_SIZE] 
              : [];
        }
        return [];
      });
    });
    
    const responseData = {
      success: true,
      data: {
        squares: newSquares
      }
    };
    
    // Track performance
    const dbTime = performance.now() - dbStartTime;
    const totalTime = performance.now() - startTime;
    
    performanceTracker.track('calculate-squares', totalTime, {
      basePointCount: uniqueBasePoints.length,
      responseSize: JSON.stringify(responseData).length,
      dbTime,
      processingTime: totalTime - dbTime
    });
    
    return new Response(JSON.stringify(responseData), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    });
  } catch (error) {
    console.error(`[${requestId}] Error in calculate-squares:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const statusCode = error instanceof Error && error.message.includes('must be') ? 400 : 500; // 400 for validation errors
    return createErrorResponse('Failed to calculate squares', statusCode, errorMessage, { requestId });
  }
});
