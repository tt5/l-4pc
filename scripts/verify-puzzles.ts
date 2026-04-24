import { getDb } from '../src/lib/server/db';
import { verifyCheckmateInOne } from '../src/utils/puzzleVerification';

async function verifyPuzzles() {
  try {
    const db = await getDb();
    
    console.log('Fetching unverified puzzles...');
    const puzzles = await db.all(
      'SELECT id, fen4 FROM puzzles WHERE verified IS NULL OR verified = 0'
    );
    
    console.log(`Found ${puzzles.length} unverified puzzles`);
    
    if (puzzles.length === 0) {
      console.log('No puzzles to verify');
      process.exit(0);
    }
    
    let verifiedCount = 0;
    let failedCount = 0;
    const startTime = Date.now();
    
    for (let i = 0; i < puzzles.length; i++) {
      const puzzle = puzzles[i];
      const progress = Math.round(((i + 1) / puzzles.length) * 100);
      
      console.log(`[${progress}%] Verifying puzzle ${puzzle.id}...`);
      
      try {
        const result = verifyCheckmateInOne(puzzle.fen4);
        const verified = result.found ? 1 : 2;
        const verifiedAtMs = Date.now();
        
        await db.run(
          'UPDATE puzzles SET verified = ?, verified_at_ms = ? WHERE id = ?',
          [verified, verifiedAtMs, puzzle.id]
        );
        
        if (result.found) {
          console.log(`  ✅ Puzzle ${puzzle.id}: Checkmate in one found`);
          verifiedCount++;
        } else {
          console.log(`  ❌ Puzzle ${puzzle.id}: No checkmate in one found`);
          failedCount++;
        }
      } catch (error) {
        console.error(`  ⚠️  Error verifying puzzle ${puzzle.id}:`, error);
        failedCount++;
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n=== Verification Summary ===');
    console.log(`Total puzzles: ${puzzles.length}`);
    console.log(`Verified (checkmate in one): ${verifiedCount}`);
    console.log(`Failed (no checkmate in one): ${failedCount}`);
    console.log(`Duration: ${duration}s`);
    console.log('✅ Verification complete');
    
    process.exit(0);
  } catch (error) {
    console.error('Error verifying puzzles:', error);
    process.exit(1);
  }
}

verifyPuzzles();
