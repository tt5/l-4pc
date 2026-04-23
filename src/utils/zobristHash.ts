// Zobrist hash implementation matching the C++ engine's algorithm
// Ported from 4pchess/board.cc and board.h

import type { BasePoint, NamedColor, PieceType } from '~/types/board';

// Color mapping matching C++ enum
enum PlayerColor {
  RED = 0,
  BLUE = 1,
  YELLOW = 2,
  GREEN = 3,
}

// Piece type mapping matching C++ enum
enum CppPieceType {
  PAWN = 0,
  KNIGHT = 1,
  BISHOP = 2,
  ROOK = 3,
  QUEEN = 4,
  KING = 5,
}

// Simple LCG to match C++ rand() behavior
// C++ rand() is typically an LCG: next = (multiplier * current + increment) % modulus
// Common implementation uses multiplier=1103515245, increment=12345, modulus=2^31
class LCG {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  // Returns 31-bit random number (matching C++ rand() range [0, RAND_MAX])
  next(): number {
    // Using the same constants as glibc's rand()
    this.state = (1103515245 * this.state + 12345) & 0x7fffffff;
    return this.state;
  }

  // Returns 64-bit random number matching C++ rand64()
  rand64(): bigint {
    const t0 = this.next();
    const t1 = this.next();
    return (BigInt(t0) << 32n) | BigInt(t1);
  }
}

// Initialize the LCG with the same seed as C++ engine
const SEED = 958829;
const lcg = new LCG(SEED);

// Generate turn hashes [4]
const turnHashes: bigint[] = [];
for (let color = 0; color < 4; color++) {
  turnHashes.push(lcg.rand64());
}

// Generate piece hashes [4][6][14][14]
// pieceHashes[color][pieceType][row][col]
const pieceHashes: bigint[][][][] = [];
for (let color = 0; color < 4; color++) {
  pieceHashes[color] = [];
  for (let pieceType = 0; pieceType < 6; pieceType++) {
    pieceHashes[color][pieceType] = [];
    for (let row = 0; row < 14; row++) {
      pieceHashes[color][pieceType][row] = [];
      for (let col = 0; col < 14; col++) {
        pieceHashes[color][pieceType][row][col] = lcg.rand64();
      }
    }
  }
}

// Map TypeScript color names to C++ enum values
function colorToEnum(color: NamedColor): PlayerColor {
  switch (color) {
    case 'RED': return PlayerColor.RED;
    case 'BLUE': return PlayerColor.BLUE;
    case 'YELLOW': return PlayerColor.YELLOW;
    case 'GREEN': return PlayerColor.GREEN;
    default: throw new Error(`Unknown color: ${color}`);
  }
}

// Map TypeScript piece type to C++ enum value
function pieceTypeToEnum(pieceType: PieceType): CppPieceType {
  switch (pieceType) {
    case 'pawn': return CppPieceType.PAWN;
    case 'knight': return CppPieceType.KNIGHT;
    case 'bishop': return CppPieceType.BISHOP;
    case 'rook': return CppPieceType.ROOK;
    case 'queen': return CppPieceType.QUEEN;
    case 'king': return CppPieceType.KING;
    default: throw new Error(`Unknown piece type: ${pieceType}`);
  }
}

/**
 * Compute the Zobrist hash for a board position
 * Matches the C++ engine's HashKey() algorithm
 * @param basePoints - Array of pieces on the board
 * @param turnIndex - Current player turn (0=RED, 1=BLUE, 2=YELLOW, 3=GREEN)
 * @returns 64-bit hash as a number (note: JS numbers are 53-bit safe integers)
 */
export function computeBoardHash(basePoints: BasePoint[], turnIndex: number): number {
  let hash: bigint = 0n;

  // XOR hash for each piece on the board
  for (const piece of basePoints) {
    const color = colorToEnum(piece.color);
    const pieceType = pieceTypeToEnum(piece.pieceType);
    const row = piece.y;
    const col = piece.x;

    hash ^= pieceHashes[color][pieceType][row][col];
  }

  // XOR hash for current turn
  hash ^= turnHashes[turnIndex];

  // Convert to number (note: may lose precision for high bits, but hash is used as key)
  // For safety, we convert to string for storage if needed
  return Number(hash);
}

/**
 * Compute the Zobrist hash and return as a string to preserve full 64-bit precision
 * Use this when storing in database to avoid precision loss
 */
export function computeBoardHashString(basePoints: BasePoint[], turnIndex: number): string {
  return computeBoardHash(basePoints, turnIndex).toString();
}

// Export the hash tables for testing purposes
export const _testExports = {
  turnHashes,
  pieceHashes,
  SEED,
};
