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
    
    // Get all unique game IDs for the user
    const games = await db.all<{ game_id: string }[]>(
      `SELECT DISTINCT game_id 
       FROM moves 
       WHERE user_id = ? 
       ORDER BY created_at_ms DESC`,
      [user.userId]
    );

    const gameIds = games.map(g => g.game_id);

    return new Response(
      JSON.stringify({ gameIds }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error fetching game IDs:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
