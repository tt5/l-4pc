import { readdir } from 'fs/promises';
import { join } from 'path';
import type { Database } from '../core/db.js';
import type { DbMigration } from '../types/database.js';

export type { DbMigration, Database };

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');

/**
 * Get all applied migrations from the database
 */
export const getAppliedMigrations = async (db: Database): Promise<DbMigration[]> => {
  try {
    const result = await db.all<DbMigration>(
      'SELECT id, name, applied_at as applied_at FROM migrations ORDER BY applied_at ASC'
    );
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('Error getting applied migrations:', error);
    return [];
  }
};

export const checkMigrationsTable = (db: Database) => 
  db.get<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'").then(Boolean).catch(() => false);

export const ensureMigrationsTable = (db: Database) => 
  checkMigrationsTable(db).then(exists => {
    if (!exists) {
      return db.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
        )`);
    }
    return Promise.resolve();
  });

export interface TableInfo {
  name: string;
  type: string;
}

export const getAllTables = async (db: Database): Promise<TableInfo[]> => {
  try {
    const result = await db.all<TableInfo>(
      "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'"
    );
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('Error getting all tables:', error);
    return [];
  }
};

export const tableExists = (db: Database, tableName: string) =>
  db.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    [tableName]
  ).then(Boolean).catch(() => false);

export const getTableRowCount = (db: Database, tableName: string) =>
  db.get<{ count: number }>(`SELECT COUNT(*) as count FROM ${tableName}`)
    .then(row => row?.count ?? 0)
    .catch(() => 0);

/**
 * Get the SQL used to create a table
 */
export const getTableSchema = (db: Database, tableName: string): Promise<string | null> => {
  return db.get<{sql: string}>(`
    SELECT sql 
    FROM sqlite_master 
    WHERE type='table' AND name=?
  `, [tableName])
  .then(row => row?.sql || null)
  .catch(() => null);
};

/**
 * Get all migration files from the migrations directory
 */
export const getMigrationFiles = async (): Promise<string[]> => {
  try {
    const files = await readdir(MIGRATIONS_DIR);
    return files
      .filter(file => /^\d+_.+\.(js|ts)$/.test(file))
      .sort();
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      // Directory doesn't exist, return empty array
      return [];
    }
    throw error;
  }
};
