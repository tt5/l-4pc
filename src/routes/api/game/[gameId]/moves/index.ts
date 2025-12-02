import { APIEvent } from '@solidjs/start/server';
import { json } from '@solidjs/router';
import { getMoveRepository } from '~/lib/server/db';

export const GET = async ({ params }: APIEvent) => {
  try {
    const { gameId } = params;
    
    if (!gameId) {
      return json({ error: 'Game ID is required' }, { status: 400 });
    }

    const moveRepo = await getMoveRepository();
    const moves = await moveRepo.getByGameId(gameId);

    return json({ moves });
  } catch (error) {
    console.error('Error fetching moves:', error);
    return json({ error: 'Failed to fetch moves' }, { status: 500 });
  }
};
