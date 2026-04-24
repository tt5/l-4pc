import { APIEvent } from '@solidjs/start/server';
import { getDb } from '~/lib/server/db';
import { createApiResponse, createErrorResponse } from '~/utils/api';

export const GET = async (event: APIEvent) => {
  try {
    const db = await getDb();
    
    // Get a random puzzle
    const puzzle = await db.get<any>(
      `SELECT id, fen4, solution, difficulty, color_to_move, created_at_ms 
       FROM puzzles 
       ORDER BY RANDOM() 
       LIMIT 1`
    );

    if (!puzzle) {
      return createErrorResponse('No puzzles found', 404);
    }

    return createApiResponse({ puzzle });
  } catch (error) {
    console.error('Error fetching random puzzle:', error);
    return createErrorResponse('Internal server error', 500);
  }
};
