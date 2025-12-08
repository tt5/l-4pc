import { Database } from 'sqlite';

export interface Move {
  id?: number;
  gameId: string;
  userId: string;
  pieceType: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  moveNumber: number;
  capturedPieceId?: number | null;
  createdAtMs?: number;
  // New fields for branching support
  positionBeforeId?: string | null;
  positionAfterId?: string | null;
  isBranch?: boolean;
  branchName?: string | null;
}

export interface GamePosition {
  id: string;
  gameId: string;
  parentPositionId: string | null;
  positionNumber: number;
  boardState: string; // JSON stringified board state
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  createdAtMs: number;
  lastAccessedMs: number;
}

export class MoveRepository {
  constructor(private db: Database) {}
  
  // Helper method to convert database row to Move
  private mapDbRowToMove(row: any): Move {
    return {
      ...row,
      isBranch: Boolean(row.isBranch)
    };
  }

  async create(move: Omit<Move, 'id' | 'createdAtMs' | 'moveNumber' | 'positionBeforeId' | 'positionAfterId' | 'isBranch' | 'branchName'> & { 
    moveNumber?: number;
    positionBeforeId?: string | null;
    positionAfterId?: string | null;
    isBranch?: boolean;
    branchName?: string | null;
  }): Promise<Move> {
    try {
      // If moveNumber is not provided, calculate it as the next number for this game
      let moveNumber = move.moveNumber;
      if (moveNumber === undefined) {
        const lastMove = await this.getLastMove(move.gameId);
        moveNumber = lastMove ? (lastMove.moveNumber || 0) + 1 : 1;
      }

      const now = Date.now();
      const result = await this.db.run(
        `INSERT INTO moves 
         (game_id, user_id, piece_type, from_x, from_y, to_x, to_y, move_number, 
          captured_piece_id, created_at_ms, position_before_id, position_after_id, is_branch, branch_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          move.gameId,
          move.userId,
          move.pieceType,
          move.fromX,
          move.fromY,
          move.toX,
          move.toY,
          moveNumber,
          move.capturedPieceId || null,
          now,
          move.positionBeforeId || null,
          move.positionAfterId || null,
          move.isBranch ? 1 : 0,
          move.branchName || null
        ]
      );

      if (!result.lastID) {
        console.warn('[Move] ⚠️ No lastID returned from insert');
      }

      const createdMove = {
        ...move,
        id: result.lastID,
        moveNumber,
        positionBeforeId: move.positionBeforeId || null,
        positionAfterId: move.positionAfterId || null,
        isBranch: move.isBranch || false,
        branchName: move.branchName || null,
        createdAtMs: now
      };
      
      return createdMove;
      
    } catch (error) {
      console.error('[Move] ❌ Database error:', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  async getByGameId(gameId: string): Promise<Move[]> {
    const rows = await this.db.all<any[]>(`
      SELECT 
        id,
        game_id as gameId,
        user_id as userId, 
        piece_type as pieceType,
        from_x as fromX,
        from_y as fromY,
        to_x as toX,
        to_y as toY,
        move_number as moveNumber,
        captured_piece_id as capturedPieceId,
        created_at_ms as createdAtMs,
        position_before_id as positionBeforeId,
        position_after_id as positionAfterId,
        is_branch as isBranch,
        branch_name as branchName
      FROM moves
      WHERE game_id = ?
      ORDER BY move_number ASC
    `, [gameId]);

    return rows.map(row => this.mapDbRowToMove(row));
  }

  async getByUserId(userId: string): Promise<Move[]> {
    const rows = await this.db.all<any[]>(
      `SELECT 
        id, 
        game_id as gameId, 
        user_id as userId, 
        piece_type as pieceType,
        from_x as fromX,
        from_y as fromY,
        to_x as toX,
        to_y as toY,
        move_number as moveNumber,
        captured_piece_id as capturedPieceId,
        created_at_ms as createdAtMs,
        is_branch as isBranch,
        branch_name as branchName
       FROM moves 
       WHERE user_id = ? 
       ORDER BY created_at_ms DESC`,
      [userId]
    );
    
    return rows.map(row => this.mapDbRowToMove(row));
  }

  async getLastMove(gameId: string): Promise<Move | undefined> {
    const row = await this.db.get<any>(
      `SELECT 
        id, 
        game_id as gameId, 
        user_id as userId, 
        piece_type as pieceType,
        from_x as fromX,
        from_y as fromY,
        to_x as toX,
        to_y as toY,
        move_number as moveNumber,
        captured_piece_id as capturedPieceId,
        created_at_ms as createdAtMs,
        is_branch as isBranch,
        branch_name as branchName
       FROM moves 
       WHERE game_id = ? 
       ORDER BY created_at_ms DESC 
       LIMIT 1`,
      [gameId]
    );
    
    return row ? this.mapDbRowToMove(row) : undefined;
  }

  async deleteAllForGame(gameId: string): Promise<void> {
    try {
      await this.db.run(
        `DELETE FROM moves WHERE game_id = ?`,
        [gameId]
      );
      console.log(`[Move] Deleted all moves for game: ${gameId}`);
    } catch (error) {
      console.error(`[Move] ❌ Failed to delete moves for game ${gameId}:`, 
        error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  async getMovesForGame(gameId: string, branchName: string | null, maxMoveNumber?: number): Promise<Move[]> {
    const query = `
      SELECT 
        id, 
        game_id as gameId, 
        user_id as userId, 
        piece_type as pieceType,
        from_x as fromX,
        from_y as fromY,
        to_x as toX,
        to_y as toY,
        move_number as moveNumber,
        captured_piece_id as capturedPieceId,
        created_at_ms as createdAtMs,
        is_branch as isBranch,
        branch_name as branchName
      FROM moves 
      WHERE game_id = ? 
        AND (
          branch_name IS NULL 
          ${branchName ? 'OR branch_name = ?' : ''}
        )
        ${maxMoveNumber !== undefined ? 'AND move_number <= ?' : ''}
      ORDER BY created_at_ms ASC
    `;
    
    const params: any[] = [gameId];
    if (branchName) {
      params.push(branchName);
    }
    if (maxMoveNumber !== undefined) {
      params.push(maxMoveNumber);
    }
    
    const rows = await this.db.all<any[]>(query, params);
    return rows.map(row => this.mapDbRowToMove(row));
  }

  async findExistingMove(criteria: {
    gameId: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    moveNumber: number;
  }): Promise<Move | null> {
    const row = await this.db.get<any>(
      `SELECT 
        id, 
        game_id as gameId, 
        user_id as userId, 
        piece_type as pieceType,
        from_x as fromX,
        from_y as fromY,
        to_x as toX,
        to_y as toY,
        move_number as moveNumber,
        captured_piece_id as capturedPieceId,
        created_at_ms as createdAtMs,
        is_branch as isBranch,
        branch_name as branchName
       FROM moves 
       WHERE game_id = ? 
       AND from_x = ? 
       AND from_y = ? 
       AND to_x = ? 
       AND to_y = ? 
       AND move_number = ?`,
      [criteria.gameId, criteria.fromX, criteria.fromY, criteria.toX, criteria.toY, criteria.moveNumber]
    );
    
    return row ? this.mapDbRowToMove(row) : null;
  }
}
