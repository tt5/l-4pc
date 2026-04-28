// Import the base Database type from sqlite-compat
import type { Database as SqliteDatabase } from '../../src/lib/server/sqlite-compat.js';

// Export our enhanced Database type
export interface Database extends SqliteDatabase {
  // Add any custom methods or properties here if needed
}

// Augment the sqlite-compat module with our custom methods
declare module '../../src/lib/server/sqlite-compat' {
  interface Database {
    // Add any custom methods or properties here if needed
  }
}

// Backup options interface
export interface BackupOptions {
  maxBackups?: number;
  backupDir?: string;
}

export interface DbMigration {
  id: number;
  name: string;
  applied_at: number;
}

export interface TableInfo {
  cid: number;
  name: string;
  type: string;
  notnull: 0 | 1;
  dflt_value: any;
  pk: 0 | 1;
}

export type MigrationFunction = (db: Database) => Promise<void>;

export interface MigrationFile {
  id: string;
  name: string;
  up: MigrationFunction;
  down?: MigrationFunction;
}

export interface MigrationResult {
  success: boolean;
  applied: number;
  error?: string;
  pendingMigrations?: string[];
}

export interface InitResult {
  success: boolean;
  error?: string;
  tablesCreated: string[];
}

export interface CheckResult {
  success: boolean;
  error?: string;
  dbExists: boolean;
  tables: Array<{
    name: string;
    rowCount: number;
    schema: string;
  }>;
  migrations: DbMigration[];
  missingTables: string[];
  requiredTables: string[];
}
