import { join } from 'path';

// Single source of truth for migrations directory
export const MIGRATIONS_DIR = join(process.cwd(), 'migrations');

// Database path - ensure no newlines or special characters
export const DB_PATH = join(process.cwd(), 'data', 'app.db');

export const PATHS = {
  // Use the same migrations directory everywhere
  MIGRATIONS_DIR,
  // For backward compatibility
  SERVER_MIGRATIONS_DIR: MIGRATIONS_DIR,
  // Database path
  DB_PATH,
} as const;

export const MIGRATION_TEMPLATE = `import { Database } from 'sqlite';

export const name = '{{name}}';

export async function up(db: Database): Promise<void> {
  // Write your migration code here
}

export async function down(db: Database): Promise<void> {
  // Write rollback code here
}`;
