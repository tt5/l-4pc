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
    // Yellow pieces (top)
    await repository.add(user.userId, 7, 0, '#FFEB3B', 'queen');  // Yellow Queen
    await repository.add(user.userId, 8, 0, '#FFEB3B', 'bishop'); // Yellow Queen's Bishop
    await repository.add(user.userId, 6, 0, '#FFEB3B', 'king');   // Yellow King
    await repository.add(user.userId, 5, 0, '#FFEB3B', 'bishop'); // Yellow King's Bishop
    await repository.add(user.userId, 7, 1, '#FFEB3B', 'pawn');   // Yellow Queen's Pawn
    await repository.add(user.userId, 6, 1, '#FFEB3B', 'pawn');   // Yellow King's Pawn
    await repository.add(user.userId, 5, 1, '#FFEB3B', 'pawn');   // Yellow Bishop's Pawn
    
    // Red pieces (bottom)
    await repository.add(user.userId, 6, 13, '#F44336', 'queen'); // Red Queen
    await repository.add(user.userId, 5, 13, '#F44336', 'bishop'); // Red Queen's Bishop
    await repository.add(user.userId, 7, 13, '#F44336', 'king');  // Red King
    await repository.add(user.userId, 8, 13, '#F44336', 'bishop'); // Red King's Bishop
    await repository.add(user.userId, 6, 12, '#F44336', 'pawn');  // Red Queen's Pawn
    await repository.add(user.userId, 7, 12, '#F44336', 'pawn');  // Red King's Pawn
    await repository.add(user.userId, 8, 12, '#F44336', 'pawn');  // Red Bishop's Pawn
    
    // Blue pieces (left)
    await repository.add(user.userId, 0, 6, '#2196F3', 'queen');  // Blue Queen
    await repository.add(user.userId, 0, 5, '#2196F3', 'bishop'); // Blue Queen's Bishop
    await repository.add(user.userId, 0, 7, '#2196F3', 'king');   // Blue King
    await repository.add(user.userId, 0, 8, '#2196F3', 'bishop'); // Blue King's Bishop
    await repository.add(user.userId, 1, 6, '#2196F3', 'pawn');   // Blue Queen's Pawn
    await repository.add(user.userId, 1, 7, '#2196F3', 'pawn');   // Blue King's Pawn
    await repository.add(user.userId, 1, 8, '#2196F3', 'pawn');   // Blue Bishop's Pawn
    
    // Green pieces (right)
    await repository.add(user.userId, 13, 7, '#4CAF50', 'queen'); // Green Queen
    await repository.add(user.userId, 13, 8, '#4CAF50', 'bishop');// Green Queen's Bishop
    await repository.add(user.userId, 13, 6, '#4CAF50', 'king');  // Green King
    await repository.add(user.userId, 13, 5, '#4CAF50', 'bishop');// Green King's Bishop
    await repository.add(user.userId, 12, 7, '#4CAF50', 'pawn');  // Green Queen's Pawn
    await repository.add(user.userId, 12, 6, '#4CAF50', 'pawn');  // Green King's Pawn
    await repository.add(user.userId, 12, 5, '#4CAF50', 'pawn');  // Green Bishop's Pawn
    
    return createApiResponse(
      { 
        success: true, 
        message: 'Board reset to initial state with kings and queens',
        basePoints: [
          // Yellow pieces (top)
          { x: 7, y: 0, pieceType: 'queen', color: '#FFEB3B' },  // Yellow Queen
          { x: 8, y: 0, pieceType: 'bishop', color: '#FFEB3B' }, // Yellow Queen's Bishop
          { x: 6, y: 0, pieceType: 'king', color: '#FFEB3B' },   // Yellow King
          { x: 5, y: 0, pieceType: 'bishop', color: '#FFEB3B' }, // Yellow King's Bishop
          { x: 7, y: 1, pieceType: 'pawn', color: '#FFEB3B' },   // Yellow Queen's Pawn
          { x: 6, y: 1, pieceType: 'pawn', color: '#FFEB3B' },   // Yellow King's Pawn
          { x: 5, y: 1, pieceType: 'pawn', color: '#FFEB3B' },   // Yellow Bishop's Pawn
          
          // Red pieces (bottom)
          { x: 6, y: 13, pieceType: 'queen', color: '#F44336' }, // Red Queen
          { x: 5, y: 13, pieceType: 'bishop', color: '#F44336' },// Red Queen's Bishop
          { x: 7, y: 13, pieceType: 'king', color: '#F44336' },  // Red King
          { x: 8, y: 13, pieceType: 'bishop', color: '#F44336' },// Red King's Bishop
          { x: 6, y: 12, pieceType: 'pawn', color: '#F44336' },  // Red Queen's Pawn
          { x: 7, y: 12, pieceType: 'pawn', color: '#F44336' },  // Red King's Pawn
          { x: 8, y: 12, pieceType: 'pawn', color: '#F44336' },  // Red Bishop's Pawn
          
          // Blue pieces (left)
          { x: 0, y: 6, pieceType: 'queen', color: '#2196F3' },  // Blue Queen
          { x: 0, y: 5, pieceType: 'bishop', color: '#2196F3' }, // Blue Queen's Bishop
          { x: 0, y: 7, pieceType: 'king', color: '#2196F3' },   // Blue King
          { x: 0, y: 8, pieceType: 'bishop', color: '#2196F3' }, // Blue King's Bishop
          { x: 1, y: 6, pieceType: 'pawn', color: '#2196F3' },   // Blue Queen's Pawn
          { x: 1, y: 7, pieceType: 'pawn', color: '#2196F3' },   // Blue King's Pawn
          { x: 1, y: 8, pieceType: 'pawn', color: '#2196F3' },   // Blue Bishop's Pawn
          
          // Green pieces (right)
          { x: 13, y: 7, pieceType: 'queen', color: '#4CAF50' }, // Green Queen
          { x: 13, y: 8, pieceType: 'bishop', color: '#4CAF50' },// Green Queen's Bishop
          { x: 13, y: 6, pieceType: 'king', color: '#4CAF50' },  // Green King
          { x: 13, y: 5, pieceType: 'bishop', color: '#4CAF50' },// Green King's Bishop
          { x: 12, y: 7, pieceType: 'pawn', color: '#4CAF50' },  // Green Queen's Pawn
          { x: 12, y: 6, pieceType: 'pawn', color: '#4CAF50' },  // Green King's Pawn
          { x: 12, y: 5, pieceType: 'pawn', color: '#4CAF50' }   // Green Bishop's Pawn
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
