import { APIEvent } from '@solidjs/start/server';
import { getDb } from '~/lib/server/db';
import { getAuthUser } from '~/lib/server/auth/jwt';

export async function GET({ request }: APIEvent) {
  try {
    const user = await getAuthUser(request);
    
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const db = await getDb();
    
    // Get the latest game ID from the moves table
    const latestMove = await db.get<{ game_id: string }>(
      `SELECT game_id 
       FROM moves 
       WHERE user_id = ? 
       ORDER BY created_at_ms DESC 
       LIMIT 1`,
      [user.userId]
    );

    if (!latestMove) {
      return new Response(
        JSON.stringify({ gameId: null }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ gameId: latestMove.game_id }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error fetching latest game:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch latest game' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
