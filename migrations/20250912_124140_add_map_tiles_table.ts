import { Database } from 'sqlite';

export const name = '20250912_124140_add_map_tiles_table';

export async function up(db: Database): Promise<void> {
  console.log('Creating map_tiles table...');
  
  await db.exec(`
    CREATE TABLE IF NOT EXISTS map_tiles (
      tile_x INTEGER NOT NULL,  -- Tile X coordinate
      tile_y INTEGER NOT NULL,  -- Tile Y coordinate
      data BLOB NOT NULL,      -- Bitmap data (1 bit per coordinate)
      version INTEGER NOT NULL DEFAULT 1,
      last_updated_ms INTEGER NOT NULL,
      PRIMARY KEY (tile_x, tile_y)
    );
  `);

  // Add index for spatial queries
  await db.exec('CREATE INDEX IF NOT EXISTS idx_map_tiles_coords ON map_tiles(tile_x, tile_y)');
  
  console.log('✅ Created map_tiles table and indexes');
}

export async function down(db: Database): Promise<void> {
  console.log('Dropping map_tiles table...');
  
  await db.exec('DROP INDEX IF EXISTS idx_map_tiles_coords');
  await db.exec('DROP TABLE IF EXISTS map_tiles');
  
  console.log('✅ Dropped map_tiles table and indexes');
}