import { getDb } from '../src/lib/server/db';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function importPuzzles() {
  try {
    const db = await getDb();
    
    // Read the test_checkmates.txt file
    const filePath = join(__dirname, '../4pchess/test_checkmates.txt');
    const content = readFileSync(filePath, 'utf-8');
    
    // Parse each line
    const lines = content.trim().split('\n').filter(line => line.trim());
    
    console.log(`Found ${lines.length} puzzles to import`);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (!line) continue;
      
      // Parse the line: FEN4 format has 8 parts separated by hyphens
      // After the 8th part (piece placement), there's the en passant targets
      // Then optionally a solution
      const parts = line.split('-');
      
      if (parts.length < 8) {
        console.log(`Skipping line ${i + 1}: invalid format (only ${parts.length} parts)`);
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
      
      // Determine difficulty based on solution length (placeholder logic)
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
        console.log(`Skipping duplicate puzzle ${i + 1}`);
        continue;
      }
      
      // Insert into database
      await db.run(
        `INSERT INTO puzzles (fen4, solution, difficulty, color_to_move) 
         VALUES (?, ?, ?, ?)`,
        [finalFen4, solution, difficulty, currentPlayer]
      );
      
      console.log(`Imported puzzle ${i + 1}: ${difficulty} difficulty, color ${currentPlayer}`);
    }
    
    console.log('Successfully imported all puzzles');
  } catch (error) {
    console.error('Error importing puzzles:', error);
    process.exit(1);
  }
}

importPuzzles().then(() => {
  console.log('Import complete');
  process.exit(0);
});
