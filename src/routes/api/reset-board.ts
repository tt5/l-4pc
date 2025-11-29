import { getBasePointRepository } from '~/lib/server/db';
import { withAuth } from '~/middleware/auth';
import { createApiResponse, createErrorResponse, generateRequestId } from '~/utils/api';

export const POST = withAuth(async ({ user }) => {
  const requestId = generateRequestId();
  
  try {
    const repository = await getBasePointRepository();
    
    // Delete all base points for the current user
    console.log(`[${requestId}] Resetting board for user:`, user.userId);
    await repository.deleteAllBasePointsForUser(user.userId);
    
    // Add the four default base points at the edges
    await repository.add(user.userId, 7, 0);    // Center top
    await repository.add(user.userId, 13, 7);   // Center right
    await repository.add(user.userId, 6, 13);   // Center bottom
    await repository.add(user.userId, 0, 6);    // Center left
    
    return createApiResponse(
      { 
        success: true, 
        message: 'Board reset to initial state',
        basePoints: [
          { x: 7, y: 0 },
          { x: 13, y: 7 },
          { x: 6, y: 13 },
          { x: 0, y: 6 }
        ]
      },
      { requestId }
    );
  } catch (error) {
    console.error(`[${requestId}] Error resetting board:`, error);
    return createErrorResponse(
      'Failed to reset board',
      500,
      process.env.NODE_ENV === 'development' ? String(error) : undefined,
      { requestId }
    );
  }
});
