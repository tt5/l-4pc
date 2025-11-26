import { readdir, mkdir } from 'fs/promises';
import { createDatabaseConnection } from './core/db.js';
import type { MigrationFile } from './types/database.js';
import { ensureDbDirectory } from './core/db.js';
import { getAllTables } from './utils/db-utils.js';
import { 
  getAppliedMigrations, 
  ensureMigrationsTable
} from './utils/db-utils.js';
import type { Database, MigrationResult, InitResult } from './types/database.js';
import { MIGRATIONS_DIR } from './config.js';


const getMigrationFiles = async (): Promise<string[]> => {
  try {
    // Ensure migrations directory exists
    await mkdir(MIGRATIONS_DIR, { recursive: true });
    
    const files = await readdir(MIGRATIONS_DIR);
    return files
      .filter(file => /^\d+_.+\.(js|ts)$/.test(file) && !file.endsWith('.d.ts'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  } catch (error: any) {
    console.error('Error reading migration files:', error);
    throw error;
  }
};

const loadMigration = async (file: string) => {
  // @vite-ignore
  const migration = await import(`../migrations/${file}`);
  
  // Handle both default and named exports
  const migrationObj = migration.default || migration;
  
  if (!migrationObj?.up) {
    throw new Error(`Invalid migration: ${file} - missing 'up' function`);
  }
  
  return {
    name: migrationObj.name || file.replace(/\.(js|ts)$/, ''),
    up: migrationObj.up,
    down: migrationObj.down || (async () => {
      console.warn(`⚠️  No down migration for: ${file}`);
    }),
  };
};


const runMigrations = async (): Promise<MigrationResult> => {
  console.log('\n=== Database Migration ===');
  const startTime = Date.now();
  
  try {
    console.log('\n1. Validating migrations...');
    const { validateMigrations } = await import('./validate-migrations.js');
    if (!await validateMigrations()) {
      throw new Error('Migration validation failed');
    }
    
    if (!(await ensureDbDirectory())) {
      throw new Error('Failed to ensure data directory');
    }
    
    console.log('\n2. Connecting to database...');
    const db = await createDatabaseConnection();
    
    try {
      console.log('\n3. Checking for migration files...');
      const migrationFiles = await getMigrationFiles();
      console.log(`   Found ${migrationFiles.length} migration files`);
      
      console.log('\n3. Checking for applied migrations...');
      await ensureMigrationsTable(db);
      const appliedMigrations = await getAppliedMigrations(db);
      console.log(`   Found ${appliedMigrations.length} applied migrations`);
      
      const pendingMigrations = migrationFiles.filter(
        file => !appliedMigrations.some(m => m.name === file.replace(/\.[^/.]+$/, ''))
      ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      
      if (!pendingMigrations.length) {
        console.log('✅ Database is up to date');
        return { success: true, applied: 0 };
      }
      
      console.log(`\n4. Found ${pendingMigrations.length} pending migrations:`);
      pendingMigrations.forEach((file, i) => 
        console.log(`   ${i + 1}. ${file}`)
      );
      
      console.log('\n5. Applying migrations...');
      let appliedCount = 0;
      
      for (const file of pendingMigrations) {
        console.log(`\n   🔄 Applying migration: ${file}`);
        const migration = await loadMigration(file);
        
        try {
          await db.run('BEGIN TRANSACTION');
          await migration.up(db);
          await db.run(
            "INSERT INTO migrations (name, applied_at) VALUES (?, strftime('%s', 'now'))",
            migration.name
          );
          await db.run('COMMIT');
          
          console.log(`   ✅ Applied migration: ${file}`);
          appliedCount++;
        } catch (error: any) {
          await db.run('ROLLBACK');
          console.error(`   ❌ Failed to apply migration ${file}:`, error.message);
          return {
            success: false,
            applied: appliedCount,
            error: `Migration failed: ${file} - ${error.message}`,
            pendingMigrations: pendingMigrations.slice(appliedCount)
          };
        }
      }
      
      console.log(`\n✅ Successfully applied ${appliedCount} migrations`);
      return {
        success: true,
        applied: appliedCount
      };
      
    } finally {
      await db.close();
    }
    
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    return {
      success: false,
      applied: 0,
      error: error.message || 'Unknown error during migration'
    };
    
  } finally {
    console.log(`⏱️  Migration completed in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
  }
}

const initializeDatabase = async (): Promise<InitResult> => {
  console.log('\n=== Database Initialization ===');
  const startTime = Date.now();
  const tablesCreated: string[] = [];
  
  try {
    if (!(await ensureDbDirectory())) {
      throw new Error('Failed to ensure data directory');
    }
    
    console.log('\n1. Connecting to database...');
    
    const db = await createDatabaseConnection();
    
    try {
      console.log('\n2. Checking existing tables...');
      const tables = await getAllTables(db);
      
      if (tables.length) {
        console.log('✅ Database already initialized with tables:', tables.map(t => t.name).join(', '));
        return { success: true, tablesCreated: [] };
      }
      
      console.log('\n3. Creating tables...');
      
      // Table definitions
      const tableDefs = [
        {
          name: 'migrations',
          sql: `
            CREATE TABLE IF NOT EXISTS migrations (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL UNIQUE,
              applied_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
          `
        },
        {
          name: 'users',
          sql: `
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY,
              username TEXT NOT NULL UNIQUE,
              password_hash TEXT NOT NULL,
              created_at_ms INTEGER DEFAULT (strftime('%s', 'now') * 1000),
              updated_at_ms INTEGER DEFAULT (strftime('%s', 'now') * 1000)
            )
          `
        },
        {
          name: 'base_points',
          sql: `
            CREATE TABLE IF NOT EXISTS base_points (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id TEXT NOT NULL,
              x INTEGER NOT NULL,
              y INTEGER NOT NULL,
              created_at_ms INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
              updated_at_ms INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
              UNIQUE(user_id, x, y)
            )
          `
        }
      ];
      
      // Create tables in a transaction
      await db.run('BEGIN TRANSACTION');
      try {
        for (const { name, sql } of tableDefs) {
          console.log(`   - Creating ${name} table`);
          await db.exec(sql);
          tablesCreated.push(name);
        }
        await db.run('COMMIT');
      } catch (error) {
        await db.run('ROLLBACK');
        throw error;
      }
      
      console.log(`✅ Database initialized with ${tablesCreated.length} tables`);
      return { success: true, tablesCreated };
      
    } finally {
      await db.close();
    }
  } catch (error: any) {
    console.error('❌ Database initialization failed:', error.message);
    return { 
      success: false, 
      error: error.message || 'Unknown error during initialization',
      tablesCreated: []
    };
  } finally {
    console.log(`⏱️  Initialization completed in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
  }
}

const main = async () => {
  const command = process.argv[2]?.toLowerCase() || 'help';
  
  try {
    switch (command) {
      case 'init':
        await initializeDatabase();
        break;
      case 'migrate':
        await runMigrations();
        break;
      case 'help':
      default:
        showHelp();
        process.exit(0);
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

const showHelp = () => console.log(`
Database Management Tool

Usage:
  npx tsx scripts/migrate.ts <command>

Commands:
  init     Initialize the database with required tables
  migrate  Run pending database migrations
  help     Show this help message

Examples:
  npx tsx scripts/migrate.ts init
  npx tsx scripts/migrate.ts migrate
`);

// Execute the appropriate command when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
}

export {
  runMigrations,
  initializeDatabase,
  getMigrationFiles,
  loadMigration,
  type MigrationFile
};

export type { MigrationResult };

export type { MigrationFunction } from './types/database.js';
