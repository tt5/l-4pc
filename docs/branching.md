# Game Move History: First Implementation Step

## Server-Side Data Model Updates

### 1. Database Schema Changes

#### Game Collection
```typescript
interface Game {
  _id: string;                    // Unique game identifier
  currentPositionId: string;      // Reference to the current end position
  initialPositionId: string;      // Reference to the starting position
  createdAt: Date;
  updatedAt: Date;
  status: 'active' | 'completed' | 'abandoned';
  // ... other game metadata
}
```

#### Position Collection
```typescript
interface GamePosition {
  _id: string;                    // Unique position identifier
  gameId: string;                 // Reference to the parent game
  parentPositionId: string | null;// Null for initial position
  move: Move | null;              // The move that led to this position
  positionNumber: number;         // Sequential position number
  boardState: {                   // Complete board state
    pieces: Array<{
      id: string;
      type: string;
      position: [number, number];
      color: string;
      hasMoved: boolean;
    }>;
    currentPlayer: string;        // Color of the current player
    moveCount: number;            // Total moves made to reach this position
  };
  isCheck: boolean;               // Is the current player in check?
  isCheckmate: boolean;           // Is this a checkmate position?
  isStalemate: boolean;           // Is this a stalemate position?
  createdAt: Date;
  lastAccessed: Date;             // For cache management
}
```

#### Move Collection
```typescript
interface Move {
  _id: string;                    // Unique move identifier
  gameId: string;                 // Reference to the parent game
  positionBeforeId: string;       // The position this move was made from
  positionAfterId: string;        // The resulting position
  moveNumber: number;             // Sequential move number in the game
  playerId: string;               // ID of the player who made the move
  playerColor: string;            // Color of the player who made the move
  pieceType: string;              // Type of piece being moved
  from: [number, number];         // Starting position (x, y)
  to: [number, number];           // Destination position (x, y)
  capturedPiece: {                // If a piece was captured
    type: string;
    position: [number, number];
  } | null;
  isPromotion: boolean;           // Was this a pawn promotion?
  promotionPiece: string | null;  // What piece was promoted to
  isCastling: boolean;            // Was this a castling move?
  isEnPassant: boolean;           // Was this an en passant capture?
  san: string;                    // Standard Algebraic Notation
  createdAt: Date;
  // Additional metadata
  clockTime: number;              // Time taken for this move
  comment: string | null;         // Optional move comment
}
```

### 2. Indexes to Create

```javascript
// For fast position lookups
db.positions.createIndex({ gameId: 1, positionNumber: 1 });
db.positions.createIndex({ gameId: 1, parentPositionId: 1 });

// For move queries
db.moves.createIndex({ gameId: 1, positionBeforeId: 1 });
db.moves.createIndex({ gameId: 1, positionAfterId: 1 });
db.moves.createIndex({ gameId: 1, moveNumber: 1 });

// For game queries
db.games.createIndex({ status: 1, updatedAt: -1 });
```

### 3. Initial Data Migration

1. For existing games, create an initial position record
2. Replay all moves to create position history
3. Update the game document with position references

### 4. Validation Rules

- Position validation on save
- Move validation against parent position
- Consistency checks between positions and moves

This first step establishes the foundation for the branching move history by properly modeling positions and moves in the database. The next steps will focus on the API endpoints and client-side integration.