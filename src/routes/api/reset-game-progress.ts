import { getBasePointRepository } from '~/lib/server/db';
import { withAuth } from '~/middleware/auth';
import { createApiResponse, createErrorResponse, generateRequestId, type ApiResponse } from '~/utils/api';

export const POST = withAuth(async ({ user }) => {
  const requestId = generateRequestId();
  
  // Only allow in development
  if (process.env.NODE_ENV !== 'development') {
    return createErrorResponse('Not allowed', 403, 'This endpoint is only available in development', { requestId });
  }

  try {
    const repository = await getBasePointRepository();
    
    // Delete all base points for the current user
    console.log('Deleting all base points for user:', user.userId);
    await repository.deleteAllBasePointsForUser(user.userId);
    
    return createApiResponse(
      { success: true, message: 'Game progress reset successfully' },
      { requestId }
    );
  } catch (error) {
    console.error(`[${requestId}] Error resetting game progress:`, error);
    return createErrorResponse(
      'Failed to reset game progress',
      500,
      process.env.NODE_ENV === 'development' ? String(error) : undefined,
      { requestId }
    );
  }
});
