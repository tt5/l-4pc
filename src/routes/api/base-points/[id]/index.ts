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
    if (existingAtTarget && existingAtTarget.id !== basePointId) {
      return createErrorResponse(
        'A base point already exists at these coordinates', 
        409, 
        undefined, 
        { requestId }
      );
    }
    
    // Update the base point
    const updatedPoint = await repository.update(basePointId, data.x, data.y);
    
    if (!updatedPoint) {
      return createErrorResponse('Failed to update base point', 500, undefined, { requestId });
    }
    
    console.log(`[API] Updated base point ${basePointId} to (${data.x}, ${data.y})`);
    
    // Emit update event
    basePointEventService.emitUpdated(updatedPoint);
    
    return createApiResponse({ 
      success: true,
      data: {
        basePoint: updatedPoint
      }
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
