import { DatabaseSync, StatementSync } from 'node:sqlite';
import { promises as fs } from 'fs';
import { dirname } from 'path';

export interface DatabaseOptions {
  filename: string;
  driver?: any;
  mode?: number;
}

export interface RunResult {
  lastID: number;
  changes: number;
}

export class Database {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async run(sql: string, params: any[] = []): Promise<RunResult> {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return {
      lastID: Number(result.lastInsertRowid),
      changes: Number(result.changes)
    };
  }

  async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    const results: T[] = [];
    for (const row of stmt.all(...params)) {
      results.push(row as T);
    }
    return results;
  }

  async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params);
    return result as T | undefined;
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

export async function open(options: DatabaseOptions): Promise<Database> {
  const { filename } = options;

  // Ensure directory exists
  await fs.mkdir(dirname(filename), { recursive: true });

  // Create database connection
  const db = new DatabaseSync(filename);

  return new Database(db);
}

// Re-export types for compatibility
export type { DatabaseSync as SqliteDatabase, StatementSync as Statement };
