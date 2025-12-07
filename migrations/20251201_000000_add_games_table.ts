import { Database } from 'sqlite';

export const name = '20251201_000000_add_games_table';

export async function up(db: Database): Promise<void> {
  console.log('Creating games table...');
  
  await db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      white_player_id TEXT NOT NULL,
      black_player_id TEXT NOT NULL,
      current_turn TEXT NOT NULL DEFAULT 'white',
      status TEXT NOT NULL DEFAULT 'in_progress',
      created_at_ms INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      updated_at_ms INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      FOREIGN KEY (white_player_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (black_player_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await db.exec('CREATE INDEX IF NOT EXISTS idx_games_white_player ON games(white_player_id)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_games_black_player ON games(black_player_id)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_games_status ON games(status)');
  
  console.log('✅ Successfully created games table');
}

export async function down(db: Database): Promise<void> {
  console.log('Dropping games table...');
  await db.exec('DROP TABLE IF EXISTS games');
  console.log('✅ Successfully dropped games table');
}
