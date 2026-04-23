import { BOARD_CONFIG, INITIAL_BASE_POINTS } from '../constants/game';
import { MOVE_PATTERNS } from '../constants/movePatterns';
import { BasePoint, SquareIndex, RestrictedByInfo, RestrictedSquareInfo, Point, NamedColor, PieceType, Move } from '../types/board';
import type { ApiResponse } from './api';
import { getLegalMoves } from './gameUtils';
import { makeAuthenticatedApiCall, parseApiResponse, generateRequestId, makeApiCall } from './clientApi';
import { useAuth } from '../contexts/AuthContext';
import { STARTING_FEN4, parseFen4 } from './fen4Utils';

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
 * @param startingPosition - Optional starting position (BasePoint[] or FEN4 string, defaults to STARTING_FEN4)
 * @returns Board state, castling rights, and en passant targets after replaying moves
 */
export const replayMoves = (
  moves: Move[], 
  endIndex: number, 
  startingPosition?: BasePoint[] | string
): {
  basePoints: BasePoint[];
  kingsideCastling: string;
  queensideCastling: string;
  enPassantTargets: string;
} => {
  const positionMap = new Map<string, BasePoint>();

  // Initialize with a fresh copy of the initial board state or provided starting position
  let basePoints: BasePoint[];
  let kingsideCastling: string;
  let queensideCastling: string;
  let enPassantTargets: string;
  let currentPlayerIndex: number;

  if (typeof startingPosition === 'string') {
    // Parse FEN4 string
    const parsed = parseFen4(startingPosition);
    basePoints = parsed.basePoints;
    kingsideCastling = parsed.kingsideCastling;
    queensideCastling = parsed.queensideCastling;
    enPassantTargets = parsed.enPassantTargets;
    currentPlayerIndex = parsed.currentPlayerIndex;
  } else if (startingPosition) {
    // Use provided BasePoint array with default castling rights
    basePoints = startingPosition;
    kingsideCastling = '1,1,1,1';
    queensideCastling = '1,1,1,1';
    enPassantTargets = ',,,';
    currentPlayerIndex = 0;
  } else {
    // Use default STARTING_FEN4
    const parsed = parseFen4(STARTING_FEN4);
    basePoints = parsed.basePoints;
    kingsideCastling = parsed.kingsideCastling;
    queensideCastling = parsed.queensideCastling;
    enPassantTargets = parsed.enPassantTargets;
    currentPlayerIndex = parsed.currentPlayerIndex;
  }

  // Track castling rights as arrays for easier updates
  let ksCastling = kingsideCastling.split(',').map(Number);
  let qsCastling = queensideCastling.split(',').map(Number);
  let epTargets = enPassantTargets.split(',');
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
      positionMap.set(rookToKey, {
        ...rook,
        x: rookX + rookDx,
        y: rookY + rookDy,
        hasMoved: true
      });
    }

    // Update castling rights when king or rook moves
    const playerIdx = ['RED', 'BLUE', 'YELLOW', 'GREEN'].indexOf(piece.color);
    if (playerIdx !== -1) {
      if (piece.pieceType === 'king') {
        // King moves: lose all castling rights for this player
        ksCastling[playerIdx] = 0;
        qsCastling[playerIdx] = 0;
      } else if (piece.pieceType === 'rook') {
        // Rook moves: lose castling rights for this player
        ksCastling[playerIdx] = 0;
        qsCastling[playerIdx] = 0;
      }
    }

    // Update en passant targets when pawn moves 2 squares
    const currentTurnPlayerIdx = (currentPlayerIndex + i) % 4;
    if (piece.pieceType === 'pawn') {
      const dy = Math.abs(move.toY - move.fromY);
      const dx = Math.abs(move.toX - move.fromX);
      
      // Check if this is a 2-square pawn move
      if ((dy === 2 && dx === 0) || (dx === 2 && dy === 0)) {
        // Calculate the square that was skipped (the en passant target)
        const skippedX = (move.fromX + move.toX) / 2;
        const skippedY = (move.fromY + move.toY) / 2;
        
        // Convert to square notation
        const file = String.fromCharCode(97 + skippedX);
        const rank = (14 - skippedY).toString();
        const square = `${file}${rank}`;
        
        // Set en passant target for the current player's next opponent
        epTargets[currentTurnPlayerIdx] = square;
      } else {
        // Reset en passant target for this player after any other pawn move
        epTargets[currentTurnPlayerIdx] = '';
      }
    } else {
      // Reset en passant target for current player after non-pawn move
      epTargets[currentTurnPlayerIdx] = '';
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
    positionMap.set(toKey, movedPiece);
    
    console.log(`[replayMoves] Applied move ${i+1}/${endIndex+1}: [${fromX},${fromY}]→[${toX},${toY}]`);
  }

  return {
    basePoints: Array.from(positionMap.values()),
    kingsideCastling: ksCastling.join(','),
    queensideCastling: qsCastling.join(','),
    enPassantTargets: epTargets.join(',')
  };
};
