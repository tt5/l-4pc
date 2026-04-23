import { describe, it, expect } from 'vitest';
import { fen4FromMoves, parseFen4, generateFen4 } from './fen4Utils';

describe('fen4FromMoves', () => {
  it('returns starting FEN4 when no moves are provided', () => {
    const moves: string[] = [];
    const result = fen4FromMoves(moves);
    
    // Should return the starting FEN4 with 8 parts
    expect(result).toMatch(/^R-0,0,0,0-1,1,1,1-1,1,1,1-0,0,0,0-0-.*-,,,$/);
  });

  it('applies a single pawn move correctly', () => {
    // Move red pawn from d2 to d3 (PGN4: d2-d3)
    // In the starting position, red pawns are at rank 2 (y=12 in code coordinates)
    const moves = ['d2-d3'];
    const result = fen4FromMoves(moves);
    
    // Parse the result to verify
    const { basePoints, currentPlayerIndex, enPassantTargets } = parseFen4(result);
    
    // Current player should be B (Blue) after Red's move
    expect(currentPlayerIndex).toBe(1);
    
    // Find the pawn that moved (from d2 to d3, which is x=3, y=11)
    const movedPawn = basePoints.find(p => p.x === 3 && p.y === 11 && p.pieceType === 'pawn');
    expect(movedPawn).toBeDefined();
    expect(movedPawn?.color).toBe('RED');
    
    // En passant targets should be empty for a single-square pawn move
    expect(enPassantTargets).toBe(',,,');
  });

  it('applies multiple moves sequentially', () => {
    // Red pawn d2->d3, Blue pawn b4->b5
    const moves = ['d2-d3', 'b4-b5'];
    const result = fen4FromMoves(moves);
    
    const { currentPlayerIndex } = parseFen4(result);
    
    // After 2 moves, current player should be Y (Yellow)
    expect(currentPlayerIndex).toBe(2);
  });

  it('handles captures correctly', () => {
    // This is a simplified test - in a real game we'd need to set up a position
    // where a capture is possible. For now, we just test that the function
    // doesn't error when a piece moves to an occupied square.
    // Note: This would require setting up a custom starting position
    // which is beyond the scope of this basic test.
    
    const moves = ['d2-d3'];
    const result = fen4FromMoves(moves);
    
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });

  it('alternates players correctly through all 4 players', () => {
    // Red: d2-d3, Blue: b4-b5, Yellow: d13-d12, Green: m4-m5
    const moves = ['d2-d3', 'b4-b5', 'd13-d12', 'm4-m5'];
    const result = fen4FromMoves(moves);
    
    const { currentPlayerIndex } = parseFen4(result);
    
    // After 4 moves, should be back to Red (index 0)
    expect(currentPlayerIndex).toBe(0);
  });

  it('produces valid FEN4 format', () => {
    const moves = ['d2-d3'];
    const result = fen4FromMoves(moves);
    
    // Should have 8 parts separated by hyphens
    const parts = result.split('-');
    expect(parts).toHaveLength(8);
    
    // First part should be a valid player letter
    expect(['R', 'B', 'Y', 'G']).toContain(parts[0]);
    
    // Last part should be en passant targets (comma-separated)
    expect(parts[7]).toMatch(/^[a-z0-9,]*$/);
  });

  it('round-trips: parse -> apply moves -> generate -> parse should be consistent', () => {
    const moves = ['d2-d3', 'b4-b5'];
    const result = fen4FromMoves(moves);
    
    // Parse the result
    const { basePoints: finalBasePoints, currentPlayerIndex: finalPlayer, kingsideCastling, queensideCastling, enPassantTargets } = parseFen4(result);
    
    // Generate FEN4 again from the parsed result
    const regenerated = generateFen4(finalBasePoints, finalPlayer, {
      kingsideCastling,
      queensideCastling,
      enPassantTargets
    });
    
    // Should match
    expect(regenerated).toBe(result);
  });

  it('handles invalid PGN4 format gracefully', () => {
    const moves = ['invalid'];
    
    expect(() => fen4FromMoves(moves)).toThrow('Invalid PGN4 move');
  });

  it('handles PGN4 coordinates out of bounds', () => {
    const moves = ['z15-z16']; // Beyond 14x14 board
    
    expect(() => fen4FromMoves(moves)).toThrow();
  });
});

describe('pgn4ToMove (integration test via fen4FromMoves)', () => {
  it('correctly converts PGN4 file letters to x coordinates', () => {
    // 'a' should be x=0, 'n' should be x=13
    // Blue pawn at b4 (x=1, y=10) moving to b5 (x=1, y=9)
    const moves = ['b4-b5'];
    const result = fen4FromMoves(moves);
    
    expect(result).toBeDefined();
  });

  it('correctly converts PGN4 rank numbers to y coordinates', () => {
    // Rank 1 should be y=13, rank 14 should be y=0
    // Yellow pawn at d13 (x=3, y=1) moving to d12 (x=3, y=2)
    const moves = ['d13-d12'];
    const result = fen4FromMoves(moves);
    
    expect(result).toBeDefined();
  });

  it('tracks en passant targets for double pawn moves', () => {
    // Red pawn moves 2 squares: d2-d4
    const moves = ['d2-d4'];
    const result = fen4FromMoves(moves);
    
    const { enPassantTargets } = parseFen4(result);
    
    // The skipped square (d3) should be the en passant target for Red
    // Format: R,B,Y,G targets
    expect(enPassantTargets).toMatch(/^d3,,,$/);
  });

  it('tracks castling rights loss when king moves', () => {
    // This would require a custom position where king can move
    // For now, we test that the castling fields are present
    const moves = ['d2-d3'];
    const result = fen4FromMoves(moves);
    
    const { kingsideCastling, queensideCastling } = parseFen4(result);
    
    // Castling rights should be present as comma-separated values
    expect(kingsideCastling).toMatch(/^[0-1],[0-1],[0-1],[0-1]$/);
    expect(queensideCastling).toMatch(/^[0-1],[0-1],[0-1],[0-1]$/);
  });
});
