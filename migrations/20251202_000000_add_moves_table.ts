import { Database } from 'sqlite';

export const name = '20251202_000000_add_moves_table';

export async function up(db: Database): Promise<void> {
  console.log('Creating moves table...');
  
  await db.exec(`
    CREATE TABLE IF NOT EXISTS moves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      piece_type TEXT NOT NULL,
      from_x INTEGER NOT NULL,
      from_y INTEGER NOT NULL,
      to_x INTEGER NOT NULL,
      to_y INTEGER NOT NULL,
      captured_piece_id INTEGER,
      created_at_ms INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (captured_piece_id) REFERENCES base_points(id) ON DELETE SET NULL
    );
  `);

  await db.exec('CREATE INDEX IF NOT EXISTS idx_moves_game_id ON moves(game_id)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_moves_user_id ON moves(user_id)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_moves_created_at ON moves(created_at_ms)');
  
  console.log('✅ Successfully created moves table');
}

export async function down(db: Database): Promise<void> {
  console.log('Dropping moves table...');
  await db.exec('DROP TABLE IF EXISTS moves');
  console.log('✅ Successfully dropped moves table');
}
