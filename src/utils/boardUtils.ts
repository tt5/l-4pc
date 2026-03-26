import { BOARD_CONFIG, getTeamByColor } from '../constants/game';
import { BasePoint, SquareIndex, RestrictedByInfo, RestrictedSquareInfo, Point } from '../types/board';
import type { ApiResponse } from './api';
import { getLegalMoves } from './gameUtils';
import { makeApiCall, parseApiResponse, generateRequestId } from './clientApi';

export const generateNewGameId = (): string => {
  // Generate a random 8-character alphanumeric ID
  return Math.random().toString(36).substring(2, 10);
};

export interface RestrictedSquaresResult {
  restrictedSquares: SquareIndex[];
  restrictedSquaresInfo: RestrictedSquareInfo[];
}

export function calculateRestrictedSquares(
  pieces: BasePoint[], 
  boardState: BasePoint[],
  options: {
    isKingInCheck?: boolean;
    enPassantTarget?: Record<string, {x: number, y: number, color: string} | null>;
  } = {}
): RestrictedSquaresResult {

  const restrictedSquares: SquareIndex[] = [];
  const restrictedSquaresInfo: RestrictedSquareInfo[] = [];

  for (const piece of pieces) {
    
    const moves = getLegalMoves(piece, boardState, {
      isKingInCheck: options.isKingInCheck,
      enPassantTarget: options.enPassantTarget
    });
    
    for (const { x, y, canCapture } of moves) {
      const index: SquareIndex = (y * BOARD_CONFIG.GRID_SIZE + x) as SquareIndex;
      
      if (!restrictedSquares.includes(index)) {
        restrictedSquares.push(index);
      }
      
      const existingInfo = restrictedSquaresInfo.find(info => info.x === x && info.y === y);
      const restrictionInfo: RestrictedByInfo = {
        basePointId: String(piece.id),
        basePointX: piece.x,
        basePointY: piece.y
      };

      if (existingInfo) {
        existingInfo.restrictedBy = existingInfo.restrictedBy || [];
        existingInfo.restrictedBy.push(restrictionInfo);
        // Update canCapture if this move allows capturing
        if (canCapture) {
          existingInfo.canCapture = true;
        }
      } else {
        restrictedSquaresInfo.push({
          index,
          x,
          y,
          restrictedBy: [restrictionInfo],
          canCapture,
          pieceType: piece.pieceType,
          team: getTeamByColor(piece.color)
        });
      }
    }
  }

  return { restrictedSquares, restrictedSquaresInfo };
}

/**
 * Checks if a base point exists at the given coordinates
 */
export const isBasePoint = (x: number, y: number, basePoints: BasePoint[]): boolean => {
  return basePoints.some(point => point.x === x && point.y === y);
};

/**
 * Records a move in the game history
 * @param id The ID of the base point being moved
 * @param x The new x-coordinate
 * @param y The new y-coordinate
 * @param moveNumber The current move number (optional)
 * @param branchName The name of the branch (optional)
 * @param isNewBranch Whether this is a new branch (optional)
 * @param gameId The ID of the game (required for branching)
 * @param fromX The source X coordinate (optional)
 * @param fromY The source Y coordinate (optional)
 * @returns A promise that resolves to the API response
 */
export const updateMove = async (
  id: number, 
  x: number, 
  y: number, 
  moveNumber?: number, 
  branchName?: string | null, 
  isNewBranch?: boolean,
  gameId?: string,
  fromX?: number,  // Source X coordinate
  fromY?: number   // Source Y coordinate
): Promise<ApiResponse<BasePoint>> => {
  try {
    // Validate input
    if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) {
      throw new Error('Invalid coordinates provided');
    }

    // First create the move if we have a game context
    if (gameId && fromX !== undefined && fromY !== undefined) {
      const requestId = generateRequestId();
      const moveResponse = await makeApiCall('/api/moves', {
        method: 'POST',
        body: JSON.stringify({
          gameId,
          pieceType: 'piece', // This should be replaced with actual piece type
          fromX,
          fromY,
          toX: x,
          toY: y,
          moveNumber,
          isBranch: isNewBranch,
          branchName: branchName ?? 'main'
        })
      });

      if (!moveResponse.ok) {
        const result = await parseApiResponse(moveResponse, requestId);
        throw new Error(result.error || 'Failed to record move');
      }
    }

    return {
      success: true,
      //data: basePoint,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error('Error recording move:', error instanceof Error ? error.message : 'Unknown error');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record move',
      timestamp: Date.now()
    };
  }
};
