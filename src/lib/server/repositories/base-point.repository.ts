import { Database } from 'sqlite';
import { BasePoint } from '../../../types/board';

export interface CreateBasePointInput {
  userId: string;
  x: number;
  y: number;
  gameCreatedAtMs: number;
  pieceType?: string; // Optional with default value
}

export class BasePointRepository {
  constructor(private db: Database) {}

  async getAll(): Promise<BasePoint[]> {
    const results = await this.db.all<BasePoint[]>(
      'SELECT id, user_id as userId, x, y, color, piece_type as pieceType, game_created_at_ms as createdAtMs FROM base_points'
    );
    return results || [];
  }

  async getByUser(userId: string): Promise<BasePoint[]> {
    const results = await this.db.all<BasePoint[]>(
      'SELECT id, user_id as userId, x, y, color, piece_type as pieceType, game_created_at_ms as createdAtMs FROM base_points WHERE user_id = ?',
      [userId]
    );
    return results || [];
  }

  /**
   * Get the total count of all base points in the database
   */
  async getTotalCount(): Promise<number> {
    const result = await this.db.get<{count: number}>(
      'SELECT COUNT(*) as count FROM base_points'
    );
    return result?.count || 0;
  }

  /**
   * Gets the count of base points excluding the origin (0,0)
   */
  async getCountExcludingOrigin(): Promise<number> {
    const result = await this.db.get<{count: number}>(
      'SELECT COUNT(*) as count FROM base_points WHERE x != 0 OR y != 0'
    );
    return result?.count || 0;
  }

  async getPointsInBounds(minX: number, minY: number, maxX: number, maxY: number): Promise<BasePoint[]> {
    const results = await this.db.all<BasePoint[]>(
      'SELECT id, user_id as userId, x, y, color, piece_type as pieceType, game_created_at_ms as createdAtMs ' +
      'FROM base_points ' +
      'WHERE x >= ? AND x <= ? AND y >= ? AND y <= ?',
      [minX, maxX, minY, maxY]
    );
    return results || [];
  }

