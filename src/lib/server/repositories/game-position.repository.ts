import { Database } from 'sqlite';
import { v4 as uuidv4 } from 'uuid';
import { GamePosition } from './move.repository';

export class GamePositionRepository {
  constructor(private db: Database) {}

  async createPosition(position: Omit<GamePosition, 'id' | 'createdAtMs' | 'lastAccessedMs'>): Promise<GamePosition> {
    const now = Date.now();
    const positionId = uuidv4();
    
    await this.db.run(
      `INSERT INTO game_positions 
       (id, game_id, parent_position_id, position_number, board_state, 
        is_check, is_checkmate, is_stalemate, created_at_ms, last_accessed_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        positionId,
        position.gameId,
        position.parentPositionId,
        position.positionNumber,
        position.boardState,
        position.isCheck ? 1 : 0,
        position.isCheckmate ? 1 : 0,
        position.isStalemate ? 1 : 0,
        now,
        now
      ]
    );

    return {
      ...position,
      id: positionId,
      createdAtMs: now,
      lastAccessedMs: now
    };
  }

  async getPositionById(positionId: string): Promise<GamePosition | null> {
    const position = await this.db.get(
      `SELECT * FROM game_positions WHERE id = ?`,
      [positionId]
    );

    if (!position) return null;

    // Update last accessed time
    await this.db.run(
      `UPDATE game_positions SET last_accessed_ms = ? WHERE id = ?`,
      [Date.now(), positionId]
    );

    return {
      id: position.id,
      gameId: position.game_id,
      parentPositionId: position.parent_position_id,
      positionNumber: position.position_number,
      boardState: position.board_state,
      isCheck: Boolean(position.is_check),
      isCheckmate: Boolean(position.is_checkmate),
      isStalemate: Boolean(position.is_stalemate),
      createdAtMs: position.created_at_ms,
      lastAccessedMs: position.last_accessed_ms
    };
  }

  async getPositionsByGame(gameId: string): Promise<GamePosition[]> {
    const positions = await this.db.all(
      `SELECT * FROM game_positions WHERE game_id = ? ORDER BY position_number`,
      [gameId]
    );

    return positions.map(p => ({
      id: p.id,
      gameId: p.game_id,
      parentPositionId: p.parent_position_id,
      positionNumber: p.position_number,
      boardState: p.board_state,
      isCheck: Boolean(p.is_check),
      isCheckmate: Boolean(p.is_checkmate),
      isStalemate: Boolean(p.is_stalemate),
      createdAtMs: p.created_at_ms,
      lastAccessedMs: p.last_accessed_ms
    }));
  }

  async getNextPositionNumber(gameId: string): Promise<number> {
    const result = await this.db.get(
      `SELECT COALESCE(MAX(position_number), 0) + 1 as nextNumber 
       FROM game_positions 
       WHERE game_id = ?`,
      [gameId]
    );
    return result?.nextNumber || 1;
  }

  async getLastPosition(gameId: string): Promise<GamePosition | null> {
    const position = await this.db.get(
      `SELECT * FROM game_positions 
       WHERE game_id = ? 
       ORDER BY position_number DESC 
       LIMIT 1`,
      [gameId]
    );

    if (!position) return null;

    return {
      id: position.id,
      gameId: position.game_id,
      parentPositionId: position.parent_position_id,
      positionNumber: position.position_number,
      boardState: position.board_state,
      isCheck: Boolean(position.is_check),
      isCheckmate: Boolean(position.is_checkmate),
      isStalemate: Boolean(position.is_stalemate),
      createdAtMs: position.created_at_ms,
      lastAccessedMs: position.last_accessed_ms
    };
  }

  async getPositionByNumber(gameId: string, positionNumber: number): Promise<GamePosition | null> {
    const position = await this.db.get(
      `SELECT * FROM game_positions 
       WHERE game_id = ? AND position_number = ?`,
      [gameId, positionNumber]
    );

    if (!position) return null;

    // Update last accessed time
    await this.db.run(
      `UPDATE game_positions SET last_accessed_ms = ? WHERE id = ?`,
      [Date.now(), position.id]
    );

    return {
      id: position.id,
      gameId: position.game_id,
      parentPositionId: position.parent_position_id,
      positionNumber: position.position_number,
      boardState: position.board_state,
      isCheck: Boolean(position.is_check),
      isCheckmate: Boolean(position.is_checkmate),
      isStalemate: Boolean(position.is_stalemate),
      createdAtMs: position.created_at_ms,
      lastAccessedMs: position.last_accessed_ms
    };
  }

  async deletePosition(positionId: string): Promise<void> {
    await this.db.run(
      `DELETE FROM game_positions WHERE id = ?`,
      [positionId]
    );
  }

  async updateGameCurrentPosition(gameId: string, positionId: string): Promise<void> {
    await this.db.run(
      `UPDATE games SET current_position_id = ? WHERE id = ?`,
      [positionId, gameId]
    );
  }
}
