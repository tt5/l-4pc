import type { APIEvent } from '@solidjs/start/server';
import { withAuth } from '~/middleware/auth';
import { getMoveRepository } from '~/lib/server/db';
import { json } from '@solidjs/router';

export const DELETE = withAuth(async (event: APIEvent) => {
  const { id } = event.params;
  const requestId = event.request.headers.get('x-request-id') || 'unknown';
  
  try {
    if (!id) {
      return json(
        { 
          success: false, 
          error: 'Move ID is required',
          requestId
        },
        { status: 400 }
      );
    }

    const moveId = parseInt(id, 10);
    if (isNaN(moveId)) {
      return json(
        { 
          success: false, 
          error: 'Invalid move ID',
          requestId
        },
        { status: 400 }
      );
    }

    const moveRepo = await getMoveRepository();
    const { deletedCount, gameId } = await moveRepo.deleteMoveAndDescendants(moveId);

    if (deletedCount === 0) {
      return json(
        { 
          success: false, 
          error: 'Move not found or no moves were deleted',
          requestId
        },
        { status: 404 }
      );
    }

    return json({ 
      success: true,
      deletedCount,
      gameId,
      requestId
    });

  } catch (error) {
    console.error(`[${requestId}] Error deleting move:`, error);
    return json(
      { 
        success: false, 
        error: 'Failed to delete move',
        message: error instanceof Error ? error.message : 'Unknown error',
        requestId
      },
      { status: 500 }
    );
  }
});
