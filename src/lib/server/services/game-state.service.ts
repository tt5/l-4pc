import { MoveRepository } from '../repositories/move.repository';
import { GamePositionRepository } from '../repositories/game-position.repository';
import { GamePosition, Move } from '../repositories/move.repository';

export class GameStateService {
  constructor(
    private moveRepository: MoveRepository,
    private positionRepository: GamePositionRepository
  ) {}

  /**
   * Makes a move in the game, handling branching if needed
   */
  async makeMove(params: {
    gameId: string;
    userId: string;
    pieceType: string;
    from: [number, number];
    to: [number, number];
    isBranch: boolean;
    branchName?: string;
    positionBeforeId?: string;
  }): Promise<{ move: Move; newPosition: GamePosition }> {
    const { gameId, userId, pieceType, from, to, isBranch, branchName, positionBeforeId } = params;
    const [fromX, fromY] = from;
    const [toX, toY] = to;

    // Get the current position or the specified position
    const currentPosition = positionBeforeId 
      ? await this.positionRepository.getPositionById(positionBeforeId)
      : await this.positionRepository.getLastPosition(gameId);

    if (!currentPosition) {
      throw new Error('No valid game position found');
    }

    // Create a new position based on the current one
    const positionNumber = await this.positionRepository.getNextPositionNumber(gameId);
    
    // In a real implementation, we would calculate the new board state here
    // For now, we'll just store a placeholder
    const newBoardState = JSON.stringify({
      // This would be the actual board state after the move
      // For now, we're just storing the move information
      from: { x: fromX, y: fromY },
      to: { x: toX, y: toY },
      pieceType,
      timestamp: Date.now()
    });

    // Create the new position
    const newPosition = await this.positionRepository.createPosition({
      gameId,
      parentPositionId: currentPosition.id,
      positionNumber,
      boardState: newBoardState,
      isCheck: false, // Would be calculated based on the move
      isCheckmate: false, // Would be calculated based on the move
      isStalemate: false // Would be calculated based on the move
    });

    // Create the move
    const move = await this.moveRepository.create({
      gameId,
      userId,
      pieceType,
      fromX,
      fromY,
      toX,
      toY,
      positionBeforeId: currentPosition.id,
      positionAfterId: newPosition.id,
      isBranch,
      branchName,
      moveNumber: positionNumber // Using position number as move number for simplicity
    });

    // Update the game's current position
    await this.positionRepository.updateGameCurrentPosition(gameId, newPosition.id);

    return { move, newPosition };
  }

  /**
   * Gets the current game state
   */
  async getCurrentGameState(gameId: string): Promise<{
    position: GamePosition | null;
    moves: Move[];
    branches: Array<{ id: string; name: string }>;
  }> {
    const position = await this.positionRepository.getLastPosition(gameId);
    if (!position) {
      return { position: null, moves: [], branches: [] };
    }

    // In a real implementation, we would fetch the actual moves
    // For now, we'll return an empty array with proper typing
    const moves: Move[] = [];
    const branches: Array<{ id: string; name: string }> = [];

    return { position, moves, branches };
  }

  /**
   * Gets the game state at a specific position
   */
  async getGameStateAtPosition(positionId: string): Promise<{
    position: GamePosition;
    moves: Move[];
    branches: Array<{ id: string; name: string }>;
  } | null> {
    const position = await this.positionRepository.getPositionById(positionId);
    if (!position) return null;

    // In a real implementation, we would fetch the actual moves and branches
    // For now, we'll return empty arrays with proper typing
    const moves: Move[] = [];
    const branches: Array<{ id: string; name: string }> = [];

    return { position, moves, branches };
  }

  /**
   * Gets the move history for a game
   */
  async getMoveHistory(gameId: string): Promise<Move[]> {
    // In a real implementation, we would fetch the actual move history
    // For now, we'll return an empty array
    return [];
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
