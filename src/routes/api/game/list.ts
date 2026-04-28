import { APIEvent } from '@solidjs/start/server';
import { getDb } from '~/lib/server/db';
import { withAuth } from '~/middleware/auth';
import type { TokenPayload } from '~/lib/server/auth/jwt';
import { createApiResponse, createErrorResponse } from '~/utils/api';

export const GET = withAuth(async ({ user }: { user: TokenPayload }) => {
  try {
    const db = await getDb();
    
    // Get all unique game IDs for the user
    const games = await db.all<{ game_id: string }>(
      `SELECT DISTINCT game_id
       FROM moves
       WHERE user_id = ?
       ORDER BY created_at_ms DESC`,
      [user.userId]
    );

    const gameIds = games.map(g => g.game_id);

    return createApiResponse({ gameIds });
  } catch (error) {
    console.error('Error fetching game IDs:', error);
    return createErrorResponse('Internal server error', 500);
  }
});
