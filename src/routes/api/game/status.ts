import { getDb } from '~/lib/server/db';
import { GameService } from '~/lib/server/services/game.service';
import { withAuth } from '~/middleware/auth';

// Response types
interface GameStatusResponse {
  success: boolean;
  gameJoined: boolean;
  homeX: number;
  homeY: number;
  message?: string;
  error?: string;
}

export const GET = withAuth(async (event) => {
  const { user } = event;

  try {
    const db = await getDb();
    const gameService = new GameService(db);
    
    // Get the current game status
    const status = await gameService.getGameStatus(user.userId);
    
    // If no status is found, return default values
    if (!status) {
      return new Response(JSON.stringify({ 
        success: true,
        gameJoined: false,
        homeX: 0,
        homeY: 0,
        message: 'User has not joined the game yet'
      } as GameStatusResponse), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
    
    // Return the current status
    const response: GameStatusResponse = {
      success: true,
      gameJoined: status.gameJoined,
      homeX: status.homeX,
      homeY: status.homeY,
      message: status.gameJoined 
        ? `Your home base is at (${status.homeX}, ${status.homeY})`
        : 'You have not joined the game yet'
    };
    
    return new Response(JSON.stringify(response), { 
      status: 200, 
      headers: { 
        'Content-Type': 'application/json' 
      } 
    });
    
  } catch (error) {
    console.error('Error in game status endpoint:', error);
    
    return new Response(JSON.stringify({ 
      success: false,
      gameJoined: false,
      homeX: 0,
      homeY: 0,
      error: 'An unexpected error occurred while fetching game status',
      message: 'Failed to load game status. Please try again.'
    } as GameStatusResponse), { 
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
});
