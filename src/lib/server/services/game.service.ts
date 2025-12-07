import { Database } from 'sqlite';
import { BasePointRepository } from '../repositories/base-point.repository';
import { MoveRepository } from '../repositories/move.repository';
import { GamePositionRepository } from '../repositories/game-position.repository';
import { UserRepository } from '../repositories/user.repository';
import { getDb } from '../db';
import { BasePoint, BasePointEventType } from '../events/base-point.events';
import { isInNonPlayableCorner as isPositionInNonPlayableCorner } from '../../../constants/game';
import { GameStateService } from './game-state.service';

interface MoveResult {
  success: boolean;
  message: string;
  moveId?: number;
  capturedPieceId?: number | null;
  isCheck?: boolean;
  isCheckmate?: boolean;
  isStalemate?: boolean;
  positionId?: string;
}

interface GameStatusResult {
  success: boolean;
  gameJoined: boolean;
  homeX: number;
  homeY: number;
  message?: string;
  error?: string;
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
  private userRepository: UserRepository;
  private basePointRepository: BasePointRepository;

  constructor(db: Database) {
    this.userRepository = new UserRepository(db);
    this.basePointRepository = new BasePointRepository(db);
  }

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

  async getGameStatus(userId: string): Promise<GameStatusResult> {
    try {
      const status = await this.userRepository.getGameStatus(userId);
      
      if (!status) {
        return { 
          success: false, 
          gameJoined: false, 
          homeX: 0, 
          homeY: 0,
          error: 'User not found',
          message: 'User account could not be found.'
        };
      }
      
      return {
        success: true,
        gameJoined: status.gameJoined,
        homeX: status.homeX,
        homeY: status.homeY,
        message: status.gameJoined 
          ? `Your home base is at (${status.homeX}, ${status.homeY})`
          : 'You have not joined the game yet.'
      };
      
    } catch (error) {
      console.error('Error in getGameStatus:', error);
      return { 
        success: false, 
        gameJoined: false, 
        homeX: 0, 
        homeY: 0,
        error: 'Failed to retrieve game status',
        message: 'An error occurred while retrieving your game status.'
      };
    }
  }

}
