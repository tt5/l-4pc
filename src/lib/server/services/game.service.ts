import { Database } from 'sqlite';
import { MoveRepository } from '../repositories/move.repository';
import { getDb } from '../db';
import { GameStateService } from './game-state.service';

interface MoveResult {
  success: boolean;
  message: string;
  moveId?: number;
  capturedPieceId?: number | null;
  isCheck?: boolean;
  isCheckmate?: boolean;
  isStalemate?: boolean;
}

interface RestrictedSquaresResult {
  success: boolean;
  squares: number[];
  message?: string;
  error?: string;
}

interface CalculateRestrictedSquaresInput {
  borderIndices: number[];
  currentPosition: [number, number];
  direction: 'up' | 'down' | 'left' | 'right';
}

export class GameService {
  constructor(private db: Database) {}

  /**
   * Executes a database transaction
   * @param callback The function to execute within the transaction
   * @returns Promise with the result of the callback
   */
  async executeTransaction<T>(callback: () => Promise<T>): Promise<T> {
    const db = await getDb();
    try {
      await db.run('BEGIN TRANSACTION');
      const result = await callback();
      await db.run('COMMIT');
      return result;
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    }
  }
}
