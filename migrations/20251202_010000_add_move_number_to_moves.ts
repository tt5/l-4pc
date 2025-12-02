import { Database } from 'sqlite';

export const name = '20251202_010000_add_move_number_to_moves';

export async function up(db: Database): Promise<void> {
  console.log('Adding move_number column to moves table...');
  
  // Add the move_number column
  await db.exec(`
    ALTER TABLE moves 
    ADD COLUMN move_number INTEGER;
  `);

  // For existing moves, we'll set move_number based on the creation order within each game
  // First, update all games with their move numbers
  await db.exec(`
    WITH NumberedMoves AS (
      SELECT 
        id,
        game_id,
        ROW_NUMBER() OVER (PARTITION BY game_id ORDER BY created_at_ms ASC) as move_num
      FROM moves
    )
    UPDATE moves
    SET move_number = (
      SELECT move_num
      FROM NumberedMoves
      WHERE NumberedMoves.id = moves.id
    )
    WHERE move_number IS NULL;
  `);

  // Make the column NOT NULL after populating it
  await db.exec(`
    CREATE TABLE IF NOT EXISTS moves_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      piece_type TEXT NOT NULL,
      from_x INTEGER NOT NULL,
      from_y INTEGER NOT NULL,
      to_x INTEGER NOT NULL,
      to_y INTEGER NOT NULL,
      captured_piece_id INTEGER,
      move_number INTEGER NOT NULL,
      created_at_ms INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (captured_piece_id) REFERENCES base_points(id) ON DELETE SET NULL
    );
  `);

  // Copy data to the new table
  await db.exec(`
    INSERT INTO moves_new
    SELECT * FROM moves;
  `);

  // Drop the old table and rename the new one
  await db.exec('DROP TABLE moves;');
  await db.exec('ALTER TABLE moves_new RENAME TO moves;');

  // Recreate indexes
  await db.exec('CREATE INDEX IF NOT EXISTS idx_moves_game_id ON moves(game_id)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_moves_user_id ON moves(user_id)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_moves_created_at ON moves(created_at_ms)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_moves_move_number ON moves(move_number)');
  
  console.log('✅ Successfully added move_number column to moves table');
}

export async function down(db: Database): Promise<void> {
  console.log('Removing move_number column from moves table...');
  
  // Create a new table without the move_number column
  await db.exec(`
    CREATE TABLE IF NOT EXISTS moves_old (
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

  // Copy data to the old table structure
  await db.exec(`
    INSERT INTO moves_old (
      id, game_id, user_id, piece_type, from_x, from_y, to_x, to_y, 
      captured_piece_id, created_at_ms
    )
    SELECT 
      id, game_id, user_id, piece_type, from_x, from_y, to_x, to_y, 
      captured_piece_id, created_at_ms
    FROM moves;
  `);

  // Drop the current table and rename the old one back
  await db.exec('DROP TABLE moves;');
  await db.exec('ALTER TABLE moves_old RENAME TO moves;');

  // Recreate indexes
  await db.exec('CREATE INDEX IF NOT EXISTS idx_moves_game_id ON moves(game_id)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_moves_user_id ON moves(user_id)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_moves_created_at ON moves(created_at_ms)');
  
  console.log('✅ Successfully removed move_number column from moves table');
}
