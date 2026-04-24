import { Database } from 'sqlite';

export const name = '20260424_211319_add_bad_flag';

export async function up(db: Database): Promise<void> {
  console.log('Adding is_bad column to puzzles table...');
  
  await db.exec(`
    ALTER TABLE puzzles ADD COLUMN is_bad INTEGER DEFAULT 0;
  `);

  await db.exec('CREATE INDEX IF NOT EXISTS idx_puzzles_is_bad ON puzzles(is_bad)');
  
  console.log('✅ Successfully added is_bad column and index');
}

export async function down(db: Database): Promise<void> {
  console.log('Rolling back bad flag migration...');
  
  await db.exec('DROP INDEX IF EXISTS idx_puzzles_is_bad');
  
  // SQLite doesn't support DROP COLUMN directly, need to recreate table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS puzzles_backup (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fen4 TEXT NOT NULL,
      solution TEXT NOT NULL,
      difficulty TEXT NOT NULL DEFAULT 'medium',
      color_to_move TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );
  `);

  await db.exec(`
    INSERT INTO puzzles_backup (id, fen4, solution, difficulty, color_to_move, created_at_ms)
    SELECT id, fen4, solution, difficulty, color_to_move, created_at_ms FROM puzzles;
  `);

  await db.exec('DROP TABLE puzzles');
  await db.exec('ALTER TABLE puzzles_backup RENAME TO puzzles');

  await db.exec('CREATE INDEX IF NOT EXISTS idx_puzzles_difficulty ON puzzles(difficulty)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_puzzles_color_to_move ON puzzles(color_to_move)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_puzzles_created_at ON puzzles(created_at_ms)');
  
  console.log('✅ Successfully rolled back bad flag migration');
}
