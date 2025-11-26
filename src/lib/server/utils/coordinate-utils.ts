/**
 * Utility functions for working with world and tile coordinates
 */

// Size of each tile in world units
const TILE_SIZE = 64;

/**
 * Convert world coordinates to tile coordinates
 * @param worldX - X coordinate in world space
 * @param worldY - Y coordinate in world space
 * @returns Object containing tileX and tileY
 */
export function worldToTileCoords(worldX: number, worldY: number): { tileX: number; tileY: number } {
  return {
    tileX: Math.floor(worldX / TILE_SIZE),
    tileY: Math.floor(worldY / TILE_SIZE)
  };
}

/**
 * Get the bounds of a tile in world coordinates
 * @param tileX - X coordinate of the tile
 * @param tileY - Y coordinate of the tile
 * @returns Object containing min/max x/y coordinates
 */
export function getTileBounds(tileX: number, tileY: number): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  return {
    minX: tileX * TILE_SIZE,
    minY: tileY * TILE_SIZE,
    maxX: (tileX + 1) * TILE_SIZE - 1,
    maxY: (tileY + 1) * TILE_SIZE - 1
  };
}

/**
 * Get all tiles that could be affected by a point at the given world coordinates
 * @param worldX - X coordinate in world space
 * @param worldY - Y coordinate in world space
 * @returns Array of tile coordinates that contain or are adjacent to the point
 */
export function getAffectedTiles(worldX: number, worldY: number): Array<{ tileX: number; tileY: number }> {
  // Get the primary tile the point is in
  const primary = worldToTileCoords(worldX, worldY);
  const result: Array<{ tileX: number; tileY: number }> = [primary];
  
  // Check if the point is on a tile boundary
  const onRightEdge = (worldX + 1) % TILE_SIZE === 0;
  const onBottomEdge = (worldY + 1) % TILE_SIZE === 0;
  
  // Add adjacent tiles if the point is on an edge or corner
  if (onRightEdge) {
    result.push({ tileX: primary.tileX + 1, tileY: primary.tileY });
  }
  if (onBottomEdge) {
    result.push({ tileX: primary.tileX, tileY: primary.tileY + 1 });
  }
  if (onRightEdge && onBottomEdge) {
    result.push({ tileX: primary.tileX + 1, tileY: primary.tileY + 1 });
  }
  
  return result;
}

/**
 * Get all tiles that intersect with a rectangle defined by two points
 * @param x1 - First point X coordinate
 * @param y1 - First point Y coordinate
 * @param x2 - Second point X coordinate
 * @param y2 - Second point Y coordinate
 * @returns Set of unique tile coordinates that intersect with the rectangle
 */
export function getTilesInRectangle(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): Set<string> {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  
  const startTile = worldToTileCoords(minX, minY);
  const endTile = worldToTileCoords(maxX, maxY);
  
  const tiles = new Set<string>();
  
  for (let y = startTile.tileY; y <= endTile.tileY; y++) {
    for (let x = startTile.tileX; x <= endTile.tileX; x++) {
      tiles.add(`${x},${y}`);
    }
  }
  
  return tiles;
}
