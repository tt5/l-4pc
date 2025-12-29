import { Database } from 'sqlite';

export const name = '20251229_000000_consolidated_schema';

export async function up(db: Database): Promise<void> {
  console.log('Running consolidated database migration...');
  
  // Enable foreign keys
  await db.exec('PRAGMA foreign_keys = ON;');

  // 1. Create migrations table (no dependencies)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);

  // 2. Create users table (no foreign key dependencies)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      game_joined INTEGER DEFAULT 0,
      home_x INTEGER,
      home_y INTEGER,
      created_at_ms INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      updated_at_ms INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    );
  `);

  // 3. Create base_points table (depends on users)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS base_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      piece_type TEXT NOT NULL DEFAULT 'pawn',
      color TEXT NOT NULL DEFAULT 'white',
      created_at_ms INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      updated_at_ms INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, x, y)
    );
  `);

  // 4. Create moves table (depends on users, games, and base_points)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS moves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      piece_type TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT 'white',
      from_x INTEGER NOT NULL,
      from_y INTEGER NOT NULL,
      to_x INTEGER NOT NULL,
      to_y INTEGER NOT NULL,
      move_number INTEGER,
      captured_piece_id INTEGER,
      position_before_id INTEGER,
      position_after_id INTEGER,
      is_branch BOOLEAN NOT NULL DEFAULT 0,
      branch_name TEXT,
      created_at_ms INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (captured_piece_id) REFERENCES base_points(id) ON DELETE SET NULL,
      FOREIGN KEY (position_before_id) REFERENCES base_points(id) ON DELETE SET NULL,
      FOREIGN KEY (position_after_id) REFERENCES base_points(id) ON DELETE SET NULL
    );
  `);

  // Create all indexes after tables are created
  console.log('Creating indexes...');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
  
  // Add columns if they don't exist
  try {
    await db.exec('ALTER TABLE users ADD COLUMN game_joined INTEGER DEFAULT 0');
    console.log('Added game_joined column to users table');
  } catch (error: unknown) {
    if (error instanceof Error && !error.message.includes('duplicate column name')) {
      throw error;
    }
  }

  try {
    await db.exec('ALTER TABLE base_points ADD COLUMN color TEXT NOT NULL DEFAULT "white"');
    console.log('Added color column to base_points table');
  } catch (error: unknown) {
    if (error instanceof Error && !error.message.includes('duplicate column name')) {
      throw error;
    }
  }

  try {
    await db.exec('ALTER TABLE base_points ADD COLUMN piece_type TEXT NOT NULL DEFAULT "pawn"');
    console.log('Added piece_type column to base_points table');
  } catch (error: unknown) {
    if (error instanceof Error && !error.message.includes('duplicate column name')) {
      throw error;
    }
  }
  await db.exec('CREATE INDEX IF NOT EXISTS idx_base_points_user_id ON base_points(user_id)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_base_points_coords ON base_points(x, y)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_base_points_created_at ON base_points(created_at_ms)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_moves_user_id ON moves(user_id)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_moves_game_id ON moves(game_id)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_moves_created_at ON moves(created_at_ms)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_moves_move_number ON moves(move_number)');
  
  console.log('✅ Successfully applied consolidated database schema');
}

export async function down(db: Database): Promise<void> {
  console.log('Rolling back consolidated migration...');
  
  // Disable foreign keys temporarily to allow dropping in any order
  await db.exec('PRAGMA foreign_keys = OFF;');
  
  // Drop tables in reverse order of creation
  await db.exec('DROP TABLE IF EXISTS moves');
  await db.exec('DROP TABLE IF EXISTS base_points');
  await db.exec('DROP TABLE IF EXISTS users');
  await db.exec('DROP TABLE IF EXISTS migrations');
  
  // Re-enable foreign keys
  await db.exec('PRAGMA foreign_keys = ON;');
  
  console.log('✅ Successfully rolled back consolidated migration');
}
