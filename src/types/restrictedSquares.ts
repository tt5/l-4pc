/**
 * Represents information about a restricted square on the game board.
 * These squares have special movement or placement rules that restrict piece movement.
 */
export interface RestrictedSquareInfo {
  /**
   * The index of the restricted square on the board
   */
  index: number;
  
  /**
   * Optional reason why this square is restricted
   */
  reason?: string;
  
  /**
   * Optional team that this restriction applies to (1 or 2)
   * If not specified, the restriction applies to all teams
   */
  team?: number;
  
  /**
   * Information about which pieces are restricting this square
   * Each entry contains the coordinates of a piece that is restricting this square
   */
  restrictedBy?: Array<{
    basePointX: number;
    basePointY: number;
  }>;
  
  /**
   * Optional type of restriction
   */
  type?: 'movement' | 'placement' | 'both';
}

/**
 * Type for a function that returns an array of restricted square indices
 */
export type GetRestrictedSquaresFn = () => number[];
