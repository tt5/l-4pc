import { getBasePointRepository, getMoveRepository } from '~/lib/server/db';
import { withAuth } from '~/middleware/auth';
import { createApiResponse, createErrorResponse, generateRequestId } from '~/utils/api';
import { basePointEventService } from '~/lib/server/events/base-point-events';

// Helper function to determine team based on color
function getTeam(color: string): number {
  const TEAM_1_COLORS = ['#F44336', '#FFEB3B']; // Red and Yellow (Team 1)
  return TEAM_1_COLORS.includes(color.toUpperCase()) ? 1 : 2; // Blue and Green are Team 2
}


interface UpdateBasePointRequest {
  x: number;
  y: number;
  moveNumber?: number;
  branchName?: string | null;
  isNewBranch?: boolean;
  gameId?: string;
  fromX?: number;  // Source X coordinate for branch moves
  fromY?: number;  // Source Y coordinate for branch moves
}

export const PATCH = withAuth(async ({ request, params, user }) => {
  const requestId = generateRequestId();
  const basePointId = parseInt(params.id);
  
  console.log(`[${requestId}] ====== BASE POINT UPDATE REQUEST ======`);
  console.log(`[${requestId}] [PATCH /api/base-points/${basePointId}] Starting request processing`, {
    userId: user.userId,
    requestMethod: request.method,
    requestUrl: request.url,
    requestHeaders: Object.fromEntries(request.headers.entries())
  });
  
  if (isNaN(basePointId)) {
    const errorMsg = `Invalid base point ID: ${params.id}`;
    console.error(`[${requestId}] ${errorMsg}`);
    return createErrorResponse(errorMsg, 400, undefined, { requestId });
  }
  
  console.log(`[${requestId}] Base point ID:`, basePointId);
  console.log(`[${requestId}] Request URL:`, request.url);

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
    
    // Log all base points before lookup
    console.log(`[${requestId}] Fetching all base points...`);
    const allBasePoints = await repository.getAll();
    console.log(`[${requestId}] Found ${allBasePoints.length} base points in database:`);
    allBasePoints.forEach((bp, index) => {
      console.log(`  [${index}] ID: ${bp.id}, Type: ${bp.pieceType}, Pos: (${bp.x},${bp.y}), User: ${bp.userId}`);
    });
    
    // For branch creation, we need to find the piece by coordinates instead of ID
    // since we might be working with a historical position
    let existingPoint;
    
    if (data.isNewBranch) {
      // When creating a new branch, find the piece at the source coordinates
      if (data.moveNumber === undefined) {
        console.error(`[${requestId}] moveNumber is required for branch creation`);
        return createErrorResponse('moveNumber is required for branch creation', 400, undefined, { requestId });
      }
      
      // Use provided fromX/fromY if available, otherwise calculate based on move number
      const fromX = data.fromX ?? (data.x - (data.moveNumber % 2 === 0 ? 1 : 0));
      const fromY = data.fromY ?? (data.y - (data.moveNumber % 2 === 0 ? 0 : 1));
      
      console.log(`[${requestId}] Looking for piece at coordinates (${fromX},${fromY}) for branch move (moveNumber: ${data.moveNumber})`);
      const piecesAtPosition = allBasePoints.filter(
        bp => bp.x === fromX && bp.y === fromY
      );
      
      if (piecesAtPosition.length === 0) {
        const errorMsg = `No piece found at source position (${fromX},${fromY}) for branch move`;
        console.error(`[${requestId}] ${errorMsg}`);
        return createErrorResponse(errorMsg, 404, undefined, { requestId });
      }
      
      existingPoint = piecesAtPosition[0];
      console.log(`[${requestId}] Found piece for branch move:`, {
        id: existingPoint.id,
        type: existingPoint.pieceType,
        color: existingPoint.color
      });
    } else {
      // For regular moves, use the ID-based lookup
      console.log(`[${requestId}] Looking up base point with ID:`, basePointId);
      existingPoint = await repository.getById(basePointId);
      console.log(`[${requestId}] Base point lookup result:`, existingPoint ? 'Found' : 'Not found');
      
      if (!existingPoint) {
        console.error(`[${requestId}] Base point ${basePointId} not found in database`);
        return createErrorResponse(
          'Base point not found', 
          404, 
          { 
            basePointId,
            availableIds: allBasePoints.map(bp => bp.id).sort((a, b) => a - b) 
          },
          { requestId }
        );
      }
      
      if (existingPoint.userId !== user.userId) {
        return createErrorResponse('Unauthorized', 403, undefined, { requestId });
      }
    }

    // If this is a new branch, update all base points to their positions at the branch point
    if (data.isNewBranch && data.branchName && data.gameId && data.moveNumber !== undefined) {
      try {
        console.log(`[${requestId}] === BRANCH CREATION DEBUG ===`);
        console.log(`[${requestId}] Requested to move base point ${basePointId} to (${data.x},${data.y})`);
        
        // Get all base points
        const allBasePoints = await repository.getAll();
        console.log(`[${requestId}] All base points (${allBasePoints.length} total):`);
        allBasePoints.forEach(bp => {
          console.log(`  - ID: ${bp.id}, Type: ${bp.pieceType}, Pos: (${bp.x},${bp.y}), Color: ${bp.color}`);
        });

        // Get all moves up to the current move in the main branch
        console.log(`[${requestId}] Fetching moves for game ${data.gameId} up to move ${data.moveNumber - 1}`);
        const mainBranchMoves = await moveRepository.getMovesForGame(data.gameId, null, data.moveNumber - 1);
        console.log(`[${requestId}] Found ${mainBranchMoves.length} moves in main branch`);

        // Create a transaction for the branch creation
        const executeBranchCreation = async () => {
          // First, reset all pieces to their initial positions
          console.log(`[${requestId}] Resetting board to initial state`);
          await repository.resetBoardToInitialState();

          // Replay all moves up to the branch point
          console.log(`[${requestId}] Replaying ${mainBranchMoves.length} moves to reach branch point`);
          for (const move of mainBranchMoves) {
            // Find the piece at the move's source coordinates
            const pieceToMove = await repository.findByCoordinates(move.fromX, move.fromY);
            if (pieceToMove) {
              // Move the piece to the destination
              await repository.update(pieceToMove.id, move.toX, move.toY);
              
              // Handle captures
              if (move.capturedPieceId) {
                await repository.delete(move.capturedPieceId);
              }
            }
          }

          // Now handle the new branch move
          console.log(`[${requestId}] Applying branch move from (${existingPoint.x},${existingPoint.y}) to (${data.x},${data.y})`);
          
          // Check if the target square is occupied
          const targetPiece = await repository.findByCoordinates(data.x, data.y);
          if (targetPiece) {
            // If it's an opponent's piece, capture it
            if (getTeam(targetPiece.color) !== getTeam(existingPoint.color)) {
              console.log(`[${requestId}] Capturing opponent's piece at (${data.x},${data.y})`);
              await repository.delete(targetPiece.id);
            } else {
              // If it's a friendly piece, we have a problem
              console.error(`[${requestId}] Cannot move to (${data.x},${data.y}) - occupied by friendly piece`);
              throw new Error('Cannot move to a square occupied by a friendly piece');
            }
          }

          // Move the piece to the new position
          await repository.update(existingPoint.id, data.x, data.y);

          // Validate gameId is provided
          if (!data.gameId) {
            throw new Error('gameId is required to create a move');
          }

          // Create the branch move record
          const moveData = {
            gameId: data.gameId,
            basePointId: existingPoint.id,
            fromX: existingPoint.x,
            fromY: existingPoint.y,
            toX: data.x,
            toY: data.y,
            userId: user.userId,
            pieceType: existingPoint.pieceType,
            moveNumber: data.moveNumber,
            isBranch: true,
            branchName: data.branchName,
            capturedPieceId: targetPiece?.id
          };
          
          const move = await moveRepository.create(moveData);
          console.log(`[${requestId}] Created branch move:`, move.id);

          return {
            ...existingPoint,
            x: data.x,
            y: data.y,
            _event: {
              type: 'branch_created',
              moveId: move.id,
              branchName: data.branchName,
              basePointId: existingPoint.id
            }
          };
        };

        // Execute the branch creation within a transaction
        const result = await repository.executeTransaction(async () => {
          return await executeBranchCreation();
        });

        return createApiResponse(result);
      } catch (error) {
        console.error(`[${requestId}] Error creating branch:`, error);
        return createErrorResponse(
          error instanceof Error ? error.message : 'Failed to create branch',
          500,
          undefined,
          { requestId }
        );
      }
    }
    
    // Check if there's already a base point at the target coordinates (excluding the current piece)
    console.log(`[${requestId}] Checking for existing piece at target coordinates (${data.x},${data.y}), excluding piece ${basePointId}`);
    const existingAtTarget = await repository.findByCoordinates(data.x, data.y, basePointId);
    
    // If there's a piece at the target and it's not the current piece
    if (existingAtTarget) {
      console.log(`[${requestId}] Found existing piece at target coordinates`, {
        targetPieceId: existingAtTarget.id,
        targetPieceType: existingAtTarget.pieceType,
        targetPieceColor: existingAtTarget.color,
        currentPieceId: basePointId
      });
      
      // Get teams for both pieces
      const targetTeam = getTeam(existingAtTarget.color);
      const currentTeam = getTeam(existingPoint.color);
      
      console.log(`[${requestId}] Team check:`, {
        targetPiece: { id: existingAtTarget.id, color: existingAtTarget.color, team: targetTeam },
        movingPiece: { id: basePointId, color: existingPoint.color, team: currentTeam },
        sameTeam: targetTeam === currentTeam
      });
      
      // If the pieces are on the same team, prevent the move
      if (targetTeam === currentTeam) {
        console.log(`[${requestId}] Cannot move to (${data.x},${data.y}) - occupied by friendly piece`);
        return createErrorResponse(
          'Cannot move to a square occupied by a friendly piece',
          409,
          undefined,
          { requestId }
        );
      }
      
      // It's an opponent's piece - capture it by deleting it
      console.log(`[${requestId}] Capturing opponent's piece at (${data.x},${data.y})`);
      const deleteResult = await repository.delete(existingAtTarget.id);
      console.log(`[${requestId}] Capture result for ${existingAtTarget.id}:`, deleteResult ? 'Success' : 'Failed');
      
      if (!deleteResult) {
        console.error(`[${requestId}] Failed to capture piece ${existingAtTarget.id}`);
        return createErrorResponse(
          'Failed to capture opponent\'s piece',
          500,
          undefined,
          { requestId }
        );
      }
    }
    
    // Update the base point's position
    console.log(`[${requestId}] Updating base point ${basePointId} from (${existingPoint.x},${existingPoint.y}) to (${data.x},${data.y})`);
    const updatedPoint = await repository.update(basePointId, data.x, data.y);
    
    if (!updatedPoint) {
      return createErrorResponse('Failed to update base point', 500, undefined, { requestId });
    }
    
    // Create a move record
    // Add validation for gameId
    if (!data.gameId) {
      return createErrorResponse('gameId is required', 400, requestId);
    }

    const moveData = {
      gameId: data.gameId,
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
    
    // Check if this move already exists
    const existingMove = await moveRepository.findExistingMove({
      gameId: data.gameId,
      fromX: existingPoint.x,
      fromY: existingPoint.y,
      toX: data.x,
      toY: data.y,
      moveNumber: data.moveNumber || 0
    });

    let moveId;
    if (existingMove) {
      console.log(`[${requestId}] Move already exists with ID:`, existingMove.id);
      moveId = existingMove.id;
    } else {
      console.log(`[${requestId}] Creating move record:`, {
        ...moveData,
        pieceType: existingPoint.pieceType // Log the actual piece type
      });
      
      const move = await moveRepository.create(moveData);
      console.log(`[${requestId}] Successfully created move ${move.id}`);
      moveId = move.id;
    }
    
    // Emit the update event
    basePointEventService.emitUpdated(updatedPoint);
    
    const responseData = {
      ...updatedPoint,
      // Include the move ID and other metadata in the response
      _event: {
        type: 'update',
        moveId: moveId,
        isBranch: data.isNewBranch || false,
        branchName: data.branchName || null
      }
    };
    
    console.log(`[${requestId}] Successfully processed move. Sending response.`);
    return createApiResponse(responseData);
  } catch (error) {
    console.error(`[${requestId}] Error in PATCH /api/base-points/${basePointId}:`, error);
    return createErrorResponse(
      'An error occurred while processing your request',
      500,
      { 
        requestId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    );
  }
});
