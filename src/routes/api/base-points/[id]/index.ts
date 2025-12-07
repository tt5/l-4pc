import { getBasePointRepository, getMoveRepository } from '~/lib/server/db';
import { withAuth } from '~/middleware/auth';
import { createApiResponse, createErrorResponse, generateRequestId } from '~/utils/api';
import { basePointEventService } from '~/lib/server/events/base-point-events';

interface UpdateBasePointRequest {
  x: number;
  y: number;
  moveNumber?: number;
  branchName?: string | null;
  isNewBranch?: boolean;
  gameId?: string;
}

export const PATCH = withAuth(async ({ request, params, user }) => {
  const requestId = generateRequestId();
  const basePointId = parseInt(params.id);
  
  console.log(`[${requestId}] [PATCH /api/base-points/${basePointId}] Starting request processing`, {
    userId: user.userId,
    requestData: { ...request, body: '[REDACTED]' } // Don't log full request body
  });
  
  if (isNaN(basePointId)) {
    const errorMsg = `Invalid base point ID: ${params.id}`;
    console.error(`[${requestId}] ${errorMsg}`);
    return createErrorResponse(errorMsg, 400, undefined, { requestId });
  }

  try {
    const data = await request.json() as UpdateBasePointRequest;
    console.log(`[${requestId}] Request data:`, { 
      x: data.x, 
      y: data.y, 
      moveNumber: data.moveNumber,
      isNewBranch: data.isNewBranch,
      hasBranchName: !!data.branchName,
      hasGameId: !!data.gameId
    });
    
    // Type checking
    if (typeof data.x !== 'number' || typeof data.y !== 'number' || isNaN(data.x) || isNaN(data.y)) {
      const errorMsg = `Invalid coordinates: x=${data.x}, y=${data.y}`;
      console.error(`[${requestId}] ${errorMsg}`);
      return createErrorResponse(errorMsg, 400, undefined, { requestId });
    }
    
    // Check if coordinates are integers
    if (!Number.isInteger(data.x) || !Number.isInteger(data.y)) {
      return createErrorResponse('Coordinates must be whole numbers', 400, undefined, { requestId });
    }
    
    // Check for reasonable bounds to prevent abuse
    const MAX_COORDINATE = 1000;
    if (Math.abs(data.x) > MAX_COORDINATE || Math.abs(data.y) > MAX_COORDINATE) {
      return createErrorResponse(
        `Coordinates must be between -${MAX_COORDINATE} and ${MAX_COORDINATE}`, 
        400, 
        undefined, 
        { requestId }
      );
    }
    
    const repository = await getBasePointRepository();
    const moveRepository = await getMoveRepository();
    
    // First, verify the base point exists and belongs to the user
    const existingPoint = await repository.getById(basePointId);
    if (!existingPoint) {
      return createErrorResponse('Base point not found', 404, undefined, { requestId });
    }
    
    if (existingPoint.userId !== user.userId) {
      return createErrorResponse('Unauthorized', 403, undefined, { requestId });
    }

    // If this is a new branch, update all base points to their positions at the branch point
    if (data.isNewBranch && data.branchName && data.gameId && data.moveNumber !== undefined) {
      console.log(`[${requestId}] Processing new branch creation`, {
        branchName: data.branchName,
        gameId: data.gameId,
        moveNumber: data.moveNumber
      });
      
      try {
        // Get all moves up to the current move in the main branch
        console.log(`[${requestId}] Fetching moves for game ${data.gameId} up to move ${data.moveNumber}`);
        const mainBranchMoves = await moveRepository.getMovesForGame(data.gameId, null, data.moveNumber);
        console.log(`[${requestId}] Found ${mainBranchMoves.length} moves in main branch`);
        
        // Track the latest position of each piece by their starting position
        const positionsByPiece = new Map<string, {x: number, y: number}>();
        
        // Process moves in order to build up the board state
        for (const [index, move] of mainBranchMoves.entries()) {
          // Use the from coordinates as the key to track each piece
          const pieceKey = `${move.fromX},${move.fromY}`;
          const newPosition = { x: move.toX, y: move.toY };
          // Update the piece's position to the move's destination
          positionsByPiece.set(pieceKey, newPosition);
          
          if (index < 5 || index === mainBranchMoves.length - 1) { // Log first 5 and last move
            console.log(`[${requestId}] Move ${index + 1}/${mainBranchMoves.length}: ${pieceKey} -> ${newPosition.x},${newPosition.y}`);
          } else if (index === 5) {
            console.log(`[${requestId}] ... and ${mainBranchMoves.length - 6} more moves`);
          }
        }
      
      try {
        // Update all base points to their positions at the branch point
        console.log(`[${requestId}] Starting transaction to update base points for new branch`);
        await repository.executeTransaction(async (db) => {
          const allBasePoints = await repository.getAll();
          console.log(`[${requestId}] Found ${allBasePoints.length} base points to potentially update`);
          
          let updatedCount = 0;
          // Update base points based on the final positions of pieces
          for (const [pieceKey, position] of positionsByPiece.entries()) {
            const [x, y] = pieceKey.split(',').map(Number);
            // Find the base point at the piece's final position
            const basePoint = allBasePoints.find(
              bp => bp.x === x && bp.y === y
            );
            
            if (basePoint) {
              console.log(`[${requestId}] Moving piece from (${x},${y}) to (${position.x},${position.y})`);
              // Update the base point to the piece's new position
              await repository.update(basePoint.id, position.x, position.y);
              updatedCount++;
            } else {
              console.warn(`[${requestId}] No base point found at position (${x},${y})`);
            }
          }
          console.log(`[${requestId}] Successfully updated ${updatedCount} base points for new branch`);
      });
    }
    
    // Check if there's already a base point at the target coordinates
    console.log(`[${requestId}] Checking for existing piece at target coordinates (${data.x},${data.y})`);
    const existingAtTarget = await repository.findByCoordinates(data.x, data.y);
    
    // If there's a piece at the target and it's not the current piece
    if (existingAtTarget && existingAtTarget.id !== basePointId) {
      console.log(`[${requestId}] Found existing piece at target coordinates`, {
        targetPieceId: existingAtTarget.id,
        targetPieceType: existingAtTarget.pieceType,
        targetPieceColor: existingAtTarget.color,
        currentPieceId: basePointId
      });
      console.log(`[API] Found existing base point at (${data.x}, ${data.y}):`, {
        id: existingAtTarget.id,
        userId: existingAtTarget.userId,
        currentUserId: user.userId,
        isSameUser: existingAtTarget.userId === user.userId,
        color: existingAtTarget.color,
        existingPointColor: existingPoint.color
      });
      
      // Helper function to determine team based on color
      const getTeam = (color: string): number => {
        const TEAM_1_COLORS = ['#F44336', '#FFEB3B']; // Red and Yellow
        return TEAM_1_COLORS.includes(color.toUpperCase()) ? 1 : 2;
      };
      
      // Check if the pieces are on the same team using colors
      if (existingAtTarget.color && existingPoint.color && 
          getTeam(existingAtTarget.color) === getTeam(existingPoint.color)) {
        console.log(`[API] Cannot capture pieces on the same team at (${data.x}, ${data.y})`);
        return createErrorResponse(
          'Cannot capture pieces on the same team', 
          409, 
          undefined, 
          { requestId }
        );
      }
      
      // It's an opponent's piece - capture it by deleting it
      console.log(`[API] Capturing base point ${existingAtTarget.id} at (${data.x}, ${data.y})`);
      const deleteResult = await repository.delete(existingAtTarget.id);
      console.log(`[API] Capture result for ${existingAtTarget.id}:`, deleteResult ? 'Success' : 'Failed');
    }
    
    // Update the base point's position
    console.log(`[${requestId}] Updating base point ${basePointId} from (${existingPoint.x},${existingPoint.y}) to (${data.x},${data.y})`);
    const updatedPoint = await repository.update(basePointId, data.x, data.y);
    
    // Create a move record
    const moveData = {
      basePointId,
      fromX: existingPoint.x,
      fromY: existingPoint.y,
      toX: data.x,
      toY: data.y,
      userId: user.userId,
      pieceType: existingPoint.pieceType,
      moveNumber: data.moveNumber,
      isBranch: data.isNewBranch || false,
      branchName: data.branchName || null
    };
    
    console.log(`[${requestId}] Creating move record:`, {
      ...moveData,
      pieceType: existingPoint.pieceType // Log the actual piece type
    });
    
    const move = await moveRepository.create(moveData);
    console.log(`[${requestId}] Successfully created move ${move.id}`);
    
    const responseData = {
      ...updatedPoint,
      // Emit an event for real-time updates
      _event: basePointEventService.createEvent('update', updatedPoint, {
        userId: user.userId,
        moveId: move.id,
        isBranch: data.isNewBranch || false,
        branchName: data.branchName || null
      })
    };
    
    console.log(`[${requestId}] Successfully processed move. Sending response.`);
    return createApiResponse(responseData);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error(`[${requestId}] Error updating base point:`, {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      basePointId,
      userId: user.userId
    });
    
    return createErrorResponse(
      errorMessage,
      500,
      undefined,
      { 
        requestId,
        error: errorMessage,
        ...(error instanceof Error ? { stack: error.stack } : {})
      }
    );
  } finally {
    console.log(`[${requestId}] Completed PATCH /api/base-points/${basePointId}`);
  }
});
