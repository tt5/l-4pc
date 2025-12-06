import { Database } from 'sqlite';
import { BasePointRepository, CreateBasePointInput } from '../repositories/base-point.repository';
import { UserRepository } from '../repositories/user.repository';
import { getDb, SqliteDatabase } from '../db';

export interface GameStatusResult {
  success: boolean;
  gameJoined: boolean;
  homeX: number;
  homeY: number;
  message?: string;
  error?: string;
}

export interface RestrictedSquaresResult {
  success: boolean;
  squares: number[];
  message?: string;
  error?: string;
}

export interface CalculateRestrictedSquaresInput {
  borderIndices: number[];
  currentPosition: [number, number];
  direction: 'up' | 'down' | 'left' | 'right';
}

export async function calculateRestrictedSquares(
  input: CalculateRestrictedSquaresInput
): Promise<RestrictedSquaresResult> {
  try {
    // This is a simplified version. You'll need to implement the actual logic
    // based on your game's rules for restricted squares.
    // For now, we'll return an empty array as a placeholder.
    return {
      success: true,
      squares: []
    };
  } catch (error) {
    return {
      success: false,
      squares: [],
      error: 'Failed to calculate restricted squares'
    };
  }
}

export class GameService {
  private userRepository: UserRepository;
  private basePointRepository: BasePointRepository;

  constructor(db: SqliteDatabase) {
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
