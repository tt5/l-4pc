import { describe, it, expect } from 'vitest';
import { computeBoardHash, computeBoardHashString, _testExports } from './zobristHash';
import { INITIAL_BASE_POINTS } from '~/constants/game';
import type { BasePoint } from '~/types/board';

describe('zobristHash', () => {
  it('should have the correct seed', () => {
    expect(_testExports.SEED).toBe(958829);
  });

  it('should generate turn hashes for all 4 colors', () => {
    expect(_testExports.turnHashes).toHaveLength(4);
    _testExports.turnHashes.forEach(hash => {
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('bigint');
    });
  });

  it('should generate piece hashes for all combinations', () => {
    // 4 colors, 6 piece types, 14 rows, 14 cols
    expect(_testExports.pieceHashes).toHaveLength(4);
    for (let color = 0; color < 4; color++) {
      expect(_testExports.pieceHashes[color]).toHaveLength(6);
      for (let pieceType = 0; pieceType < 6; pieceType++) {
        expect(_testExports.pieceHashes[color][pieceType]).toHaveLength(14);
        for (let row = 0; row < 14; row++) {
          expect(_testExports.pieceHashes[color][pieceType][row]).toHaveLength(14);
          for (let col = 0; col < 14; col++) {
            expect(_testExports.pieceHashes[color][pieceType][row][col]).toBeDefined();
            expect(typeof _testExports.pieceHashes[color][pieceType][row][col]).toBe('bigint');
          }
        }
      }
    }
  });

  it('should compute hash for starting position', () => {
    const hash = computeBoardHash(INITIAL_BASE_POINTS, 0);
    expect(typeof hash).toBe('number');
    expect(hash).not.toBe(0);
  });

  it('should compute hash as string for precision', () => {
    const hashString = computeBoardHashString(INITIAL_BASE_POINTS, 0);
    expect(typeof hashString).toBe('string');
    expect(hashString).not.toBe('0');
  });

  it('should produce deterministic hashes', () => {
    const hash1 = computeBoardHash(INITIAL_BASE_POINTS, 0);
    const hash2 = computeBoardHash(INITIAL_BASE_POINTS, 0);
    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different turns', () => {
    const hashRed = computeBoardHash(INITIAL_BASE_POINTS, 0); // RED's turn
    const hashBlue = computeBoardHash(INITIAL_BASE_POINTS, 1); // BLUE's turn
    expect(hashRed).not.toBe(hashBlue);
  });

  it('should produce different hashes for different piece positions', () => {
    const pieces1: BasePoint[] = [
      { id: 1, x: 7, y: 7, color: 'RED', pieceType: 'king', team: 1 },
    ];
    const pieces2: BasePoint[] = [
      { id: 1, x: 8, y: 7, color: 'RED', pieceType: 'king', team: 1 },
    ];
    const hash1 = computeBoardHash(pieces1, 0);
    const hash2 = computeBoardHash(pieces2, 0);
    expect(hash1).not.toBe(hash2);
  });

  it('should produce different hashes for different piece types', () => {
    const pieces1: BasePoint[] = [
      { id: 1, x: 7, y: 7, color: 'RED', pieceType: 'king', team: 1 },
    ];
    const pieces2: BasePoint[] = [
      { id: 1, x: 7, y: 7, color: 'RED', pieceType: 'queen', team: 1 },
    ];
    const hash1 = computeBoardHash(pieces1, 0);
    const hash2 = computeBoardHash(pieces2, 0);
    expect(hash1).not.toBe(hash2);
  });

  it('should produce different hashes for different piece colors', () => {
    const pieces1: BasePoint[] = [
      { id: 1, x: 7, y: 7, color: 'RED', pieceType: 'king', team: 1 },
    ];
    const pieces2: BasePoint[] = [
      { id: 1, x: 7, y: 7, color: 'BLUE', pieceType: 'king', team: 2 },
    ];
    const hash1 = computeBoardHash(pieces1, 0);
    const hash2 = computeBoardHash(pieces2, 0);
    expect(hash1).not.toBe(hash2);
  });

  it('should handle empty board', () => {
    const emptyPieces: BasePoint[] = [];
    const hash = computeBoardHash(emptyPieces, 0);
    expect(typeof hash).toBe('number');
    // Empty board with RED turn should have a non-zero hash due to turn hash
    expect(hash).not.toBe(0);
  });

  it('should handle multiple pieces', () => {
    const pieces: BasePoint[] = [
      { id: 1, x: 7, y: 7, color: 'RED', pieceType: 'king', team: 1 },
      { id: 2, x: 6, y: 7, color: 'RED', pieceType: 'queen', team: 1 },
      { id: 3, x: 8, y: 7, color: 'BLUE', pieceType: 'king', team: 2 },
    ];
    const hash = computeBoardHash(pieces, 0);
    expect(typeof hash).toBe('number');
    expect(hash).not.toBe(0);
  });

  it('should produce same hash regardless of piece order', () => {
    const pieces1: BasePoint[] = [
      { id: 1, x: 7, y: 7, color: 'RED', pieceType: 'king', team: 1 },
      { id: 2, x: 6, y: 7, color: 'RED', pieceType: 'queen', team: 1 },
    ];
    const pieces2: BasePoint[] = [
      { id: 2, x: 6, y: 7, color: 'RED', pieceType: 'queen', team: 1 },
      { id: 1, x: 7, y: 7, color: 'RED', pieceType: 'king', team: 1 },
    ];
    const hash1 = computeBoardHash(pieces1, 0);
    const hash2 = computeBoardHash(pieces2, 0);
    expect(hash1).toBe(hash2);
  });
});
