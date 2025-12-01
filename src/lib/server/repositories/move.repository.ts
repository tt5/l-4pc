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
  capturedPieceId?: number | null;
  createdAtMs?: number;
}

export class MoveRepository {
  constructor(private db: Database) {}

  async create(move: Omit<Move, 'id' | 'createdAtMs'>): Promise<Move> {
    const result = await this.db.run(
      `INSERT INTO moves 
       (game_id, user_id, piece_type, from_x, from_y, to_x, to_y, captured_piece_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        move.gameId,
        move.userId,
        move.pieceType,
        move.fromX,
        move.fromY,
        move.toX,
        move.toY,
        move.capturedPieceId || null
      ]
    );

    return {
      ...move,
      id: result.lastID,
      createdAtMs: Date.now()
    };
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
        captured_piece_id as capturedPieceId,
        created_at_ms as createdAtMs
       FROM moves 
       WHERE game_id = ? 
       ORDER BY created_at_ms DESC 
       LIMIT 1`,
      [gameId]
    );
  }
}
