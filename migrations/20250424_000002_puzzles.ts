import { Database } from 'sqlite';

export const name = '20250424_000002_puzzles';

export async function up(db: Database): Promise<void> {
  console.log('Creating puzzles table...');
  
  await db.exec(`
    CREATE TABLE IF NOT EXISTS puzzles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fen4 TEXT NOT NULL,
      solution TEXT NOT NULL,
      difficulty TEXT NOT NULL DEFAULT 'medium',
      color_to_move TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );
  `);

  await db.exec('CREATE INDEX IF NOT EXISTS idx_puzzles_difficulty ON puzzles(difficulty)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_puzzles_color_to_move ON puzzles(color_to_move)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_puzzles_created_at ON puzzles(created_at_ms)');
  
  console.log('✅ Successfully created puzzles table');
}

export async function down(db: Database): Promise<void> {
  console.log('Rolling back puzzles migration...');
  
  await db.exec('DROP INDEX IF EXISTS idx_puzzles_difficulty');
  await db.exec('DROP INDEX IF EXISTS idx_puzzles_color_to_move');
  await db.exec('DROP INDEX IF EXISTS idx_puzzles_created_at');
  await db.exec('DROP TABLE IF EXISTS puzzles');
  
  console.log('✅ Successfully rolled back puzzles migration');
}
