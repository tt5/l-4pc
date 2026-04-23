import { BOARD_CONFIG, INITIAL_BASE_POINTS } from '../constants/game';
import { MOVE_PATTERNS } from '../constants/movePatterns';
import { BasePoint, SquareIndex, RestrictedByInfo, RestrictedSquareInfo, Point, NamedColor, PieceType, Move } from '../types/board';
import type { ApiResponse } from './api';
import { getLegalMoves, resetMovedPieces, trackPieceMovement } from './gameUtils';
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

/**
 * Replays moves on the board up to a specific index
 * @param moves - Array of moves to replay
 * @param endIndex - Index to stop replaying at
 * @param startingPosition - Optional starting position (defaults to INITIAL_BASE_POINTS)
 * @returns Board state after replaying moves
 */
export const replayMoves = (moves: Move[], endIndex: number, startingPosition?: BasePoint[]): BasePoint[] => {
  const positionMap = new Map<string, BasePoint>();

  // Reset moved pieces tracking for fresh replay
  resetMovedPieces();

  // Initialize with a fresh copy of the initial board state or provided starting position
  const basePoints = startingPosition || INITIAL_BASE_POINTS;
  basePoints.forEach(bp => {
    positionMap.set(`${bp.x},${bp.y}`, { ...bp });
  });

  // Replay each move up to the target index
  for (let i = 0; i <= endIndex; i++) {
    const move = moves[i];
    if (!move) {
      throw new Error(`[replayMoves] Missing move at index ${i}`);
    }

    const { 
      fromX, 
      fromY, 
      toX, 
      toY, 
      isCastle = false,
      castleType = null,
      isEnPassant = false
    } = move;
    
    const fromKey = `${fromX},${fromY}`;
    const toKey = `${toX},${toY}`;
    const piece = positionMap.get(fromKey);

    if (!piece) {
      throw new Error(`[replayMoves] No piece at source position (${fromX},${fromY})`);
    }

    // Handle castling moves
    if (isCastle && castleType) {
      console.log(`[replayMoves] Castling move`);
      
      const fullCastleType = `${piece.color}_${castleType}` as keyof typeof MOVE_PATTERNS.CASTLING;
      const castlingConfig = MOVE_PATTERNS.CASTLING[fullCastleType];
      if (!castlingConfig) {
        console.error(`[replayMoves] Invalid castling type: ${fullCastleType}`);
        continue;
      }
      const [kingDx, kingDy, , rookX, rookY, rookDx, rookDy] = castlingConfig;
      const rookFromKey = `${rookX},${rookY}`;
      const rookToKey = `${rookX + rookDx},${rookY + rookDy}`;
      const rook = positionMap.get(rookFromKey);
      if (!rook) {
        console.error(`[replayMoves] Rook not found at (${rookX},${rookY}) for castling`);
        continue;
      }
      // Move the rook
      positionMap.delete(rookFromKey);
      trackPieceMovement(rook);
      positionMap.set(rookToKey, {
        ...rook,
        x: rookX + rookDx,
        y: rookY + rookDy,
        hasMoved: true
      });
    }

    // Handle captures
    if (positionMap.has(toKey)) {
      const capturedPiece = positionMap.get(toKey);
      console.log(`[replayMoves] Capturing piece at [${toX},${toY}]: ${JSON.stringify(capturedPiece, null, 2)}`);
      positionMap.delete(toKey);
    }

    // Handle en passant capture
    if (isEnPassant && move.capturedPiece) {
      const { x: capturedX, y: capturedY } = move.capturedPiece;
      const capturedKey = `${capturedX},${capturedY}`;
      console.log(`[replayMoves] En passant capture at [${capturedX},${capturedY}]`);
      positionMap.delete(capturedKey);
    }

    // Update the piece
    const movedPiece = {
      ...piece,
      x: toX,
      y: toY,
      hasMoved: true,
      isCastle: isCastle,
      castleType: castleType
    };

    positionMap.delete(fromKey);
    trackPieceMovement(movedPiece);
    positionMap.set(toKey, movedPiece);
    
    console.log(`[replayMoves] Applied move ${i+1}/${endIndex+1}: [${fromX},${fromY}]→[${toX},${toY}]`);
  }

  return Array.from(positionMap.values());
};
