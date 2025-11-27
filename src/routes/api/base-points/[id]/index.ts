import { getBasePointRepository } from '~/lib/server/db';
import { withAuth } from '~/middleware/auth';
import { createApiResponse, createErrorResponse, generateRequestId } from '~/utils/api';
import { basePointEventService } from '~/lib/server/events/base-point-events';

export const PATCH = withAuth(async ({ request, params, user }) => {
  const requestId = generateRequestId();
  const basePointId = parseInt(params.id);
  
  if (isNaN(basePointId)) {
    return new Response(
      JSON.stringify(createErrorResponse('Invalid base point ID', 400, undefined, { requestId })),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const data = await request.json() as { x: number; y: number };
    
    // Type checking
    if (typeof data.x !== 'number' || typeof data.y !== 'number' || isNaN(data.x) || isNaN(data.y)) {
      throw new Error('Coordinates must be valid numbers');
    }
    
    // Check if coordinates are integers
    if (!Number.isInteger(data.x) || !Number.isInteger(data.y)) {
      throw new Error('Coordinates must be whole numbers');
    }
    
    // Check for reasonable bounds to prevent abuse
    const MAX_COORDINATE = 1000;
    if (Math.abs(data.x) > MAX_COORDINATE || Math.abs(data.y) > MAX_COORDINATE) {
      throw new Error(`Coordinates must be between -${MAX_COORDINATE} and ${MAX_COORDINATE}`);
    }
    
    const repository = await getBasePointRepository();
    
    // First, verify the base point exists and belongs to the user
    const existingPoint = await repository.getById(basePointId);
    if (!existingPoint) {
      return new Response(
        JSON.stringify(createErrorResponse('Base point not found', 404, undefined, { requestId })),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    if (existingPoint.userId !== user.userId) {
      return new Response(
        JSON.stringify(createErrorResponse('Unauthorized', 403, undefined, { requestId })),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Update the base point
    const updatedPoint = await repository.update(basePointId, data.x, data.y);
    
    if (!updatedPoint) {
      return new Response(
        JSON.stringify(createErrorResponse('Failed to update base point', 500, undefined, { requestId })),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Emit update event
    basePointEventService.emitUpdated(updatedPoint);
    
    const response = createApiResponse({ basePoint: updatedPoint }, { requestId });
    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorResponse = createErrorResponse(
      error instanceof Error ? error.message : 'Failed to update base point',
      500,
      undefined,
      { requestId }
    );
    return new Response(
      JSON.stringify(errorResponse),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
