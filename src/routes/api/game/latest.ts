import { APIEvent } from '@solidjs/start/server';
import { getDb } from '~/lib/server/db';
import { withAuth } from '~/middleware/auth';
import type { TokenPayload } from '~/lib/server/auth/jwt';
import { createApiResponse, createErrorResponse } from '~/utils/api';

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
      return createApiResponse({ gameId: null });
    }

    return createApiResponse({ gameId: latestMove.game_id });
  } catch (error) {
    console.error('Error fetching latest game:', error);
    return createErrorResponse('Failed to fetch latest game', 500);
  }
});
