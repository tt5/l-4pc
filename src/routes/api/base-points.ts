import { getBasePointRepository } from '~/lib/server/db';
import { withAuth } from '~/middleware/auth';
import { createApiResponse, createErrorResponse, generateRequestId, type ApiResponse } from '~/utils/api';
import { basePointEventService } from '~/lib/server/events/base-point-events';

type BasePointRequest = { x: number; y: number };

const MAX_COORDINATE = 1000; // Reasonable limit to prevent abuse
const VIEW_RADIUS = 20; // Fetch points within this radius of the current position

const validateCoordinates = (x: number, y: number) => {
  // Type checking
  if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) {
    throw new Error('Coordinates must be valid numbers');
  }
  
  // Check if coordinates are integers
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    throw new Error('Coordinates must be whole numbers');
  }
  
  // Check for reasonable bounds to prevent abuse
  if (Math.abs(x) > MAX_COORDINATE || Math.abs(y) > MAX_COORDINATE) {
    throw new Error(`Coordinates must be between -${MAX_COORDINATE} and ${MAX_COORDINATE}`);
  }
};

const handleApiError = (error: unknown, requestId: string, endpoint: string) => {
  if (error instanceof Error) {
    if (error.message === 'Invalid coordinates provided' || error.message.includes('out of bounds')) {
      return createErrorResponse('Invalid request', 400, error.message, { requestId });
    }
    if (error.message === 'Unauthorized') {
      return createErrorResponse('Authentication required', 401, undefined, { requestId });
    }
  }
  
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`[${requestId}] Error in ${endpoint}:`, error);
  return createErrorResponse(
    `Failed to process request`,
    500,
    process.env.NODE_ENV === 'development' ? errorMessage : undefined,
    { requestId }
  );
};

export const GET = withAuth(async ({ request }) => {
  const requestId = generateRequestId();
  const url = new URL(request.url);
  const x = parseInt(url.searchParams.get('x') || '0');
  const y = parseInt(url.searchParams.get('y') || '0');

  try {
    const repository = await getBasePointRepository();
    let basePoints = await repository.getAll();
    
    // Filter base points to only those within the view radius
    if (!isNaN(x) && !isNaN(y)) {
      basePoints = basePoints.filter(point => {
        const dx = point.x - x;
        const dy = point.y - y;
        return Math.abs(dx) <= VIEW_RADIUS && Math.abs(dy) <= VIEW_RADIUS;
      });
    }
    
    return createApiResponse({ basePoints }, { requestId });
  } catch (error) {
    return handleApiError(error, requestId, 'GET /api/base-points');
  }
});

export const POST = withAuth(async ({ request, user }) => {
  const requestId = generateRequestId();
  
  try {
    const data = await request.json() as BasePointRequest;
    validateCoordinates(data.x, data.y);
    
    const repository = await getBasePointRepository();
    const basePoint = await repository.add(
      user.userId,
      data.x,
      data.y
    );
    
    // Emit event after successful creation
    basePointEventService.emitCreated(basePoint);
    
    return createApiResponse({ basePoint }, { status: 201, requestId });
  } catch (error) {
    return handleApiError(error, requestId, 'POST /api/base-points');
  }
});

export const DELETE = withAuth(async ({ user }) => {
  const requestId = generateRequestId();
  
  try {
    const repository = await getBasePointRepository();
    const userId = user.userId;
    
    // Delete all base points for the current user
    await repository.deleteAllBasePointsForUser(userId);
    
    // Notify about the deletion with a dummy base point
    // The client will handle the deletion of all points for this user
    basePointEventService.emitDeleted({
      id: -1, // Dummy ID since we're deleting all points
      userId,
      x: 0,
      y: 0,
      createdAtMs: Date.now()
    });
    
    return createApiResponse({
      success: true,
      message: 'All base points deleted successfully',
      requestId
    });
  } catch (error) {
    return handleApiError(error, requestId, 'DELETE /api/base-points');
  }
});
