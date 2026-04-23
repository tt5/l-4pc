import { APIEvent } from '@solidjs/start/server';
import { getDb } from '~/lib/server/db';
import { createApiResponse, createErrorResponse } from '~/utils/api';

export const GET = async (event: APIEvent) => {
  try {
    const db = await getDb();
    
    // Get all puzzles
    const puzzles = await db.all<any[]>(
      `SELECT id, fen4, difficulty, color_to_move, created_at_ms 
       FROM puzzles 
       ORDER BY created_at_ms DESC`
    );

    return createApiResponse({ puzzles });
  } catch (error) {
    console.error('Error fetching puzzles:', error);
    return createErrorResponse('Internal server error', 500);
  }
};
