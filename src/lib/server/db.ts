import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { promises as fs } from 'fs';
import { dirname } from 'path';
import { assertServer } from './utils';
import { BasePointRepository } from './repositories/base-point.repository';
import { MapTileRepository } from './repositories/map-tile.repository';

export type SqliteDatabase = Database<sqlite3.Database, sqlite3.Statement>;

import { join } from 'path';

// Use a path relative to the project root
const dbDir = process.env.NODE_ENV === 'production' 
  ? process.env.DATA_DIR || join(process.cwd(), 'data')
  : join(process.cwd(), 'data');

const dbPath = join(dbDir, 'app.db');

// Initialize database
let db: SqliteDatabase;
let basePointRepo: BasePointRepository | null = null;
let mapTileRepo: MapTileRepository | null = null;

async function getDb(): Promise<SqliteDatabase> {
  assertServer();
  
  if (!db) {
    console.log('Initializing database connection...');
    
    try {
      // Ensure data directory exists
      await fs.mkdir(dirname(dbPath), { recursive: true });
      
      // Initialize SQLite database
      db = await open({
        filename: dbPath,
        driver: sqlite3.Database,
        mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE
      });
      
      // Set pragmas
      await db.exec('PRAGMA journal_mode = WAL;');
      await db.exec('PRAGMA foreign_keys = ON;');
      
      console.log('Database connection established');
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }
  
  return db;
}

// Create a function to get or create a user's table
async function ensureUserTable(userId: string): Promise<string> {
  const db = await getDb();
  
  try {
    // Ensure repositories are initialized
    await initializeRepositories();
    
    // Create user's table if it doesn't exist
    const tableName = `user_${userId}`;
    await db.exec(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);
    
    // Add default base point for new users
    try {
      const basePointRepo = await getBasePointRepository();
      await basePointRepo.add(userId, 0, 0);
      console.log(`Added default base point for user ${userId}`);
    } catch (error) {
      console.error('Error adding default base point:', error);
      // Don't fail the whole operation if base point creation fails
    }
    
    return tableName;
  } catch (error) {
    console.error('Error in ensureUserTable:', error);
    throw error;
  }
}

async function ensureRepositoriesInitialized() {
  if (!basePointRepo) {
    console.log('Initializing repositories...');
    try {
      await initializeRepositories();
    } catch (error) {
      console.error('Failed to initialize repositories:', error);
      throw new Error('Failed to initialize database repositories');
    }
  }
}

async function getBasePointRepository(): Promise<BasePointRepository> {
  if (!basePointRepo) {
    const db = await getDb();
    basePointRepo = new BasePointRepository(db);
  }
  return basePointRepo;
}

async function getMapTileRepository(): Promise<MapTileRepository> {
  if (!mapTileRepo) {
    const db = await getDb();
    mapTileRepo = new MapTileRepository(db);
  }
  return mapTileRepo;
}

// Initialize repositories when the database is ready
async function initializeRepositories() {
  if (!db) await getDb();
  
  try {
    // Create base_points table with foreign key to users
    await db.exec(`
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
    `);
    
    // Run migrations (they'll be no-ops if already applied)
    console.log('Running database migrations...');
    try {
      await runMigrations();
    } catch (error) {
      console.error('Migrations failed, but continuing with direct table creation:', error);
    }
    
    console.log('Database initialization completed');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
  
  // Initialize basePointRepo and mapTileRepo if not already done
  if (!basePointRepo) {
    basePointRepo = new BasePointRepository(db);
  }
  if (!mapTileRepo) {
    mapTileRepo = new MapTileRepository(db);
  }
}

async function runMigrations() {
  if (!db) throw new Error('Database not initialized');
  
  try {
    console.log('Creating migrations table if not exists...');
    // Ensure migrations table exists with proper schema
    await db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );
    `);

    // Get all migration files from the standard migrations directory
    const fs = await import('fs/promises');
    const path = await import('path');
    
    // Use absolute path for migrations directory
    const MIGRATIONS_DIR = path.join(process.cwd(), 'migrations');
    
    // Ensure migrations directory exists
    await fs.mkdir(MIGRATIONS_DIR, { recursive: true });
    
    // Read and sort migration files
    const migrationFiles = (await fs.readdir(MIGRATIONS_DIR))
      .filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    
    console.log(`Found ${migrationFiles.length} migration files`);
    
    // Get applied migrations - use a transaction to ensure consistency
    let appliedMigrations: Array<{ name: string }> = [];
    try {
      appliedMigrations = await db.all<Array<{ name: string }>>(
        'SELECT name FROM migrations ORDER BY name'
      );
    } catch (error) {
      // If the query fails, the table might not exist yet
      console.log('No migrations table found, will create it');
      await db.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        );
      `);
      appliedMigrations = [];
    }
    
    console.log(`Found ${appliedMigrations.length} applied migrations`);
    
    const appliedSet = new Set(appliedMigrations.map(m => m.name));
    const pendingMigrations = migrationFiles.filter(file => !appliedSet.has(file.replace(/\.ts$/, '')));
    
    try {
      for (const file of migrationFiles) {
        const migrationName = file.replace(/\.ts$/, '');
        
        if (!appliedSet.has(migrationName)) {
          console.log(`\n=== Running migration: ${migrationName} ===`);
          const migrationPath = path.join(MIGRATIONS_DIR, file);
          console.log(`Importing migration from: ${migrationPath}`);
          
          try {
            // Import the migration module using dynamic import with absolute path
            const migrationPath = path.join(process.cwd(), 'scripts', 'migrations', file.replace(/\.ts$/, ''));
            const migration = await import(/* @vite-ignore */ migrationPath);
            
            if (!migration.up) {
              throw new Error(`Migration ${migrationName} is missing the 'up' function`);
            }
            
            console.log(`Executing migration: ${migrationName}`);
            
            // Use the database connection directly
            console.log(`Executing migration: ${migrationName}`);
            await migration.up(db);
            
            // Mark migration as applied
            console.log(`Marking migration as applied: ${migrationName}`);
            try {
              await db.run(
                'INSERT OR IGNORE INTO migrations (name) VALUES (?)',
                [migrationName]
              );
              console.log(`✅ Successfully applied migration: ${migrationName}`);
            } catch (error) {
              if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
                console.log(`ℹ️ Migration already marked as applied: ${migrationName}`);
              } else {
                throw error;
              }
            }
          } catch (error) {
            console.error(`❌ Failed to apply migration ${migrationName}:`, error);
            throw error;
          }
        } else {
          console.log(`✓ Migration already applied: ${migrationName}`);
        }
      }
      
      if (pendingMigrations.length > 0) {
        console.log('All migrations completed successfully');
      } else {
        console.log('No pending migrations to apply');
      }
      
    } catch (error) {
      console.error('Migration failed:', error);
      throw error;
    }
    
  } catch (error) {
    console.error('Migration process failed:', error);
    throw error; // Re-throw to be handled by the caller
  }
}

// Export all necessary functions
export {
  getDb,
  ensureUserTable,
  getBasePointRepository,
  getMapTileRepository,
  initializeRepositories,
  runMigrations
};
