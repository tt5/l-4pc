import { Database } from 'sqlite';
import { BasePoint } from '../../../types/board';

type Position = { x: number; y: number };
type PiecePositions = {
  rook: Position[];
  knight: Position[];
  bishop: Position[];
  queen: Position[];
  king: Position[];
  pawn: Position[];
};

type InitialPositions = {
  [color: string]: PiecePositions;
};

export interface CreateBasePointInput {
  userId: string;
  x: number;
  y: number;
  gameCreatedAtMs: number;
  pieceType?: string; // Optional with default value
}

export class BasePointRepository {
  constructor(private db: Database) {}

  /**
   * Executes a database transaction
   * @param callback A function that performs database operations within the transaction
   * @returns A promise that resolves with the result of the callback
   * @throws If an error occurs during the transaction, it will be rethrown after rollback
   */
  async executeTransaction<T>(callback: (db: Database) => Promise<T>): Promise<T> {
    await this.db.run('BEGIN TRANSACTION');
    try {
      const result = await callback(this.db);
      await this.db.run('COMMIT');
      return result;
    } catch (error) {
      await this.db.run('ROLLBACK');
      throw error;
    }
  }

  async getAll(): Promise<BasePoint[]> {
    const results = await this.db.all<BasePoint[]>(
      'SELECT id, user_id as userId, x, y, color, piece_type as pieceType, created_at_ms as createdAtMs FROM base_points'
    );
    return results || [];
  }

  async getByUser(userId: string): Promise<BasePoint[]> {
    const results = await this.db.all<BasePoint[]>(
      'SELECT id, user_id as userId, x, y, color, piece_type as pieceType, created_at_ms as createdAtMs FROM base_points WHERE user_id = ?',
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
      'SELECT id, user_id as userId, x, y, color, piece_type as pieceType, created_at_ms as createdAtMs ' +
      'FROM base_points ' +
      'WHERE x >= ? AND x <= ? AND y >= ? AND y <= ?',
      [minX, maxX, minY, maxY]
    );
    return results || [];
  }

  async add(userId: string, x: number, y: number, color?: string, pieceType: string = 'pawn'): Promise<BasePoint> {
    // Determine color and piece type based on position
    if (x === 7 && y === 0) {
      color = '#FFEB3B';    // Top - Yellow Queen
      pieceType = 'queen';
    } else if (x === 6 && y === 0) {
      color = '#FFEB3B';    // Top - Yellow King
      pieceType = 'king';
    } else if (x === 6 && y === 13) {
      color = '#F44336';    // Bottom - Red Queen
      pieceType = 'queen';
    } else if (x === 7 && y === 13) {
      color = '#F44336';    // Bottom - Red King
      pieceType = 'king';
    } else if (x === 0 && y === 6) {
      color = '#2196F3';    // Left - Blue Queen
      pieceType = 'queen';
    } else if (x === 0 && y === 7) {
      color = '#2196F3';    // Left - Blue King
      pieceType = 'king';
    } else if (x === 13 && y === 7) {
      color = '#4CAF50';    // Right - Green Queen
      pieceType = 'queen';
    } else if (x === 13 && y === 6) {
      color = '#4CAF50';    // Right - Green King
      pieceType = 'king';
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
          'SELECT id, x, y, created_at_ms as createdAtMs FROM base_points WHERE user_id = ? AND x = ? AND y = ?',
          [userId, x, y]
        );

        if (existing) {
          await this.db.run('COMMIT');
          return existing;
        }

        // Insert the base point
        const result = await this.db.run(
          'INSERT INTO base_points (user_id, x, y, created_at_ms, color, piece_type) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, x, y, now, color, pieceType]
        );

        // Commit the transaction
        await this.db.run('COMMIT');
        
        
        // Fetch the complete base point to ensure all fields are included
        const insertedPoint = await this.db.get<BasePoint>(
          'SELECT id, user_id as userId, x, y, color, piece_type as pieceType, created_at_ms as createdAtMs FROM base_points WHERE id = ?',
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
      
      // Points deleted successfully
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
      'SELECT id, user_id as userId, x, y, color, piece_type as pieceType, created_at_ms as createdAtMs FROM base_points WHERE id = ?',
      [id]
    );
    return result || null;
  }

