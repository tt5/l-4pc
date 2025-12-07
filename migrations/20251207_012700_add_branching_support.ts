import { Database } from 'sqlite';

export const name = '20251207_012700_add_branching_support';

export async function up(db: Database): Promise<void> {
  console.log('Adding branching support to the database...');
  
  // Add position tracking to games table
  await db.exec(`
    ALTER TABLE games
    ADD COLUMN current_position_id TEXT;
  `);
  
  await db.exec(`
    ALTER TABLE games
    ADD COLUMN initial_position_id TEXT;
  `);

  // Create game_positions table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS game_positions (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      parent_position_id TEXT,
      position_number INTEGER NOT NULL,
      board_state TEXT NOT NULL,
      is_check BOOLEAN NOT NULL DEFAULT 0,
      is_checkmate BOOLEAN NOT NULL DEFAULT 0,
      is_stalemate BOOLEAN NOT NULL DEFAULT 0,
      created_at_ms INTEGER NOT NULL,
      last_accessed_ms INTEGER NOT NULL,
      FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_position_id) REFERENCES game_positions(id) ON DELETE SET NULL
    );
  `);

  // Update moves table to reference positions
  await db.exec(`
    ALTER TABLE moves
    ADD COLUMN position_before_id TEXT;
  `);
  
  await db.exec(`
    ALTER TABLE moves
    ADD COLUMN position_after_id TEXT;
  `);
  
  await db.exec(`
    ALTER TABLE moves
    ADD COLUMN is_branch BOOLEAN NOT NULL DEFAULT 0;
  `);
  
  await db.exec(`
    ALTER TABLE moves
    ADD COLUMN branch_name TEXT;
  `);

  // Create indexes for performance
  await db.exec('CREATE INDEX IF NOT EXISTS idx_game_positions_game_id ON game_positions(game_id)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_game_positions_parent_id ON game_positions(parent_position_id)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_moves_position_before ON moves(position_before_id)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_moves_position_after ON moves(position_after_id)');
  
  console.log('✅ Successfully added branching support');
}

export async function down(db: Database): Promise<void> {
  console.log('Reverting branching support changes...');
  
  // Drop new indexes
  await db.exec('DROP INDEX IF EXISTS idx_moves_position_after');
  await db.exec('DROP INDEX IF EXISTS idx_moves_position_before');
  await db.exec('DROP INDEX IF EXISTS idx_game_positions_parent_id');
  await db.exec('DROP INDEX IF EXISTS idx_game_positions_game_id');
  
  // Remove columns from moves table
  await db.exec('ALTER TABLE moves DROP COLUMN IF EXISTS position_before_id');
  await db.exec('ALTER TABLE moves DROP COLUMN IF EXISTS position_after_id');
  await db.exec('ALTER TABLE moves DROP COLUMN IF EXISTS is_branch');
  await db.exec('ALTER TABLE moves DROP COLUMN IF EXISTS branch_name');
  
  // Drop positions table
  await db.exec('DROP TABLE IF EXISTS game_positions');
  
  // Remove columns from games table
  await db.exec('ALTER TABLE games DROP COLUMN IF EXISTS current_position_id');
  await db.exec('ALTER TABLE games DROP COLUMN IF EXISTS initial_position_id');
  
  console.log('✅ Successfully reverted branching support changes');
}
