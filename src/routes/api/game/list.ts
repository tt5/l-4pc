import { APIEvent } from '@solidjs/start/server';
import { getDb } from '~/lib/server/db';

export async function GET({ request }: APIEvent) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const db = await getDb();
    
    // Get all unique game IDs for the user
    const games = await db.all<{ game_id: string }[]>(
      `SELECT DISTINCT game_id 
       FROM moves 
       WHERE user_id = ? 
       ORDER BY created_at_ms DESC`,
      [token]
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