  /**
   * Finds a base point by its coordinates
   * @param x The x-coordinate
   * @param y The y-coordinate
   * @param excludeId Optional ID to exclude from the search (useful when moving a piece)
   * @returns The base point if found, null otherwise
   */
  async findByCoordinates(x: number, y: number, excludeId?: number): Promise<BasePoint | null> {
    const query = `
      SELECT id, user_id as userId, x, y, color, piece_type as pieceType, created_at_ms as createdAtMs 
      FROM base_points 
      WHERE x = ? AND y = ? ${excludeId ? 'AND id != ?' : ''}
    `;
    const params = excludeId ? [x, y, excludeId] : [x, y];
    
    const result = await this.db.get<BasePoint>(query, params);
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
      color = '#FFEB3B';    // Top - Yellow Queen
      pieceType = 'queen';
    } else if (x === 6 && y === 0) {
      color = '#FFEB3B';    // Top - Yellow King
      pieceType = 'king';
    } else if (x === 6 && y === 13) {
      color = '#F44336';    // Bottom - Red Queen
      pieceType = 'queen';
    } else if (x === 7 && y === 13) {
      color = '#F44336';    // Bottom - Red King
      pieceType = 'king';
    } else if (x === 0 && y === 6) {
      color = '#2196F3';    // Left - Blue Queen
      pieceType = 'queen';
    } else if (x === 0 && y === 7) {
      color = '#2196F3';    // Left - Blue King
      pieceType = 'king';
    } else if (x === 13 && y === 7) {
      color = '#4CAF50';    // Right - Green Queen
      pieceType = 'queen';
    } else if (x === 13 && y === 6) {
      color = '#4CAF50';    // Right - Green King
      pieceType = 'king';
    }
    
    const result = await this.db.run(
      'INSERT INTO base_points (user_id, x, y, game_created_at_ms, color, piece_type) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, x, y, gameCreatedAtMs, color, pieceType]
    );

    // Determine team based on color
    // Yellow (#FFEB3B) and Red (#F44336) are team 1
    // Blue (#2196F3) and Green (#4CAF50) are team 2
    const team: 1 | 2 = (color === '#FFEB3B' || color === '#F44336') ? 1 : 2;

