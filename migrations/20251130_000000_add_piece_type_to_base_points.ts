import { Database } from 'sqlite';

export const name = '20251130_000000_add_piece_type_to_base_points';

export async function up(db: Database): Promise<void> {
  console.log('Adding piece_type column to base_points table...');
  
  // Add piece_type column with a default value of 'pawn'
  await db.exec(`
    ALTER TABLE base_points
    ADD COLUMN piece_type TEXT NOT NULL DEFAULT 'pawn';
  `);
  
  console.log('piece_type column added successfully');
}

export async function down(db: Database): Promise<void> {
  console.log('Reverting piece_type column addition...');
  
  // SQLite doesn't support DROP COLUMN directly, so we need to create a new table
  await db.exec(`
    CREATE TABLE base_points_backup (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      color TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      game_created_at_ms INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, x, y)
    );
    
    INSERT INTO base_points_backup (id, user_id, x, y, color, created_at_ms, updated_at_ms, game_created_at_ms)
    SELECT id, user_id, x, y, color, created_at_ms, updated_at_ms, game_created_at_ms
    FROM base_points;
    
    DROP TABLE base_points;
    ALTER TABLE base_points_backup RENAME TO base_points;
    
    -- Recreate indexes
    CREATE INDEX IF NOT EXISTS idx_base_points_user_id ON base_points(user_id);
    CREATE INDEX IF NOT EXISTS idx_base_points_coords ON base_points(x, y);
  `);
  
  console.log('piece_type column removed successfully');
}
