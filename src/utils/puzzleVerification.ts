import { parseFen4 } from './fen4Utils';
import { getLegalMoves, hasAnyLegalMoves, isKingInCheck } from './gameUtils';
import { PLAYER_COLORS } from '~/constants/game';
import { type BasePoint, type Point, createPoint } from '~/types/board';

export interface VerificationResult {
  found: boolean;
  move?: { fromX: number; fromY: number; toX: number; toY: number };
}

/**
 * Verifies if a puzzle has a checkmate in one solution.
 * Tries all legal moves for the current player and checks if any results in checkmate.
 * 
 * @param fen4 - The FEN4 string representing the puzzle position
 * @returns Verification result with found flag and the winning move if found
 */
export function verifyCheckmateInOne(fen4: string): VerificationResult {
  const parsed = parseFen4(fen4);
  const pieces = parsed.basePoints;
  const playerIndex = parsed.currentPlayerIndex;
  
  const currentPlayerColor = PLAYER_COLORS[playerIndex];
  const currentPlayerPieces = pieces.filter(p => p.color === currentPlayerColor);
  
  // Try all pieces of the current player
  for (const piece of currentPlayerPieces) {
    const legalMoves = getLegalMoves(piece, pieces);
    
    // Try each legal move for this piece
    for (const move of legalMoves) {
      // Simulate the move
      const newBasePoints = pieces.map(bp => {
        if (bp.x === piece.x && bp.y === piece.y) {
          return { ...bp, x: move.x, y: move.y, hasMoved: true };
        }
        // Remove captured piece
        if (bp.x === move.x && bp.y === move.y) {
          return null;
        }
        return bp;
      }).filter((bp): bp is BasePoint => bp !== null);
      
      // Check if the next player is in checkmate
      const nextPlayerIndex = (playerIndex + 1) % 4;
      const nextPlayerColor = PLAYER_COLORS[nextPlayerIndex];
      const nextPlayerKing = newBasePoints.find(bp => bp.pieceType === 'king' && bp.color === nextPlayerColor);
      
      if (nextPlayerKing) {
        const hasLegalMoves = hasAnyLegalMoves(nextPlayerColor, newBasePoints);
        if (!hasLegalMoves) {
          const inCheck = isKingInCheck(nextPlayerKing, newBasePoints);
          if (inCheck) {
            // Checkmate found!
            return {
              found: true,
              move: { fromX: piece.x, fromY: piece.y, toX: move.x, toY: move.y }
            };
          }
        }
      }
    }
  }
  
  // No checkmate in one found
  return { found: false };
}
