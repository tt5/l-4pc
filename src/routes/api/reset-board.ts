import { getMoveRepository } from '~/lib/server/db';
import { withAuth } from '~/middleware/auth';
import { createApiResponse, createErrorResponse, generateRequestId } from '~/utils/api';
import { DEFAULT_GAME_ID } from '~/constants/game';

export const POST = withAuth(async ({ request, user }) => {
  const requestId = generateRequestId();
  
  try {
    const data = await request.json().catch(() => ({}));
    const gameId = data?.gameId ? String(data.gameId) : DEFAULT_GAME_ID;
    const moveRepository = await getMoveRepository();
    
    console.log(`[${requestId}] Resetting game by deleting all moves for game:`, gameId);
    
    // Delete all moves for the specified game
    await moveRepository.deleteAllForGame(gameId);
    
    // Reset any game state that might be stored elsewhere
    // For example, if you're using any in-memory state or cache:
    // resetGameState(gameId);
    
    console.log(`[${requestId}] Successfully reset game:`, gameId);
    
    return createApiResponse({
      success: true, 
      message: 'Game reset successfully'
    });
  } catch (error) {
    console.error(`[${requestId}] Error resetting game:`, error);
    return createErrorResponse(
      'Failed to reset game',
      500,
      error instanceof Error ? error.message : 'Unknown error',
      { requestId }
    );
  }
});
