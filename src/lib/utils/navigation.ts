import { createPoint, type Point } from '~/types/board';
import { usePlayerPosition } from '../../contexts/PlayerPositionContext';

/**
 * Fetches restricted squares for a given position
 * @param position The position to calculate restricted squares for
 * @returns Promise with the restricted squares or null if there was an error
 */
async function fetchRestrictedSquares(position: Point): Promise<number[] | null> {
  try {
    // Calculate the 14x14 grid indices with the target position as top-left corner
    const viewportSize = 14;
    const borderIndices: number[] = [];
    
    // Generate indices for the 14x14 viewport
    // Starting from (0,0) to (13,13) since the target position is the top-left corner
    for (let y = 0; y < viewportSize; y++) {
      for (let x = 0; x < viewportSize; x++) {
        // Calculate the index in row-major order (left to right, top to bottom)
        borderIndices.push(y * viewportSize + x);
      }
    }

    const response = await fetch('/api/calculate-squares', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        borderIndices,
        currentPosition: position,
        destination: [position[0], position[1] - 1] // Calculate a point 1 unit above current position
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data?.data?.squares || [];
  } catch (error) {
    console.error('Failed to fetch restricted squares:', error);
    return null;
  }
}

/**
 * Utility function to jump to a specific position in the game and fetch restricted squares
 * @param x The x-coordinate to jump to
 * @param y The y-coordinate to jump to
 * @param setPosition Function to update the position in the parent component
 * @returns Promise with an object containing the new position and restricted squares, or null if there was an error
 */
export async function jumpToPosition(
  x: number, 
  y: number, 
  setPosition: (position: Point) => void
): Promise<{ position: Point; restrictedSquares: number[] } | null> {
  try {
    
    // Create a new position point
    const newPosition = createPoint(
      Math.floor(x), // Ensure integer coordinates
      Math.floor(y)  // Ensure integer coordinates
    );
    
    // Fetch restricted squares for the new position
    const restrictedSquares = await fetchRestrictedSquares(newPosition);
    if (restrictedSquares === null) {
      console.error('Failed to fetch restricted squares');
      return null;
    }
    
    // Update the position using the provided setPosition function
    setPosition(newPosition);
    
    console.log(`Jumped to position: [${x}, ${y}] with ${restrictedSquares.length} restricted squares`);
    return { position: newPosition, restrictedSquares };
  } catch (error) {
    console.error('Failed to jump to position:', error);
    return null;
  }
}

/**
 * Hook that provides navigation functions
 * @returns An object containing navigation functions
 */
export function useNavigation() {
  const { setPosition } = usePlayerPosition();
  
  return {
    /**
     * Jump to a specific position in the game and fetch restricted squares
     * @param x The x-coordinate to jump to
     * @param y The y-coordinate to jump to
     * @returns Promise with the restricted squares for the new position
     */
    jumpToPosition: async (x: number, y: number) => {
      try {
        const targetPosition = createPoint(x, y);
        console.log(`Jumping to position: [${x}, ${y}]`);
        
        // Fetch restricted squares for the new position
        const restrictedSquares = await fetchRestrictedSquares(targetPosition);
        
        if (restrictedSquares === null) {
          console.error('Failed to fetch restricted squares');
          return null;
        }
        
        console.log(`Jumped to position: [${x}, ${y}] with ${restrictedSquares.length} restricted squares`);
        
        // Note: We don't update the position here anymore
        // The component that calls this function should update the position in the context
        
        return { restrictedSquares };
      } catch (error) {
        console.error('Failed to jump to position:', error);
        return null;
      }
    },
    
    /**
     * Fetch restricted squares for a specific position
     * @param position The position to calculate restricted squares for
     * @returns Promise with the restricted squares or null if there was an error
     */
    fetchRestrictedSquares
  };
}
