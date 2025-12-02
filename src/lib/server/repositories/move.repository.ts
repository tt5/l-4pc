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
}

export class MoveRepository {
  constructor(private db: Database) {}

  async create(move: Omit<Move, 'id' | 'createdAtMs' | 'moveNumber'> & { moveNumber?: number }): Promise<Move> {
    try {
      // If moveNumber is not provided, calculate it as the next number for this game
      let moveNumber = move.moveNumber;
      if (moveNumber === undefined) {
        const lastMove = await this.getLastMove(move.gameId);
        moveNumber = lastMove ? (lastMove.moveNumber || 0) + 1 : 1;
      }

      const result = await this.db.run(
        `INSERT INTO moves 
         (game_id, user_id, piece_type, from_x, from_y, to_x, to_y, move_number, captured_piece_id, created_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          Date.now()
        ]
      );

      if (!result.lastID) {
        console.warn('[Move] ⚠️ No lastID returned from insert');
      }

      const createdMove = {
        ...move,
        id: result.lastID,
        moveNumber,
        createdAtMs: Date.now()
      };
      
      return createdMove;
      
    } catch (error) {
      console.error('[Move] ❌ Database error:', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  async getByGameId(gameId: string): Promise<Move[]> {
    return this.db.all<Move[]>(
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
        created_at_ms as createdAtMs
       FROM moves 
       WHERE game_id = ? 
       ORDER BY created_at_ms ASC`,
      [gameId]
    );
  }

  async getByUserId(userId: string): Promise<Move[]> {
    return this.db.all<Move[]>(
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
        created_at_ms as createdAtMs
       FROM moves 
       WHERE user_id = ? 
       ORDER BY created_at_ms DESC`,
      [userId]
    );
  }

  async getLastMove(gameId: string): Promise<Move | undefined> {
    return this.db.get<Move>(
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
        created_at_ms as createdAtMs
       FROM moves 
       WHERE game_id = ? 
       ORDER BY created_at_ms DESC 
       LIMIT 1`,
      [gameId]
    );
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
}
