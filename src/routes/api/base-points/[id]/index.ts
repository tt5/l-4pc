import { getBasePointRepository } from '~/lib/server/db';
import { withAuth } from '~/middleware/auth';
import { createApiResponse, createErrorResponse, generateRequestId } from '~/utils/api';
import { basePointEventService } from '~/lib/server/events/base-point-events';

export const PATCH = withAuth(async ({ request, params, user }) => {
  const requestId = generateRequestId();
  const basePointId = parseInt(params.id);
  
  if (isNaN(basePointId)) {
    return createErrorResponse('Invalid base point ID', 400, undefined, { requestId });
  }

  try {
    const data = await request.json() as { x: number; y: number };
    
    // Type checking
    if (typeof data.x !== 'number' || typeof data.y !== 'number' || isNaN(data.x) || isNaN(data.y)) {
      return createErrorResponse('Coordinates must be valid numbers', 400, undefined, { requestId });
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
    
    // First, verify the base point exists and belongs to the user
    const existingPoint = await repository.getById(basePointId);
    if (!existingPoint) {
      return createErrorResponse('Base point not found', 404, undefined, { requestId });
    }
    
    if (existingPoint.userId !== user.userId) {
      return createErrorResponse('Unauthorized', 403, undefined, { requestId });
    }
    
    // Check if there's already a base point at the target coordinates
    const existingAtTarget = await repository.findByCoordinates(data.x, data.y);
    
    // If there's a piece at the target and it's not the current piece
    if (existingAtTarget && existingAtTarget.id !== basePointId) {
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
    
    // Update the base point
    const updatedPoint = await repository.update(basePointId, data.x, data.y);
    
    if (!updatedPoint) {
      return createErrorResponse('Failed to update base point', 500, undefined, { requestId });
    }
    
    console.log(`[API] Updated base point ${basePointId} to (${data.x}, ${data.y})`);
    
    // Emit update event with proper data structure for SSE
    const updateEvent = {
      type: 'basePoint:updated',
      point: {
        id: updatedPoint.id,
        x: updatedPoint.x,
        y: updatedPoint.y,
        userId: updatedPoint.userId,
        createdAtMs: updatedPoint.createdAtMs || Date.now()
      }
    };
    
    // Emit through both the event service and broadcast to SSE
    basePointEventService.emitUpdated(updatedPoint);
    basePointEventService.broadcast('message', updateEvent);
    
    return createApiResponse({ 
      success: true,
      data: updatedPoint
    }, { requestId });
    
  } catch (error) {
    console.error(`[API] Error updating base point ${basePointId}:`, error);
    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to update base point',
      500,
      undefined,
      { requestId }
    );
  }
});
