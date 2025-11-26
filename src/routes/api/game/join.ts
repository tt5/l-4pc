import { getDb } from '~/lib/server/db';
import { GameService } from '~/lib/server/services/game.service';
import { withAuth } from '~/middleware/auth';
import { jsonResponse } from '~/lib/server/utils';

// Response types
interface JoinGameResponse {
  success: boolean;
  gameJoined: boolean;
  homeX: number;
  homeY: number;
  message?: string;
  error?: string;
}

export const POST = withAuth(async (event) => {
  const { user } = event;
  
  try {
    const db = await getDb();
    const gameService = new GameService(db);
    
    // Attempt to join the game
    const result = await gameService.joinGame(user.userId);
    
    // Handle the result
    if (!result.success) {
      return jsonResponse({
        success: false,
        gameJoined: result.gameJoined || false,
        homeX: result.homeX || 0,
        homeY: result.homeY || 0,
        message: result.message || 'Failed to join the game',
        error: result.error || 'Failed to join the game'
      } as JoinGameResponse, 400);
    }

    return jsonResponse({
      success: true,
      gameJoined: true,
      homeX: result.homeX,
      homeY: result.homeY,
      message: 'Successfully joined the game!'
    } as JoinGameResponse);
    
  } catch (error) {
    console.error('Error joining game:', error);
    return jsonResponse({
      success: false,
      gameJoined: false,
      homeX: 0,
      homeY: 0,
      error: 'Internal server error',
      message: 'An unexpected error occurred while joining the game.'
    } as JoinGameResponse, 500);
  }
});
