import { APIEvent } from '@solidjs/start/server';
import { getDb } from '~/lib/server/db';
import { createApiResponse, createErrorResponse } from '~/utils/api';

export const POST = async (event: APIEvent) => {
  try {
    const id = event.params.id;
    const db = await getDb();
    
    // Get current puzzle
    const puzzle = await db.get<any>(
      `SELECT id, is_bad FROM puzzles WHERE id = ?`,
      [id]
    );

    if (!puzzle) {
      return createErrorResponse('Puzzle not found', 404);
    }

    // Toggle the is_bad flag
    const newStatus = puzzle.is_bad ? 0 : 1;
    
    await db.run(
      `UPDATE puzzles SET is_bad = ? WHERE id = ?`,
      [newStatus, id]
    );

    // Get updated puzzle data
    const updatedPuzzle = await db.get<any>(
      `SELECT id, fen4, solution, difficulty, color_to_move, created_at_ms, is_bad 
       FROM puzzles 
       WHERE id = ?`,
      [id]
    );

    return createApiResponse({ 
      puzzle: updatedPuzzle,
      isBad: newStatus === 1
    });
  } catch (error) {
    console.error('Error flagging puzzle:', error);
    return createErrorResponse('Internal server error', 500);
  }
};
