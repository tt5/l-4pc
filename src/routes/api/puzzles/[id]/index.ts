import { APIEvent } from '@solidjs/start/server';
import { getDb } from '~/lib/server/db';
import { createApiResponse, createErrorResponse } from '~/utils/api';

export const GET = async (event: APIEvent) => {
  try {
    const id = event.params.id;
    const db = await getDb();
    
    // Get specific puzzle
    const puzzle = await db.get<any>(
      `SELECT id, fen4, solution, difficulty, color_to_move, created_at_ms 
       FROM puzzles 
       WHERE id = ?`,
      [id]
    );

    if (!puzzle) {
      return createErrorResponse('Puzzle not found', 404);
    }

    return createApiResponse({ puzzle });
  } catch (error) {
    console.error('Error fetching puzzle:', error);
    return createErrorResponse('Internal server error', 500);
  }
};
