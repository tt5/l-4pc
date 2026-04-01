import type { APIEvent } from '@solidjs/start/server';
import { withAuth } from '~/middleware/auth';
import { getMoveRepository } from '~/lib/server/db';
import { json } from '@solidjs/router';

type MoveCoordinates = {
  gameId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  moveNumber: number;
};

export const DELETE = withAuth(async (event: APIEvent) => {
  const requestId = event.request.headers.get('x-request-id') || 'unknown';
  const moveId = parseInt(event.params.id);

  if (isNaN(moveId)) {
    return json({ success: false, error: 'Invalid move ID' }, { status: 400 });
  }

  const moveRepo = await getMoveRepository();
  const { deletedCount, gameId } = await moveRepo.deleteMoveAndDescendants(moveId);
  
  return json({ success: true, deletedCount, gameId, requestId });
});
