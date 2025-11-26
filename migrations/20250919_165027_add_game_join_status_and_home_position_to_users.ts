import { Database } from 'sqlite';

export const name = '20250919_165027_add_game_join_status_and_home_position_to_users';

async function columnExists(db: Database, table: string, column: string): Promise<boolean> {
  const result = await db.get(
    `SELECT name FROM pragma_table_info(?) WHERE name = ?`,
    [table, column]
  );
  return !!result;
}

export async function up(db: Database): Promise<void> {
  // Check and add game_joined column if it doesn't exist
  const gameJoinedExists = await columnExists(db, 'users', 'game_joined');
  if (!gameJoinedExists) {
    await db.exec(`
      ALTER TABLE users
      ADD COLUMN game_joined BOOLEAN NOT NULL DEFAULT 0
    `);
  }

  // Check and add home_x column if it doesn't exist
  const homeXExists = await columnExists(db, 'users', 'home_x');
  if (!homeXExists) {
    await db.exec(`
      ALTER TABLE users
      ADD COLUMN home_x INTEGER NOT NULL DEFAULT 0
    `);
  }

  // Check and add home_y column if it doesn't exist
  const homeYExists = await columnExists(db, 'users', 'home_y');
  if (!homeYExists) {
    await db.exec(`
      ALTER TABLE users
      ADD COLUMN home_y INTEGER NOT NULL DEFAULT 0
    `);
  }
}

export async function down(db: Database): Promise<void> {
  // Drop the columns if they exist
  await db.exec('PRAGMA foreign_keys=off');
  
  // Create a new table without the columns we want to remove
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users_backup (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Copy data from old table to new table
  await db.exec(`
    INSERT INTO users_backup (id, username, email, password_hash, created_at, updated_at)
    SELECT id, username, email, password_hash, created_at, updated_at FROM users
  `);

  // Drop old table
  await db.exec('DROP TABLE users');
  
  // Rename new table to original name
  await db.exec('ALTER TABLE users_backup RENAME TO users');
  
  // Recreate indexes and triggers if needed
  await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)');
  await db.exec('PRAGMA foreign_keys=on');
}