import { createSignal } from 'solid-js';
import { handleDirection as handleDirectionUtil } from '../utils/boardUtils';
import type { Direction, Point } from '../types/board';

type UseDirectionHandlerProps = {
  position: () => Point | null;
  setPosition: (value: Point) => void;
  getRestrictedSquares: () => number[];
  setRestrictedSquares: (value: number[] | ((prev: number[]) => number[])) => void;
};

type HandleDirectionOptions = {
  skipPositionUpdate?: boolean;
};

export function useDirectionHandler({
  position,
  setPosition,
  getRestrictedSquares,
  setRestrictedSquares,
}: UseDirectionHandlerProps) {
  const [isMoving, setIsMoving] = createSignal(false);

  const handleDirection = async (dir: Direction, options: HandleDirectionOptions = {}) => {
    if (isMoving() && !options.skipPositionUpdate) return;

    try {
      const newPosition = await handleDirectionUtil(dir, {
        isMoving,
        currentPosition: () => position() || [0, 0],
        setCurrentPosition: (value: Point) => (setPosition(value), value),
        restrictedSquares: getRestrictedSquares,
        setRestrictedSquares,
        setIsMoving,
        skipPositionUpdate: options.skipPositionUpdate
      });
      
      return newPosition;
    } catch (error) {
      console.error('Error handling direction:', error);
      setIsMoving(false);
      throw error;
    }
  };

  return {
    isMoving,
    handleDirection,
  };
}
