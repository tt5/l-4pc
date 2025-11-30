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
    
    // Add all base points with their correct types
    // Yellow pieces
    await repository.add(user.userId, 7, 0, '#FFEB3B', 'queen');  // Yellow Queen
    await repository.add(user.userId, 6, 0, '#FFEB3B', 'king');   // Yellow King
    
    // Red pieces
    await repository.add(user.userId, 6, 13, '#F44336', 'queen'); // Red Queen
    await repository.add(user.userId, 7, 13, '#F44336', 'king');  // Red King
    
    // Blue pieces
    await repository.add(user.userId, 0, 6, '#2196F3', 'queen');  // Blue Queen
    await repository.add(user.userId, 0, 7, '#2196F3', 'king');   // Blue King
    
    // Green pieces
    await repository.add(user.userId, 13, 7, '#4CAF50', 'queen'); // Green Queen
    await repository.add(user.userId, 13, 6, '#4CAF50', 'king');  // Green King
    
    return createApiResponse(
      { 
        success: true, 
        message: 'Board reset to initial state with kings and queens',
        basePoints: [
          // Return all the base points with their positions and types
          { x: 7, y: 0, pieceType: 'queen', color: '#FFEB3B' },  // Yellow Queen
          { x: 6, y: 0, pieceType: 'king', color: '#FFEB3B' },   // Yellow King
          { x: 6, y: 13, pieceType: 'queen', color: '#F44336' }, // Red Queen
          { x: 7, y: 13, pieceType: 'king', color: '#F44336' },  // Red King
          { x: 0, y: 6, pieceType: 'queen', color: '#2196F3' },  // Blue Queen
          { x: 0, y: 7, pieceType: 'king', color: '#2196F3' },   // Blue King
          { x: 13, y: 7, pieceType: 'queen', color: '#4CAF50' }, // Green Queen
          { x: 13, y: 6, pieceType: 'king', color: '#4CAF50' }   // Green King
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
