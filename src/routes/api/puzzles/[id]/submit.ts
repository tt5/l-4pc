import { APIEvent } from '@solidjs/start/server';
import { getDb } from '~/lib/server/db';
import { createApiResponse, createErrorResponse } from '~/utils/api';

type SubmitSolutionInput = {
  moves: Array<{ fromX: number; fromY: number; toX: number; toY: number }>;
};

export const POST = async (event: APIEvent) => {
  try {
    const id = event.params.id;
    const data: SubmitSolutionInput = await event.request.json();
    const db = await getDb();
    
    // Get the puzzle to check the solution
    const puzzle = await db.get<any>(
      `SELECT solution FROM puzzles WHERE id = ?`,
      [id]
    );

    if (!puzzle) {
      return createErrorResponse('Puzzle not found', 404);
    }

    // Convert user moves to a comparable format
    // The solution is stored as a simple string like "l7" or "d12"
    // For now, we'll just check if moves were submitted
    // TODO: Implement proper solution verification comparing move sequences
    
    const hasMoves = data.moves && data.moves.length > 0;
    const isCorrect = hasMoves; // Placeholder - will implement proper verification

    return createApiResponse({ 
      correct: isCorrect,
      message: isCorrect ? 'Solution submitted!' : 'No moves submitted.'
    });
  } catch (error) {
    console.error('Error submitting solution:', error);
    return createErrorResponse('Internal server error', 500);
  }
};
