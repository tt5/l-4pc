import { pgn4ToString, pgn4StringToMove, STARTING_FEN4, parseFen4 } from './fen4Utils';
import { replayMoves } from './boardUtils';
import { generateNewGameId } from './boardUtils';
import type { Move } from '../types/board';

export interface Pgn4ImportResult {
  gameId: string;
  moves: Array<{
    pieceType: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    moveNumber: number;
  }>;
}

/**
 * Parses PGN4 text and converts it to moves ready for database import
 * @param pgn4Text - The PGN4 text content
 * @returns Object containing gameId and array of moves
 */
export const parsePgn4ToMoves = (pgn4Text: string): Pgn4ImportResult => {
  // Generate a new game ID
  const gameId = generateNewGameId();
  
  // Parse PGN4 text to get move strings
  const moveStrings = pgn4ToString(pgn4Text);
  
  // Get initial board state from STARTING_FEN4
  const { basePoints: initialBasePoints } = parseFen4(STARTING_FEN4);
  
  // Convert move strings to Move objects, tracking board state
  const moves: Move[] = [];
  let currentBasePoints = [...initialBasePoints];
  
  for (let i = 0; i < moveStrings.length; i++) {
    const moveString = moveStrings[i];
    
    // Convert move string to Move object using current board state
    const move = pgn4StringToMove(moveString, currentBasePoints, i);
    moves.push(move);
    
    // Update board state by replaying all moves so far
    const { basePoints: replayedBasePoints } = replayMoves(moves, i, initialBasePoints);
    currentBasePoints = replayedBasePoints;
  }
  
  // Extract only the fields needed for updateMove
  const importMoves = moves.map(move => ({
    pieceType: move.pieceType,
    fromX: move.fromX,
    fromY: move.fromY,
    toX: move.toX,
    toY: move.toY,
    moveNumber: move.moveNumber
  }));
  
  return {
    gameId,
    moves: importMoves
  };
};
