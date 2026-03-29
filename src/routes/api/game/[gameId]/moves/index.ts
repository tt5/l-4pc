import { APIEvent } from '@solidjs/start/server';
import { json } from '@solidjs/router';
import { getMoveRepository } from '~/lib/server/db';
import { getAuthUser } from '~/lib/server/auth/jwt';

export const GET = async ({ params, request }: APIEvent) => {
  try {
    const user = await getAuthUser(request);
    
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { gameId } = params;
    
    if (!gameId) {
      return json({ error: 'Game ID is required' }, { status: 400 });
    }

    const moveRepo = await getMoveRepository();
    const moves = await moveRepo.getByGameId(gameId);

    // TODO: Add authorization check to ensure user can only access their own games
    // For now, we're just authenticating the user

    return json({ moves });
  } catch (error) {
    console.error('Error fetching moves:', error);
    return json({ error: 'Failed to fetch moves' }, { status: 500 });
  }
};
