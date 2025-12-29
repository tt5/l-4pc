import { MoveRepository } from '../repositories/move.repository';
import { Move } from '../repositories/move.repository';

export class GameStateService {
  constructor(
    private moveRepository: MoveRepository
  ) {}

  /**
   * Makes a move in the game
   */
  async makeMove(params: {
    gameId: string;
    userId: string;
    pieceType: string;
    from: [number, number];
    to: [number, number];
  }): Promise<{ move: Move }> {
    const { gameId, userId, pieceType, from, to } = params;
    const [fromX, fromY] = from;
    const [toX, toY] = to;

    // Get the latest move to determine the next move number
    const lastMove = await this.moveRepository.getLastMove(gameId);
    const moveNumber = lastMove ? lastMove.moveNumber + 1 : 1;

    // Create the move
    const move = await this.moveRepository.create({
      gameId,
      userId,
      pieceType,
      fromX,
      fromY,
      toX,
      toY,
      moveNumber,
      isBranch: false,
      branchName: 'main'
    });

    return { move };
  }

  /**
   * Gets the current game state
   */
  async getCurrentGameState(gameId: string): Promise<{
    moves: Move[];
  }> {
    const moves = await this.moveRepository.getByGameId(gameId);
    return { moves };
  }

  /**
   * Gets the move history for the game
   */
  async getMoveHistory(gameId: string): Promise<Move[]> {
    return this.moveRepository.getByGameId(gameId);
  }

  /**
   * Gets all branches for a game
   */
  async getBranches(gameId: string): Promise<Array<{ id: string; name: string }>> {
    // In a real implementation, we would fetch the actual branches
    // For now, we'll return an empty array
    return [];
  }
}
