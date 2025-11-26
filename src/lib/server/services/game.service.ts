import { Database } from 'sqlite';
import { BasePointRepository, CreateBasePointInput } from '../repositories/base-point.repository';
import { UserRepository } from '../repositories/user.repository';
import { getDb, SqliteDatabase } from '../db';
import { getOldestPrimeTimestamp } from '../../../utils/randomSlopes';

// Types for the game service responses
export interface JoinGameResult {
  success: boolean;
  gameJoined: boolean;
  homeX: number;
  homeY: number;
  message?: string;
  error?: string;
}

export interface LeaveGameResult {
  success: boolean;
  message?: string;
  error?: string;
}

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
    console.error('Error calculating restricted squares:', error);
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
   * Handles the logic for a user joining the game
   * @param userId The ID of the user joining the game
   * @returns Promise with the result of the join operation
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

  async joinGame(userId: string): Promise<JoinGameResult> {
    try {
      return await this.executeTransaction<JoinGameResult>(async () => {
        // Check if user exists and has already joined
        const currentStatus = await this.userRepository.getGameStatus(userId);

        console.log(`[joinGame] currentStatus: ${JSON.stringify(currentStatus)}`);
        
        if (!currentStatus) {
          return { 
            success: false, 
            gameJoined: false, 
            homeX: 0, 
            homeY: 0,
            error: 'User not found',
            message: 'User account could not be found.'
          };
        }
        
        if (currentStatus.gameJoined) {
          return { 
            success: true, 
            gameJoined: true, 
            homeX: currentStatus.homeX, 
            homeY: currentStatus.homeY,
            message: 'You have already joined the game.'
          };
        }

        // Find the oldest base point to determine the next position
        const oldestBase = await this.basePointRepository.getOldest();
        
        // Calculate new position
        let x = 0, y = 0;
        if (oldestBase) {
          console.log(`[joinGame] oldestBase: ${JSON.stringify(oldestBase)}`);
          if (oldestBase.x < 0) {
            x = oldestBase.x + 3;
          } else {
            x = oldestBase.x - 3;
          }
          if (oldestBase.y < 0) {
            y = oldestBase.y + 2;
          } else {
            y = oldestBase.y - 2;
          }
          
          // Delete the oldest base point after using it
          await this.basePointRepository.delete(oldestBase.id);
          console.log(`[joinGame] Deleted oldest base point ${oldestBase.id} at (${oldestBase.x}, ${oldestBase.y})`);
        }

        // Set user's home position and mark as joined
        await this.userRepository.setHomePosition(userId, x, y);
        await this.userRepository.setGameJoined(userId, true);
        
        // Create a base point for the user
        await this.basePointRepository.create({
          userId,
          x,
          y,
          // Use the oldest prime timestamp minus 1 millisecond, or current time if no primes found
          gameCreatedAtMs: (getOldestPrimeTimestamp() ?? Date.now()) - 1
        });
        console.log(`[joinGame] Created new base point for ${userId} at (${x}, ${y})`)

        return { 
          success: true, 
          gameJoined: true, 
          homeX: x, 
          homeY: y,
          message: 'Successfully joined the game! Your home base has been established.'
        };
        });
    } catch (error) {
      console.error('Error in joinGame:', error);
      return {
        success: false,
        gameJoined: false,
        homeX: 0,
        homeY: 0,
        error: 'Failed to join game',
        message: 'An unexpected error occurred while joining the game.'
      };
    }
  }

  async leaveGame(userId: string): Promise<LeaveGameResult> {
    try {
      return await this.executeTransaction<LeaveGameResult>(async () => {
        const currentStatus = await this.userRepository.getGameStatus(userId);
        
        if (!currentStatus) {
          return { 
            success: false, 
            error: 'User not found',
            message: 'User account could not be found.'
          };
        }
        
        if (!currentStatus.gameJoined) {
          return { 
            success: true, 
            message: 'You have not joined the game yet.'
          };
        }
        
        // Just update the user's status, don't remove their base
        await this.userRepository.setGameJoined(userId, false);
        
        return { 
          success: true, 
          message: 'You have left the game. Your base remains on the map.'
        };
        });
    } catch (error) {
      console.error('Error in leaveGame:', error);
      return { 
        success: false, 
        error: 'Failed to leave game',
        message: 'An unexpected error occurred while leaving the game.'
      };
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