  async add(userId: string, x: number, y: number, color?: string, pieceType: string = 'pawn'): Promise<BasePoint> {
    // Determine color and piece type based on position
    if (x === 7 && y === 0) {
      color = '#FFEB3B';    // Top - Yellow
      pieceType = 'queen';
    } else if (x === 6 && y === 13) {
      color = '#F44336';    // Bottom - Red
      pieceType = 'queen';
    } else if (x === 0 && y === 6) {
      color = '#2196F3';    // Left - Blue
      pieceType = 'queen';
    } else if (color === undefined) {
      color = '#4CAF50';    // Default to green (right)
    }
    const now = Date.now();
    
    try {
      // Start a transaction to ensure both operations succeed or fail together
      await this.db.run('BEGIN TRANSACTION');
      
      try {
        // Check if user exists in users table
        const userExists = await this.db.get<{count: number}>(
          'SELECT COUNT(*) as count FROM users WHERE id = ?',
          [userId]
        );
        
        if (!userExists || userExists.count === 0) {
          throw new Error(`User ${userId} not found`);
        }
        

        // First, try to get the existing base point
        const existing = await this.db.get<BasePoint>(
          'SELECT id, x, y, game_created_at_ms as createdAtMs FROM base_points WHERE user_id = ? AND x = ? AND y = ?',
          [userId, x, y]
        );

        if (existing) {
          await this.db.run('COMMIT');
          return existing;
        }

        // Insert the base point
        const result = await this.db.run(
          'INSERT INTO base_points (user_id, x, y, game_created_at_ms, color, piece_type) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, x, y, now, color, pieceType]
        );

        // Commit the transaction
        await this.db.run('COMMIT');
        
        
        // Fetch the complete base point to ensure all fields are included
        const insertedPoint = await this.db.get<BasePoint>(
          'SELECT id, user_id as userId, x, y, color, piece_type as pieceType, game_created_at_ms as createdAtMs FROM base_points WHERE id = ?',
          [result.lastID]
        );

        if (!insertedPoint) {
          throw new Error('Failed to retrieve created base point');
        }
        
        return insertedPoint;
      } catch (error) {
        console.error('[BasePointRepository] Error in transaction:', error);
        await this.db.run('ROLLBACK');
        throw error;
      }
    } catch (error) {
      console.error('[BasePointRepository] Error in add method:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        userId,
        x,
        y,
        now,
        dbState: {
          userExists: await this.db.get('SELECT id, username FROM users WHERE id = ?', [userId]),
          basePoints: await this.db.all('SELECT * FROM base_points WHERE user_id = ?', [userId])
        }
      });
      throw new Error(`Failed to add base point: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * DEVELOPMENT-ONLY: Removes all base points for a specific user.
   * 
   * ⚠️ This method should only be used in development mode and is called
   * exclusively through the DevTools interface. It is protected by environment
   * checks in the API layer and will be disabled in production.
   * 
   * @param userId - The ID of the user whose base points should be removed
   * @returns A promise that resolves when the operation is complete
   * @throws {Error} If called in production environment
   */
  async deleteAllBasePointsForUser(userId: string): Promise<void> {
    await this.db.run('DELETE FROM base_points WHERE user_id = ?', [userId]);
  }

  /**
   * Delete multiple points in a single transaction
   * @param points Array of points to delete
   */
  async deletePoints(points: Array<{ id: number }>): Promise<void> {
    if (points.length === 0) return;
    
    // Get the first point to use for the event
    const firstPoint = await this.db.get<BasePoint>(
      'SELECT id, user_id as userId, x, y, game_created_at_ms as createdAtMs FROM base_points WHERE id = ?',
      [points[0].id]
    );

    if (!firstPoint) return;

    await this.db.run('BEGIN TRANSACTION');
    try {
      // Delete all points in a single query
      await this.db.run(
        'DELETE FROM base_points WHERE id IN (' + points.map(() => '?').join(',') + ')' , 
        points.map(p => p.id)
      );
      
      // Emit a single event with the count of deleted points
      const { basePointEventService } = await import('~/lib/server/events/base-point-events');
      const eventPoint = { ...firstPoint, count: points.length };
      basePointEventService.emitDeleted(eventPoint);
      
      await this.db.run('COMMIT');
    } catch (error) {
      await this.db.run('ROLLBACK');
      console.error(`[BasePointRepository] Failed to delete ${points.length} points:`, error);
      throw error;
    }
  }

  /**
   * Deletes a base point by ID
   * @param id The ID of the base point to delete
   * @returns True if the base point was deleted, false otherwise
   */
  async delete(id: number): Promise<boolean> {
    try {
      const result = await this.db.run('DELETE FROM base_points WHERE id = ?', [id]);
      return (result.changes || 0) > 0;
    } catch (error) {
      console.error(`[BasePointRepository] Failed to delete base point ${id}:`, error);
      throw error;
    }
  }

  async getById(id: number): Promise<BasePoint | null> {
    const result = await this.db.get<BasePoint>(
      'SELECT id, user_id as userId, x, y, color, piece_type as pieceType, game_created_at_ms as createdAtMs FROM base_points WHERE id = ?',
      [id]
    );
    return result || null;
  }

  /**
   * Finds a base point by its coordinates
   * @param x The x-coordinate
   * @param y The y-coordinate
   * @returns The base point if found, null otherwise
   */
  async findByCoordinates(x: number, y: number): Promise<BasePoint | null> {
    const result = await this.db.get<BasePoint>(
      'SELECT id, user_id as userId, x, y, color, piece_type as pieceType, game_created_at_ms as createdAtMs FROM base_points WHERE x = ? AND y = ?',
      [x, y]
    );
    return result || null;
  }

  async update(id: number, x: number, y: number): Promise<BasePoint | null> {
    await this.db.run(
      'UPDATE base_points SET x = ?, y = ? WHERE id = ?',
      [x, y, id]
    );
    
    return this.getById(id);
  }

  async create(input: CreateBasePointInput): Promise<BasePoint> {
    let { userId, x, y, gameCreatedAtMs, pieceType = 'pawn' } = input;
    
    // Set color and piece type based on position
    let color = '#4CAF50'; // Default to green (right)
    if (x === 7 && y === 0) {
      color = '#FFEB3B';    // Top - Yellow
      pieceType = 'queen';
    } else if (x === 6 && y === 13) {
      color = '#F44336';    // Bottom - Red
      pieceType = 'queen';
    } else if (x === 0 && y === 6) {
      color = '#2196F3';    // Left - Blue
      pieceType = 'queen';
    }
    
    const result = await this.db.run(
      'INSERT INTO base_points (user_id, x, y, game_created_at_ms, color, piece_type) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, x, y, gameCreatedAtMs, color, pieceType]
    );

    return {
      id: result.lastID!,
      userId,
      x,
      y,
      color,
      pieceType: pieceType as any, // Cast to any to match the BasePoint interface
      createdAtMs: gameCreatedAtMs
    };
  }

  /**
   * Gets the oldest base point by game_created_at_ms that is not at (0,0)
   */
  async getOldest(): Promise<BasePoint | null> {
    const result = await this.db.get<BasePoint>(
      'SELECT id, user_id as userId, x, y, game_created_at_ms as createdAtMs ' +
      'FROM base_points ' +
      'WHERE x != 0 OR y != 0 ' +
      'ORDER BY game_created_at_ms ASC LIMIT 1'
    );
    return result || null;
  }


  async deleteBasePoint(id: number): Promise<BasePoint | null> {
    // First get the point to return it after deletion
    const point = await this.db.get<BasePoint>(
      'SELECT id, user_id as userId, x, y, game_created_at_ms as createdAtMs FROM base_points WHERE id = ?',
      [id]
    );

    if (!point) {
      return null;
    }

    // Start a transaction to ensure atomicity
    await this.db.run('BEGIN TRANSACTION');
    
    try {
      // Delete the point
      await this.db.run('DELETE FROM base_points WHERE id = ?', [id]);
      
      // Emit the deletion event
      const { basePointEventService } = await import('~/lib/server/events/base-point-events');
      basePointEventService.emitDeleted(point);
      
      await this.db.run('COMMIT');
      return point;
    } catch (error) {
      await this.db.run('ROLLBACK');
      console.error(`[BasePointRepository] Failed to delete point ${id}:`, error);
      throw error;
    }
  }
}
