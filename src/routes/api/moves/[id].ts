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
  
  try {
    const coordinates: MoveCoordinates = await event.request.json();
    
    // Validate required fields
    const requiredFields = ['gameId', 'fromX', 'fromY', 'toX', 'toY', 'moveNumber'];
    const missingFields = requiredFields.filter(field => coordinates[field as keyof MoveCoordinates] === undefined);
    
    if (missingFields.length > 0) {
      return json(
        { 
          success: false, 
          error: 'Missing required fields',
          missingFields,
          requestId
        },
        { status: 400 }
      );
    }

    const moveRepo = await getMoveRepository();
    
    // First find the move by coordinates and move number
    const move = await moveRepo.db.get<{id: number}>(
      `SELECT id FROM moves 
       WHERE game_id = ? 
         AND from_x = ? 
         AND from_y = ? 
         AND to_x = ? 
         AND to_y = ? 
         AND move_number = ? 
       ORDER BY created_at_ms DESC 
       LIMIT 1`,
      [
        coordinates.gameId,
        coordinates.fromX,
        coordinates.fromY,
        coordinates.toX,
        coordinates.toY,
        coordinates.moveNumber
      ]
    );
    
    if (!move) {
      return json(
        { 
          success: false, 
          error: 'No matching move found with the given coordinates and move number',
          requestId
        },
        { status: 404 }
      );
    }
    
    // Delete the move and its descendants
    const { deletedCount, gameId } = await moveRepo.deleteMoveAndDescendants(move.id);

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
