import { BOARD_CONFIG } from '../constants/game';
import { BasePoint, SquareIndex, RestrictedByInfo, RestrictedSquareInfo, Point, NamedColor, PieceType } from '../types/board';
import type { ApiResponse } from './api';
import { getLegalMoves } from './gameUtils';
import { makeAuthenticatedApiCall, parseApiResponse, generateRequestId, makeApiCall } from './clientApi';
import { useAuth } from '../contexts/AuthContext';

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
    enPassantTarget?: Record<NamedColor, {x: number, y: number, color: NamedColor} | null>;
  } = {}
): RestrictedSquaresResult {

  const restrictedSquares: SquareIndex[] = [];
  const restrictedSquaresInfo: RestrictedSquareInfo[] = [];

  for (const piece of pieces) {
    
    const moves = getLegalMoves(piece, boardState, {
      enPassantTarget: options.enPassantTarget
    });
    
    for (const { x, y, canCapture } of moves) {
      const index: SquareIndex = (y * BOARD_CONFIG.GRID_SIZE + x) as SquareIndex;
      
      if (!restrictedSquares.includes(index)) {
        restrictedSquares.push(index);
      }
      
      const existingInfo = restrictedSquaresInfo.find(info => info.x === x && info.y === y);
      const restrictionInfo: RestrictedByInfo = {
        basePointId: piece.id,
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
          team: piece.team
        });
      }
    }
  }

  return { restrictedSquares, restrictedSquaresInfo };
}

export const updateMove = async (
  pieceType: PieceType,
  x: number, 
  y: number, 
  moveNumber?: number, 
  branchName?: string | null, 
  isNewBranch?: boolean,
  gameId?: string,
  fromX?: number,  // Source X coordinate
  fromY?: number,   // Source Y coordinate
  token?: string   // JWT token for authentication
): Promise<ApiResponse<BasePoint>> => {
  try {
    // Validate input
    if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) {
      throw new Error('Invalid coordinates provided');
    }

    const requestId = generateRequestId();
    const moveResponse = await makeApiCall('/api/moves', {
      method: 'POST',
      body: JSON.stringify({
        gameId,
        pieceType: pieceType,
        fromX,
        fromY,
        toX: x,
        toY: y,
        moveNumber,
        isBranch: isNewBranch,
        branchName: branchName ?? 'main'
      })
    }, token);

    if (!moveResponse.ok) {
      const result = await parseApiResponse(moveResponse, requestId);
      throw new Error(result.error || 'Failed to record move');
    }

    const result = await parseApiResponse(moveResponse, requestId);
    return {
      success: true,
      data: result.data,
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
