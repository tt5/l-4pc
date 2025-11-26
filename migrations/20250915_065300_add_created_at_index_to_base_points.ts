import { Database } from 'sqlite';

export const name = '20250915_065300_add_created_at_index_to_base_points';

export async function up(db: Database): Promise<void> {
  console.log('Adding created_at_ms index to base_points table...');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_base_points_created_at ON base_points(created_at_ms)');
  console.log('Index created successfully');
}

export async function down(db: Database): Promise<void> {
  console.log('Dropping created_at_ms index from base_points table...');
  await db.exec('DROP INDEX IF EXISTS idx_base_points_created_at');
  console.log('Index dropped successfully');
}
