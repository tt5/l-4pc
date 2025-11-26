import { Database } from 'sqlite';

export const name = '20250918_005600_add_game_created_at_ms';

export async function up(db: Database): Promise<void> {
  console.log('Adding game_created_at_ms column...');
  
  // Add the column without a default value first (SQLite limitation)
  await db.exec(`
    ALTER TABLE base_points 
    ADD COLUMN game_created_at_ms INTEGER;
  `);
  
  // Set the value for all existing rows to match created_at_ms
  await db.exec(`
    UPDATE base_points 
    SET game_created_at_ms = created_at_ms;
  `);
  
  console.log('✅ Successfully added game_created_at_ms column');
}

export async function down(db: Database): Promise<void> {
  console.log('Removing game_created_at_ms column...');
  
  // SQLite doesn't support DROP COLUMN directly, so we need to create a new table
  await db.exec(`
    PRAGMA foreign_keys=off;
    
    -- Create new table without the column
    CREATE TABLE base_points_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, x, y)
    );
    
    -- Copy data from old table to new table
    INSERT INTO base_points_new (
      id, user_id, x, y, created_at_ms, updated_at_ms
    )
    SELECT 
      id, user_id, x, y, created_at_ms, updated_at_ms
    FROM base_points;
    
    -- Drop old table and rename new one
    DROP TABLE base_points;
    ALTER TABLE base_points_new RENAME TO base_points;
    
    -- Recreate indexes
    CREATE INDEX IF NOT EXISTS idx_base_points_user_id ON base_points(user_id);
    CREATE INDEX IF NOT EXISTS idx_base_points_coords ON base_points(x, y);
    
    PRAGMA foreign_keys=on;
  `);
  
  console.log('✅ Successfully removed game_created_at_ms column');
}
