import { APIEvent } from '@solidjs/start/server';
import { getDb } from '~/lib/server/db';
import { createApiResponse, createErrorResponse } from '~/utils/api';

export const GET = async (event: APIEvent) => {
  try {
    const id = event.params.id;
    const db = await getDb();
    
    // Get total count
    const countResult = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM puzzles`
    );
    const totalCount = countResult?.count || 0;
    
    // Get current puzzle
    const current = await db.get<any>(
      `SELECT id, fen4, solution, difficulty, color_to_move, created_at_ms 
       FROM puzzles 
       WHERE id = ?`,
      [id]
    );

    if (!current) {
      return createErrorResponse('Puzzle not found', 404);
    }

    // Get previous puzzle (with looping)
    const previous = await db.get<any>(
      `SELECT id, fen4, solution, difficulty, color_to_move, created_at_ms 
       FROM puzzles 
       WHERE id < ? 
       ORDER BY id DESC 
       LIMIT 1`,
      [id]
    );

    // Get next puzzle (with looping)
    const next = await db.get<any>(
      `SELECT id, fen4, solution, difficulty, color_to_move, created_at_ms 
       FROM puzzles 
       WHERE id > ? 
       ORDER BY id ASC 
       LIMIT 1`,
      [id]
    );

    // Handle looping
    let finalPrevious = previous;
    let finalNext = next;

    if (!previous && totalCount > 1) {
      // At first puzzle, get last puzzle
      finalPrevious = await db.get<any>(
        `SELECT id, fen4, solution, difficulty, color_to_move, created_at_ms 
         FROM puzzles 
         ORDER BY id DESC 
         LIMIT 1`
      );
    }

    if (!next && totalCount > 1) {
      // At last puzzle, get first puzzle
      finalNext = await db.get<any>(
        `SELECT id, fen4, solution, difficulty, color_to_move, created_at_ms 
         FROM puzzles 
         ORDER BY id ASC 
         LIMIT 1`
      );
    }

    return createApiResponse({ 
      previous: finalPrevious,
      current,
      next: finalNext,
      hasPrevious: !!finalPrevious,
      hasNext: !!finalNext,
      totalCount
    });
  } catch (error) {
    console.error('Error fetching puzzle neighbors:', error);
    return createErrorResponse('Internal server error', 500);
  }
};
