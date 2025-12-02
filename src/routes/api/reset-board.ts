import { getBasePointRepository, getMoveRepository } from '~/lib/server/db';
import { withAuth } from '~/middleware/auth';
import { createApiResponse, createErrorResponse, generateRequestId } from '~/utils/api';
import { DEFAULT_GAME_ID } from '~/constants/game';

export const POST = withAuth(async ({ request, user }) => {
  const requestId = generateRequestId();
  
  try {
    const { gameId = DEFAULT_GAME_ID } = await request.json().catch(() => ({}));
    const repository = await getBasePointRepository();
    const moveRepository = await getMoveRepository();
    
    // Delete all base points for the current user
    console.log(`[${requestId}] Resetting board for user:`, user.userId);
    await repository.deleteAllBasePointsForUser(user.userId);
    
    // Delete all moves for the specified game
    console.log(`[${requestId}] Deleting all moves for game:`, gameId);
    try {
      await moveRepository.deleteAllForGame(gameId);
      console.log(`[${requestId}] Successfully deleted moves for game:`, gameId);
    } catch (error) {
      console.error(`[${requestId}] Error deleting moves:`, error);
      throw error; // Re-throw to be caught by the outer try-catch
    }
    
    // Add all base points with their correct types
    // Yellow pieces (top)
    await repository.add(user.userId, 7, 0, '#FFEB3B', 'queen');  // Yellow Queen
    await repository.add(user.userId, 8, 0, '#FFEB3B', 'bishop'); // Yellow Queen's Bishop
    await repository.add(user.userId, 6, 0, '#FFEB3B', 'king');   // Yellow King
    await repository.add(user.userId, 5, 0, '#FFEB3B', 'bishop'); // Yellow King's Bishop
    await repository.add(user.userId, 4, 0, '#FFEB3B', 'knight'); // Yellow Queen's Knight
    await repository.add(user.userId, 9, 0, '#FFEB3B', 'knight'); // Yellow King's Knight
    await repository.add(user.userId, 3, 0, '#FFEB3B', 'rook');   // Yellow Queen's Rook
    await repository.add(user.userId, 10, 0, '#FFEB3B', 'rook');  // Yellow King's Rook
    await repository.add(user.userId, 7, 1, '#FFEB3B', 'pawn');   // Yellow Queen's Pawn
    await repository.add(user.userId, 6, 1, '#FFEB3B', 'pawn');   // Yellow King's Pawn
    await repository.add(user.userId, 8, 1, '#FFEB3B', 'pawn');   // Yellow Queen's Bishop's Pawn
    await repository.add(user.userId, 5, 1, '#FFEB3B', 'pawn');   // Yellow King's Bishop's Pawn
    await repository.add(user.userId, 4, 1, '#FFEB3B', 'pawn');   // Yellow Queen's Knight's Pawn
    await repository.add(user.userId, 9, 1, '#FFEB3B', 'pawn');   // Yellow King's Knight's Pawn
    await repository.add(user.userId, 3, 1, '#FFEB3B', 'pawn');   // Yellow Queen's Rook's Pawn
    await repository.add(user.userId, 10, 1, '#FFEB3B', 'pawn');  // Yellow King's Rook's Pawn
    
    // Red pieces (bottom)
    await repository.add(user.userId, 6, 13, '#F44336', 'queen'); // Red Queen
    await repository.add(user.userId, 5, 13, '#F44336', 'bishop');// Red Queen's Bishop
    await repository.add(user.userId, 7, 13, '#F44336', 'king');  // Red King
    await repository.add(user.userId, 8, 13, '#F44336', 'bishop');// Red King's Bishop
    await repository.add(user.userId, 4, 13, '#F44336', 'knight');// Red Queen's Knight
    await repository.add(user.userId, 9, 13, '#F44336', 'knight');// Red King's Knight
    await repository.add(user.userId, 3, 13, '#F44336', 'rook');  // Red Queen's Rook
    await repository.add(user.userId, 10, 13, '#F44336', 'rook'); // Red King's Rook
    await repository.add(user.userId, 6, 12, '#F44336', 'pawn');  // Red Queen's Pawn
    await repository.add(user.userId, 7, 12, '#F44336', 'pawn');  // Red King's Pawn
    await repository.add(user.userId, 5, 12, '#F44336', 'pawn');  // Red Queen's Bishop's Pawn
    await repository.add(user.userId, 8, 12, '#F44336', 'pawn');  // Red King's Bishop's Pawn
    await repository.add(user.userId, 4, 12, '#F44336', 'pawn');  // Red Queen's Knight's Pawn
    await repository.add(user.userId, 9, 12, '#F44336', 'pawn');  // Red King's Knight's Pawn
    await repository.add(user.userId, 3, 12, '#F44336', 'pawn');  // Red Queen's Rook's Pawn
    await repository.add(user.userId, 10, 12, '#F44336', 'pawn'); // Red King's Rook's Pawn
    
    // Blue pieces (left)
    await repository.add(user.userId, 0, 6, '#2196F3', 'queen');  // Blue Queen
    await repository.add(user.userId, 0, 5, '#2196F3', 'bishop'); // Blue Queen's Bishop
    await repository.add(user.userId, 0, 7, '#2196F3', 'king');   // Blue King
    await repository.add(user.userId, 0, 8, '#2196F3', 'bishop'); // Blue King's Bishop
    await repository.add(user.userId, 0, 4, '#2196F3', 'knight'); // Blue Queen's Knight
    await repository.add(user.userId, 0, 9, '#2196F3', 'knight'); // Blue King's Knight
    await repository.add(user.userId, 0, 3, '#2196F3', 'rook');   // Blue Queen's Rook
    await repository.add(user.userId, 0, 10, '#2196F3', 'rook');  // Blue King's Rook
    await repository.add(user.userId, 1, 6, '#2196F3', 'pawn');   // Blue Queen's Pawn
    await repository.add(user.userId, 1, 7, '#2196F3', 'pawn');   // Blue King's Pawn
    await repository.add(user.userId, 1, 5, '#2196F3', 'pawn');   // Blue Queen's Bishop's Pawn
    await repository.add(user.userId, 1, 8, '#2196F3', 'pawn');   // Blue King's Bishop's Pawn
    await repository.add(user.userId, 1, 4, '#2196F3', 'pawn');   // Blue Queen's Knight's Pawn
    await repository.add(user.userId, 1, 9, '#2196F3', 'pawn');   // Blue King's Knight's Pawn
    await repository.add(user.userId, 1, 3, '#2196F3', 'pawn');   // Blue Queen's Rook's Pawn
    await repository.add(user.userId, 1, 10, '#2196F3', 'pawn');  // Blue King's Rook's Pawn
    
    // Green pieces (right)
    await repository.add(user.userId, 13, 7, '#4CAF50', 'queen'); // Green Queen
    await repository.add(user.userId, 13, 8, '#4CAF50', 'bishop');// Green Queen's Bishop
    await repository.add(user.userId, 13, 6, '#4CAF50', 'king');  // Green King
    await repository.add(user.userId, 13, 5, '#4CAF50', 'bishop');// Green King's Bishop
    await repository.add(user.userId, 13, 4, '#4CAF50', 'knight');// Green Queen's Knight
    await repository.add(user.userId, 13, 9, '#4CAF50', 'knight');// Green King's Knight
    await repository.add(user.userId, 13, 3, '#4CAF50', 'rook');  // Green Queen's Rook
    await repository.add(user.userId, 13, 10, '#4CAF50', 'rook'); // Green King's Rook
    await repository.add(user.userId, 12, 7, '#4CAF50', 'pawn');  // Green Queen's Pawn
    await repository.add(user.userId, 12, 6, '#4CAF50', 'pawn');  // Green King's Pawn
    await repository.add(user.userId, 12, 8, '#4CAF50', 'pawn');  // Green Queen's Bishop's Pawn
    await repository.add(user.userId, 12, 5, '#4CAF50', 'pawn');  // Green King's Bishop's Pawn
    await repository.add(user.userId, 12, 4, '#4CAF50', 'pawn');  // Green Queen's Knight's Pawn
    await repository.add(user.userId, 12, 9, '#4CAF50', 'pawn');  // Green King's Knight's Pawn
    await repository.add(user.userId, 12, 3, '#4CAF50', 'pawn');  // Green Queen's Rook's Pawn
    await repository.add(user.userId, 12, 10, '#4CAF50', 'pawn'); // Green King's Rook's Pawn
    
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
          { x: 4, y: 0, pieceType: 'knight', color: '#FFEB3B' }, // Yellow Queen's Knight
          { x: 9, y: 0, pieceType: 'knight', color: '#FFEB3B' }, // Yellow King's Knight
          { x: 3, y: 0, pieceType: 'rook', color: '#FFEB3B' },   // Yellow Queen's Rook
          { x: 10, y: 0, pieceType: 'rook', color: '#FFEB3B' },  // Yellow King's Rook
          { x: 7, y: 1, pieceType: 'pawn', color: '#FFEB3B' },   // Yellow Queen's Pawn
          { x: 6, y: 1, pieceType: 'pawn', color: '#FFEB3B' },   // Yellow King's Pawn
          { x: 8, y: 1, pieceType: 'pawn', color: '#FFEB3B' },   // Yellow Queen's Bishop's Pawn
          { x: 5, y: 1, pieceType: 'pawn', color: '#FFEB3B' },   // Yellow King's Bishop's Pawn
          { x: 4, y: 1, pieceType: 'pawn', color: '#FFEB3B' },   // Yellow Queen's Knight's Pawn
          { x: 9, y: 1, pieceType: 'pawn', color: '#FFEB3B' },   // Yellow King's Knight's Pawn
          { x: 3, y: 1, pieceType: 'pawn', color: '#FFEB3B' },   // Yellow Queen's Rook's Pawn
          { x: 10, y: 1, pieceType: 'pawn', color: '#FFEB3B' },  // Yellow King's Rook's Pawn
          
          // Red pieces (bottom)
          { x: 6, y: 13, pieceType: 'queen', color: '#F44336' }, // Red Queen
          { x: 5, y: 13, pieceType: 'bishop', color: '#F44336' },// Red Queen's Bishop
          { x: 7, y: 13, pieceType: 'king', color: '#F44336' },  // Red King
          { x: 8, y: 13, pieceType: 'bishop', color: '#F44336' },// Red King's Bishop
          { x: 4, y: 13, pieceType: 'knight', color: '#F44336' },// Red Queen's Knight
          { x: 9, y: 13, pieceType: 'knight', color: '#F44336' },// Red King's Knight
          { x: 3, y: 13, pieceType: 'rook', color: '#F44336' },  // Red Queen's Rook
          { x: 10, y: 13, pieceType: 'rook', color: '#F44336' }, // Red King's Rook
          { x: 6, y: 12, pieceType: 'pawn', color: '#F44336' },  // Red Queen's Pawn
          { x: 7, y: 12, pieceType: 'pawn', color: '#F44336' },  // Red King's Pawn
          { x: 5, y: 12, pieceType: 'pawn', color: '#F44336' },  // Red Queen's Bishop's Pawn
          { x: 8, y: 12, pieceType: 'pawn', color: '#F44336' },  // Red King's Bishop's Pawn
          { x: 4, y: 12, pieceType: 'pawn', color: '#F44336' },  // Red Queen's Knight's Pawn
          { x: 9, y: 12, pieceType: 'pawn', color: '#F44336' },  // Red King's Knight's Pawn
          { x: 3, y: 12, pieceType: 'pawn', color: '#F44336' },  // Red Queen's Rook's Pawn
          { x: 10, y: 12, pieceType: 'pawn', color: '#F44336' }, // Red King's Rook's Pawn
          
          // Blue pieces (left)
          { x: 0, y: 6, pieceType: 'queen', color: '#2196F3' },  // Blue Queen
          { x: 0, y: 5, pieceType: 'bishop', color: '#2196F3' }, // Blue Queen's Bishop
          { x: 0, y: 7, pieceType: 'king', color: '#2196F3' },   // Blue King
          { x: 0, y: 8, pieceType: 'bishop', color: '#2196F3' }, // Blue King's Bishop
          { x: 0, y: 4, pieceType: 'knight', color: '#2196F3' }, // Blue Queen's Knight
          { x: 0, y: 9, pieceType: 'knight', color: '#2196F3' }, // Blue King's Knight
          { x: 0, y: 3, pieceType: 'rook', color: '#2196F3' },   // Blue Queen's Rook
          { x: 0, y: 10, pieceType: 'rook', color: '#2196F3' },  // Blue King's Rook
          { x: 1, y: 6, pieceType: 'pawn', color: '#2196F3' },   // Blue Queen's Pawn
          { x: 1, y: 7, pieceType: 'pawn', color: '#2196F3' },   // Blue King's Pawn
          { x: 1, y: 5, pieceType: 'pawn', color: '#2196F3' },   // Blue Queen's Bishop's Pawn
          { x: 1, y: 8, pieceType: 'pawn', color: '#2196F3' },   // Blue King's Bishop's Pawn
          { x: 1, y: 4, pieceType: 'pawn', color: '#2196F3' },   // Blue Queen's Knight's Pawn
          { x: 1, y: 9, pieceType: 'pawn', color: '#2196F3' },   // Blue King's Knight's Pawn
          { x: 1, y: 3, pieceType: 'pawn', color: '#2196F3' },   // Blue Queen's Rook's Pawn
          { x: 1, y: 10, pieceType: 'pawn', color: '#2196F3' },  // Blue King's Rook's Pawn
          
          // Green pieces (right)
          { x: 13, y: 7, pieceType: 'queen', color: '#4CAF50' }, // Green Queen
          { x: 13, y: 8, pieceType: 'bishop', color: '#4CAF50' },// Green Queen's Bishop
          { x: 13, y: 6, pieceType: 'king', color: '#4CAF50' },  // Green King
          { x: 13, y: 5, pieceType: 'bishop', color: '#4CAF50' },// Green King's Bishop
          { x: 13, y: 4, pieceType: 'knight', color: '#4CAF50' },// Green Queen's Knight
          { x: 13, y: 9, pieceType: 'knight', color: '#4CAF50' },// Green King's Knight
          { x: 13, y: 3, pieceType: 'rook', color: '#4CAF50' },  // Green Queen's Rook
          { x: 13, y: 10, pieceType: 'rook', color: '#4CAF50' }, // Green King's Rook
          { x: 12, y: 7, pieceType: 'pawn', color: '#4CAF50' },  // Green Queen's Pawn
          { x: 12, y: 6, pieceType: 'pawn', color: '#4CAF50' },  // Green King's Pawn
          { x: 12, y: 8, pieceType: 'pawn', color: '#4CAF50' },  // Green Queen's Bishop's Pawn
          { x: 12, y: 5, pieceType: 'pawn', color: '#4CAF50' },  // Green King's Bishop's Pawn
          { x: 12, y: 4, pieceType: 'pawn', color: '#4CAF50' },  // Green Queen's Knight's Pawn
          { x: 12, y: 9, pieceType: 'pawn', color: '#4CAF50' },  // Green King's Knight's Pawn
          { x: 12, y: 3, pieceType: 'pawn', color: '#4CAF50' },  // Green Queen's Rook's Pawn
          { x: 12, y: 10, pieceType: 'pawn', color: '#4CAF50' }  // Green King's Rook's Pawn
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