    return {
      id: result.lastID!,
      userId,
      x,
      y,
      color,
      pieceType: pieceType as any, // Cast to any to match the BasePoint interface
      team,
      createdAtMs: gameCreatedAtMs
    };
  }

  /**
   * Gets the oldest base point by game_created_at_ms that is not at (0,0)
   */
  async getOldest(): Promise<BasePoint | null> {
    const result = await this.db.get<BasePoint>(
      'SELECT id, user_id as userId, x, y, created_at_ms as createdAtMs ' +
      'FROM base_points ' +
      'WHERE x != 0 OR y != 0 ' +
      'ORDER BY created_at_ms ASC LIMIT 1'
    );
    return result || null;
  }


  /**
   * Resets all pieces to their initial positions
   * This is used when setting up a new branch to ensure a clean starting state
   * @param db Optional database connection to use for the transaction
   */
  async resetBoardToInitialState(db?: Database): Promise<void> {
    // Define initial positions for all pieces by color and type
    // Note: Color codes are in uppercase to ensure consistent matching
    const initialPositions: InitialPositions = {
      // Blue pieces (left side)
      '#2196F3': {
        // Back row
        rook: [{x: 0, y: 3}, {x: 0, y: 10}],
        knight: [{x: 0, y: 4}, {x: 0, y: 9}],
        bishop: [{x: 0, y: 5}, {x: 0, y: 8}],
        queen: [{x: 0, y: 6}],
        king: [{x: 0, y: 7}],
        // Pawns
        pawn: [
          {x: 1, y: 3}, {x: 1, y: 4}, {x: 1, y: 5}, {x: 1, y: 6},
          {x: 1, y: 7}, {x: 1, y: 8}, {x: 1, y: 9}, {x: 1, y: 10}
        ]
      },
      // Red pieces (bottom)
      '#F44336': {
        // Back row
        rook: [{x: 3, y: 13}, {x: 10, y: 13}],
        knight: [{x: 4, y: 13}, {x: 9, y: 13}],
        bishop: [{x: 5, y: 13}, {x: 8, y: 13}],
        queen: [{x: 6, y: 13}],
        king: [{x: 7, y: 13}],
        // Pawns
        pawn: [
          {x: 3, y: 12}, {x: 4, y: 12}, {x: 5, y: 12}, {x: 6, y: 12},
          {x: 7, y: 12}, {x: 8, y: 12}, {x: 9, y: 12}, {x: 10, y: 12}
        ]
      },
      // Yellow pieces (top)
      '#FFEB3B': {
        // Back row
        rook: [{x: 3, y: 0}, {x: 10, y: 0}],
        knight: [{x: 4, y: 0}, {x: 9, y: 0}],
        bishop: [{x: 5, y: 0}, {x: 8, y: 0}],
        queen: [{x: 7, y: 0}],
        king: [{x: 6, y: 0}],
        // Pawns
        pawn: [
          {x: 3, y: 1}, {x: 4, y: 1}, {x: 5, y: 1}, {x: 7, y: 1},
          {x: 6, y: 1}, {x: 8, y: 1}, {x: 9, y: 1}, {x: 10, y: 1}
        ]
      },
      // Green pieces (right side)
      '#4CAF50': {
        // Back row
        rook: [{x: 13, y: 3}, {x: 13, y: 10}],
        knight: [{x: 13, y: 4}, {x: 13, y: 9}],
        bishop: [{x: 13, y: 5}, {x: 13, y: 8}],
        queen: [{x: 13, y: 7}],
        king: [{x: 13, y: 6}],
        // Pawns
        pawn: [
          {x: 12, y: 3}, {x: 12, y: 4}, {x: 12, y: 5}, {x: 12, y: 7},
          {x: 12, y: 6}, {x: 12, y: 8}, {x: 12, y: 9}, {x: 12, y: 10}
        ]
      }
    };

    const executeReset = async (db: Database) => {
      console.log('[resetBoardToInitialState] Starting board reset...');
      
      // Check if we're already in a transaction
      const isInTransaction = await db.get('SELECT 1 FROM sqlite_master WHERE type = "table" AND name = "sqlite_sequence"');
      
      // Only start a new transaction if we're not already in one
      if (!isInTransaction) {
        await db.run('BEGIN TRANSACTION');
      }
      
      try {
        // First, get all current base points
        const allPoints = await db.all<BasePoint[]>(
          'SELECT id, user_id as userId, x, y, color, piece_type as pieceType FROM base_points'
        );
        
        console.log(`[resetBoardToInitialState] Found ${allPoints.length} pieces to reset`);
        
        // Track used positions to prevent collisions
        const usedPositions = new Set<string>();
        
        // First, update all pieces to unique temporary positions to avoid unique constraints
        // We'll use negative IDs to ensure uniqueness
        for (let i = 0; i < allPoints.length; i++) {
          const point = allPoints[i];
          // Use negative ID to ensure uniqueness and avoid conflicts with actual positions
          await db.run(
            'UPDATE base_points SET x = ?, y = ? WHERE id = ?',
            [-(i + 1), -(i + 1), point.id]
          );
        }
        console.log(`[resetBoardToInitialState] Reset all ${allPoints.length} pieces to temporary positions`);
        
        // Process non-pawn pieces first
        const nonPawnPieces = allPoints.filter(p => p.pieceType !== 'pawn');
        console.log(`[resetBoardToInitialState] Processing ${nonPawnPieces.length} non-pawn pieces first`);
        
        // Group non-pawn pieces by color and type to handle multiple pieces of same type
        const piecesByType: Record<string, BasePoint[]> = {};
        
        for (const point of nonPawnPieces) {
          const color = point.color.toUpperCase() as keyof typeof initialPositions;
          const pieceType = point.pieceType as keyof PiecePositions;
          const key = `${color}_${pieceType}`;
          
          if (!piecesByType[key]) {
            piecesByType[key] = [];
          }
          piecesByType[key].push(point);
        }
        
        // Process each piece type
        for (const [key, pieces] of Object.entries(piecesByType)) {
          const [color, pieceType] = key.split('_') as [keyof typeof initialPositions, keyof PiecePositions];
          const positions = [...(initialPositions[color]?.[pieceType] || [])];
          
          if (positions.length === 0) {
            console.warn(`[resetBoardToInitialState] No initial positions for ${color} ${pieceType}`);
            continue;
          }
          
          // For each piece of this type, assign the next available position
          for (let i = 0; i < pieces.length; i++) {
            const point = pieces[i];
            const position = positions[i % positions.length]; // Cycle through positions if needed
            const posKey = `${position.x},${position.y}`;
            
            if (usedPositions.has(posKey)) {
              console.error(`[resetBoardToInitialState] Position (${position.x},${position.y}) already in use for ${color} ${pieceType}`);
              throw new Error(`Position (${position.x},${position.y}) already in use`);
            }
            
            await db.run(
              'UPDATE base_points SET x = ?, y = ? WHERE id = ?',
              [position.x, position.y, point.id]
            );
            
            usedPositions.add(posKey);
            console.log(`[resetBoardToInitialState] Placed ${color} ${pieceType} at (${position.x}, ${position.y})`);
          }
        }
        
        // Then process pawns
        const pawns = allPoints.filter(p => p.pieceType === 'pawn');
        console.log(`[resetBoardToInitialState] Processing ${pawns.length} pawns`);
        
        // Group pawns by color for better position assignment
        const pawnsByColor = pawns.reduce((acc, pawn) => {
          const color = pawn.color.toUpperCase();
          if (!acc[color]) acc[color] = [];
          acc[color].push(pawn);
          return acc;
        }, {} as Record<string, BasePoint[]>);
        
        for (const [color, colorPawns] of Object.entries(pawnsByColor)) {
          const pieceType = 'pawn' as const;
          const positions = [...(initialPositions[color as keyof typeof initialPositions]?.[pieceType] || [])];
          
          if (positions.length === 0) {
            console.warn(`[resetBoardToInitialState] No initial positions for ${color} pawns`);
            continue;
          }
          
          // Assign each pawn to a unique position, cycling through positions if needed
          for (let i = 0; i < colorPawns.length; i++) {
            const pawn = colorPawns[i];
            const position = positions[i % positions.length];
            const posKey = `${position.x},${position.y}`;
            
            if (usedPositions.has(posKey)) {
              // If position is already used, find the next available position
              let j = 0;
              let nextPos = position;
              while (j < positions.length) {
                nextPos = positions[(i + j) % positions.length];
                const nextPosKey = `${nextPos.x},${nextPos.y}`;
                if (!usedPositions.has(nextPosKey)) {
                  break;
                }
                j++;
              }
              
              if (j >= positions.length) {
                console.error(`[resetBoardToInitialState] No available positions for ${color} pawn`);
                throw new Error(`No available positions for ${color} pawn`);
              }
              
              position.x = nextPos.x;
              position.y = nextPos.y;
              usedPositions.add(`${position.x},${position.y}`);
            } else {
              usedPositions.add(posKey);
            }
            
            await db.run(
              'UPDATE base_points SET x = ?, y = ? WHERE id = ?',
              [position.x, position.y, pawn.id]
            );
            
            console.log(`[resetBoardToInitialState] Placed ${color} pawn at (${position.x}, ${position.y})`);
          }
        }
        
        if (!isInTransaction) {
          await db.run('COMMIT');
        }
        console.log('[resetBoardToInitialState] Board reset complete');
      } catch (error) {
        if (!isInTransaction) {
          await db.run('ROLLBACK');
        }
        console.error('[resetBoardToInitialState] Error during board reset:', error);
        throw error;
      }
    };

    if (db) {
      // Use the provided database connection (may be in a transaction)
      await executeReset(db);
    } else {
      // No database connection provided, manage our own transaction
      await this.executeTransaction(async (db) => {
        await executeReset(db);
      });
    }
  }

  async deleteBasePoint(id: number): Promise<BasePoint | null> {
    // First get the point to return it after deletion
    const point = await this.db.get<BasePoint>(
      'SELECT id, user_id as userId, x, y, created_at_ms as createdAtMs FROM base_points WHERE id = ?',
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
      await this.db.run('COMMIT');
      return point;
    } catch (error) {
      await this.db.run('ROLLBACK');
      console.error(`[BasePointRepository] Failed to delete point ${id}:`, error);
      throw error;
    }
  }
}
