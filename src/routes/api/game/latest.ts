import { APIEvent } from '@solidjs/start/server';
import { getDb } from '~/lib/server/db';
import { withAuth } from '~/middleware/auth';
import type { TokenPayload } from '~/lib/server/auth/jwt';

export const GET = withAuth(async ({ user }: { user: TokenPayload }) => {
  try {
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
});
