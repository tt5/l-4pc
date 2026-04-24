import { APIEvent } from '@solidjs/start/server';
import { getDb } from '~/lib/server/db';
import { createApiResponse, createErrorResponse } from '~/utils/api';
import { readFileSync } from 'fs';
import { join } from 'path';

export const POST = async (event: APIEvent) => {
  try {
    const db = await getDb();
    
    // Read the test_checkmates.txt file
    const filePath = join(process.cwd(), '4pchess/test_checkmates.txt');
    const content = readFileSync(filePath, 'utf-8');
    
    // Parse each line
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    let importedCount = 0;
    let skippedCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (!line) continue;
      
      // Parse the line: FEN4 format has 8 parts separated by hyphens
      const parts = line.split('-');
      
      if (parts.length < 8) {
        console.log(`Skipping line ${i + 1}: invalid format (only ${parts.length} parts)`);
        skippedCount++;
        continue;
      }
      
      // The FEN4 is the first 8 parts
      const fen4 = parts.slice(0, 8).join('-');
      
      // Check if there's a 9th part (en passant targets)
      let finalFen4 = fen4;
      let solution = '';
      
      if (parts.length >= 9) {
        // The 9th part is en passant targets
        finalFen4 = parts.slice(0, 9).join('-');
        
        // Anything after the 9th part is the solution
        if (parts.length > 9) {
          solution = parts.slice(9).join('-');
        }
      }
      
      // Extract the current player from FEN4 (first character)
      const currentPlayer = fen4[0];
      
      // Determine difficulty based on solution length
      const solutionLength = solution.length;
      let difficulty = 'medium';
      if (solutionLength <= 2) {
        difficulty = 'easy';
      } else if (solutionLength > 4) {
        difficulty = 'hard';
      }
      
      // Check if puzzle already exists
      const existing = await db.get('SELECT id FROM puzzles WHERE fen4 = ?', [finalFen4]);
      if (existing) {
        skippedCount++;
        continue;
      }
      
      // Insert into database
      await db.run(
        `INSERT INTO puzzles (fen4, solution, difficulty, color_to_move) 
         VALUES (?, ?, ?, ?)`,
        [finalFen4, solution, difficulty, currentPlayer]
      );
      
      importedCount++;
    }
    
    return createApiResponse({
      imported: importedCount,
      skipped: skippedCount,
      total: lines.length
    });
  } catch (error) {
    console.error('Error reloading puzzles:', error);
    return createErrorResponse('Failed to reload puzzles', 500);
  }
};
