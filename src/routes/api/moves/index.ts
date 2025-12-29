import type { APIEvent } from '@solidjs/start/server';
import { getMoveRepository } from '~/lib/server/db';
import { withAuth } from '~/middleware/auth';

type MoveInput = {
  gameId: string;
  pieceType: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  moveNumber?: number;
  capturedPieceId?: number | null;
  isBranch?: boolean;
  branchName?: string | null;
};

export const POST = withAuth(async (event: APIEvent) => {
  const requestId = event.request.headers.get('x-request-id') || 'unknown';
  
  try {
    const data: MoveInput = await event.request.json();
    
    // Validate required fields
    const requiredFields = ['gameId', 'pieceType', 'fromX', 'fromY', 'toX', 'toY'];
    const missingFields = requiredFields.filter(field => data[field as keyof MoveInput] === undefined);
    
    if (missingFields.length > 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields',
          missingFields,
          requestId
        }),
        { 
          status: 400,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    }
    
    const moveRepo = await getMoveRepository();
    
    // Get the authenticated user ID from the request context
    const userId = event.locals?.user?.userId;
    
    if (!userId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'User not authenticated',
          requestId
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    }
    
    // Create the move
    const move = await moveRepo.create({
      gameId: data.gameId,
      userId: userId,
      pieceType: data.pieceType,
      fromX: data.fromX,
      fromY: data.fromY,
      toX: data.toX,
      toY: data.toY,
      moveNumber: data.moveNumber, // Will be auto-calculated if not provided
      capturedPieceId: data.capturedPieceId || null,
      isBranch: data.isBranch || false,
      branchName: data.branchName || null
    });
    
    return new Response(
      JSON.stringify({
        success: true,
        data: move,
        requestId
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
  } catch (error) {
    console.error(`[${requestId}] Error in POST /api/moves:`, error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Failed to create move',
        message: error instanceof Error ? error.message : 'Unknown error',
        requestId
      }),
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
});
