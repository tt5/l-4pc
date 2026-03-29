import { APIEvent } from '@solidjs/start/server';
import { getMoveRepository } from '~/lib/server/db';
import { withAuth } from '~/middleware/auth';
import type { TokenPayload } from '~/lib/server/auth/jwt';
import { createApiResponse, createErrorResponse } from '~/utils/api';

export const GET = withAuth(async ({ params, user }: { params: { gameId?: string }, user: TokenPayload }) => {
  try {
    const { gameId } = params;
    
    if (!gameId) {
      return createErrorResponse('Game ID is required', 400);
    }

    const moveRepo = await getMoveRepository();
    const moves = await moveRepo.getByGameId(gameId);

    // TODO: Add authorization check to ensure user can only access their own games
    // For now, we're just authenticating the user

    return createApiResponse({ moves });
  } catch (error) {
    console.error('Error fetching moves:', error);
    return createErrorResponse('Failed to fetch moves', 500);
  }
});
