import { Database } from 'sqlite';

export const name = '20250902_000000_initial_schema';

export async function up(db: Database): Promise<void> {
  console.log('Creating initial database schema...');
  
  // Enable foreign keys
  await db.exec('PRAGMA foreign_keys = ON;');
  
  // Create migrations table if it doesn't exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER DEFAULT (strftime('%s', 'now'))
    );
  `);

  // Create users table with required fields
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at_ms INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      updated_at_ms INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    );
  `);

  // Create base_points table with required fields
  // When the server runs the created_at_ms and updated_at_ms fields
  // are in milliseconds
  await db.exec(`
    CREATE TABLE IF NOT EXISTS base_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      created_at_ms INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      updated_at_ms INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, x, y)
    );
  `);

  // Create indexes for better query performance
  await db.exec('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_base_points_user_id ON base_points(user_id)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_base_points_coords ON base_points(x, y)');
  
  console.log('✅ Successfully created initial database schema');
}

export async function down(db: Database): Promise<void> {
  console.log('Dropping all tables...');
  
  // Disable foreign keys temporarily to allow dropping in any order
  await db.exec('PRAGMA foreign_keys = OFF;');
  
  // Drop tables in reverse order of creation
  await db.exec('DROP TABLE IF EXISTS base_points');
  await db.exec('DROP TABLE IF EXISTS users');
  await db.exec('DROP TABLE IF EXISTS migrations');
  
  // Re-enable foreign keys
  await db.exec('PRAGMA foreign_keys = ON;');
  
  console.log('✅ Successfully dropped all tables');
}
