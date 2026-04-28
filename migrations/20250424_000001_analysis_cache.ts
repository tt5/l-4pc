import type { Database } from '../scripts/types/database.js';

export const name = '20250424_000001_analysis_cache';

export async function up(db: Database): Promise<void> {
  console.log('Creating analysis_cache table...');
  
  await db.exec(`
    CREATE TABLE IF NOT EXISTS analysis_cache (
      hash_key INTEGER PRIMARY KEY,
      best_move TEXT NOT NULL,
      depth INTEGER NOT NULL,
      engine_version TEXT NOT NULL DEFAULT '0.1',
      created_at_ms INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
    );
  `);

  await db.exec('CREATE INDEX IF NOT EXISTS idx_analysis_cache_created_at ON analysis_cache(created_at_ms)');
  
  console.log('✅ Successfully created analysis_cache table');
}

export async function down(db: Database): Promise<void> {
  console.log('Rolling back analysis_cache migration...');
  
  await db.exec('DROP INDEX IF EXISTS idx_analysis_cache_created_at');
  await db.exec('DROP TABLE IF EXISTS analysis_cache');
  
  console.log('✅ Successfully rolled back analysis_cache migration');
}
