Initial Move Generation (getLegalMoves in gameUtils.ts:458-):
Generates all possible moves for a piece based on its type and position
Doesn't consider check/checkmate

Restricted Squares Calculation (calculateRestrictedSquares in boardUtils.ts:30-69):
Aggregates all squares that pieces can move to
Used for highlighting valid moves