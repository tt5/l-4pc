import { runMigrations, initializeDatabase } from '../../../scripts/migrate.js';

export async function runDatabaseMigrations() {
  try {
    console.log('Initializing database...');
    await initializeDatabase();
    
    console.log('Running database migrations...');
    const result = await runMigrations();
    
    console.log('Migrations completed successfully');
    return result;
  } catch (error) {
    console.error('❌ Database migration failed:', error);
    process.exit(1);
  }
}