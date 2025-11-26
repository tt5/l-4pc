import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../src/lib/server/db';
import { runMigrations } from './migrate';
import { ensureMigrationsTable } from './utils/db-utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function initializeDatabase() {
  try {
    console.log('Initializing database...');
    
    // This will create the database file if it doesn't exist
    const db = await getDb();
    
    // Ensure migrations table exists
    await ensureMigrationsTable(db);
    
    // Run migrations
    const result = await runMigrations();
    
    if (result.success) {
      console.log('✅ Database initialized successfully');
    } else {
      console.error('❌ Database initialization completed with errors');
      process.exit(1);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    process.exit(1);
  }
}

initializeDatabase();
