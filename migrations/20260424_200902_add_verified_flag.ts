import type { Database } from '../scripts/types/database.js';

export const name = '20260424_200902_add_verified_flag';

export async function up(db: Database): Promise<void> {
  console.log('Adding verified and verified_at_ms columns to puzzles table...');
  
  await db.exec(`
    ALTER TABLE puzzles ADD COLUMN verified INTEGER DEFAULT 0;
  `);

  await db.exec(`
    ALTER TABLE puzzles ADD COLUMN verified_at_ms INTEGER;
  `);

  await db.exec('CREATE INDEX IF NOT EXISTS idx_puzzles_verified ON puzzles(verified)');
  
  console.log('✅ Successfully added verified columns and index');
}

export async function down(db: Database): Promise<void> {
  console.log('Rolling back verified flag migration...');
  
  await db.exec('DROP INDEX IF EXISTS idx_puzzles_verified');
  
  // SQLite doesn't support DROP COLUMN directly, need to recreate table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS puzzles_backup (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fen4 TEXT NOT NULL,
      solution TEXT NOT NULL,
      difficulty TEXT NOT NULL DEFAULT 'medium',
      color_to_move TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      is_bad INTEGER DEFAULT 0
    );
  `);

  await db.exec(`
    INSERT INTO puzzles_backup (id, fen4, solution, difficulty, color_to_move, created_at_ms, is_bad)
    SELECT id, fen4, solution, difficulty, color_to_move, created_at_ms, is_bad FROM puzzles;
  `);

  await db.exec('DROP TABLE puzzles');
  await db.exec('ALTER TABLE puzzles_backup RENAME TO puzzles');

  await db.exec('CREATE INDEX IF NOT EXISTS idx_puzzles_difficulty ON puzzles(difficulty)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_puzzles_color_to_move ON puzzles(color_to_move)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_puzzles_created_at ON puzzles(created_at_ms)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_puzzles_is_bad ON puzzles(is_bad)');
  
  console.log('✅ Successfully rolled back verified flag migration');
}