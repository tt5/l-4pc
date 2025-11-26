import { Database } from 'sqlite';

export const name = '20250916_remove_unused_user_id_index';

export async function up(db: Database): Promise<void> {
  console.log('Dropping unused index idx_base_points_user_id...');
  await db.exec('DROP INDEX IF EXISTS idx_base_points_user_id');
  console.log('Index dropped successfully');
}

export async function down(db: Database): Promise<void> {
  console.log('Recreating index idx_base_points_user_id...');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_base_points_user_id ON base_points(user_id)');
  console.log('Index recreated successfully');
}
