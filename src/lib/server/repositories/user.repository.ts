import { Database } from 'sqlite';
import { User, UserGameStatus } from '../../../types/user';

export class UserRepository {
  constructor(private db: Database) {}

  async setGameJoined(userId: string, status: boolean): Promise<void> {
    await this.db.run(
      'UPDATE users SET game_joined = ?, updated_at_ms = strftime("%s", "now") * 1000 WHERE id = ?',
      [status, userId]
    );
  }

  // Alias for backward compatibility
  setGameJoinedStatus = this.setGameJoined;

  async setHomePosition(userId: string, x: number, y: number): Promise<void> {
    await this.db.run(
      'UPDATE users SET home_x = ?, home_y = ?, updated_at_ms = strftime("%s", "now") * 1000 WHERE id = ?',
      [x, y, userId]
    );
  }

  async getGameStatus(userId: string): Promise<UserGameStatus | null> {
    const result = await this.db.get<{ 
      game_joined: boolean; 
      home_x: number; 
      home_y: number 
    }>(
      'SELECT game_joined, home_x, home_y FROM users WHERE id = ?',
      [userId]
    );

    if (!result) return null;

    return {
      gameJoined: result.game_joined,
      homeX: result.home_x,
      homeY: result.home_y
    };
  }

  // Alias for backward compatibility
  getUserGameStatus = this.getGameStatus;

  async getUserById(userId: string): Promise<User | null> {
    const result = await this.db.get<{
      id: string;
      username: string;
      email: string | null;
      created_at_ms: number;
      updated_at_ms: number;
      game_joined: boolean;
      home_x: number;
      home_y: number;
    }>(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    );

    if (!result) return null;

    return {
      id: result.id,
      username: result.username,
      email: result.email || undefined,
      createdAt: new Date(result.created_at_ms).toISOString(),
      updatedAt: new Date(result.updated_at_ms).toISOString(),
      gameJoined: result.game_joined,
      homeX: result.home_x,
      homeY: result.home_y
    };
  }
}
