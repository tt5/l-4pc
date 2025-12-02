import { APIEvent } from '@solidjs/start/server';
import { getDb } from '~/lib/server/db';

export async function GET({ request }: APIEvent) {
  try {
    // Get the user ID from the auth token
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const db = await getDb();
    
    // Get the user ID from the token
    const user = await db.get<{ id: string }>(
      'SELECT id FROM users WHERE id = ?',
      [token] // In a real app, verify the JWT token
    );

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get the latest game ID from the moves table
    const latestMove = await db.get<{ game_id: string }>(
      `SELECT game_id 
       FROM moves 
       WHERE user_id = ? 
       ORDER BY created_at_ms DESC 
       LIMIT 1`,
      [user.id]
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
