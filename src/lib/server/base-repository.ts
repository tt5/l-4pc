import { Database } from 'sqlite';
import sqlite3 from 'sqlite3';

type Constructor<T> = new (...args: any[]) => T;

export abstract class BaseRepository<T extends { id?: number | string }> {
  protected tableName: string;
  protected db: Database<sqlite3.Database, sqlite3.Statement>;

  constructor(db: Database<sqlite3.Database, sqlite3.Statement>, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  protected abstract mapToModel(row: any): T;
  protected abstract validate(entity: Partial<T>): void;

  async findOne(id: string | number): Promise<T | undefined> {
    const row = await this.db.get(`SELECT * FROM ${this.tableName} WHERE id = ?`, [id]);
    return row ? this.mapToModel(row) : undefined;
  }

  async findMany(where?: Partial<T>): Promise<T[]> {
    let query = `SELECT * FROM ${this.tableName}`;
    const params: any[] = [];
    
    if (where && Object.keys(where).length > 0) {
      const conditions = Object.entries(where)
        .filter(([_, value]) => value !== undefined)
        .map(([key]) => `${key} = ?`);
      
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
        params.push(...Object.values(where).filter(v => v !== undefined));
      }
    }

    const rows = await this.db.all(query, params);
    return rows.map(row => this.mapToModel(row));
  }

  async create(entity: Omit<T, 'id' | 'created_at_ms'>): Promise<T> {
    this.validate(entity as Partial<T>);
    
    const columns = Object.keys(entity).join(', ');
    const placeholders = Object.keys(entity).map(() => '?').join(', ');
    const values = Object.values(entity);
    
    const { lastID } = await this.db.run(
      `INSERT INTO ${this.tableName} (${columns}, created_at_ms) VALUES (${placeholders}, ?)`,
      [...values, Date.now()]
    );
    
    if (lastID === undefined) {
      throw new Error('Failed to get last insert ID from database');
    }
    
    return this.findOne(lastID) as Promise<T>;
  }

  async update(id: string | number, updates: Partial<T>): Promise<T | undefined> {
    this.validate(updates as T);
    
    const setClause = Object.keys(updates)
      .filter(key => key !== 'id' && key !== 'created_at_ms')
      .map(key => `${key} = ?`)
      .join(', ');
    
    if (!setClause) {
      return this.findOne(id);
    }
    
    const values = Object.entries(updates)
      .filter(([key]) => key !== 'id' && key !== 'created_at_ms')
      .map(([_, value]) => value);
    
    await this.db.run(
      `UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`,
      [...values, id]
    );
    
    return this.findOne(id);
  }

  async count(where?: Partial<T>): Promise<number> {
    let query = `SELECT COUNT(*) as count FROM ${this.tableName}`;
    const params: any[] = [];
    
    if (where && Object.keys(where).length > 0) {
      const conditions = Object.entries(where)
        .filter(([_, value]) => value !== undefined)
        .map(([key]) => `${key} = ?`);
      
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
        params.push(...Object.values(where).filter(v => v !== undefined));
      }
    }
    
    const result = await this.db.get(query, params);
    return result?.count || 0;
  }

  // Helper method for transactions
  async transaction<T>(callback: () => Promise<T>): Promise<T> {
    try {
      await this.db.run('BEGIN');
      const result = await callback();
      await this.db.run('COMMIT');
      return result;
    } catch (error) {
      await this.db.run('ROLLBACK');
      throw error;
    }
  }
}
