import { getDb } from '~/lib/server/db';
import { withAuth } from '~/middleware/auth';
import { MoveRepository } from '~/lib/server/repositories/move.repository';
import type { APIEvent } from '@solidjs/start/server';

export const POST = withAuth(async (event: APIEvent) => {
  try {
    const db = await getDb();
    const moveRepo = new MoveRepository(db);
    const body = await event.request.json();
    const { currentGameId, newGameId } = body;

    if (!currentGameId || !newGameId) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Both currentGameId and newGameId are required' 
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const updatedCount = await moveRepo.updateGameIdForAllMoves(currentGameId, newGameId);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        updatedCount,
        message: `Successfully updated ${updatedCount} moves to new game ID`
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error updating game ID:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to update game ID' 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
