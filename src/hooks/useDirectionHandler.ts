import { createSignal } from 'solid-js';
import { handleDirection as handleDirectionUtil } from '../utils/boardUtils';
import type { Direction, Point } from '../types/board';

type UseDirectionHandlerProps = {
  position: () => Point | null;
  setPosition: (value: Point) => void;
  getRestrictedSquares: () => number[];
  setRestrictedSquares: (value: number[] | ((prev: number[]) => number[])) => void;
};

export function useDirectionHandler({
  position,
  setPosition,
  getRestrictedSquares,
  setRestrictedSquares,
}: UseDirectionHandlerProps) {
  const [isMoving, setIsMoving] = createSignal(false);

  const handleDirection = async (dir: Direction) => {
    if (isMoving()) return;

    try {
      await handleDirectionUtil(dir, {
        isMoving,
        currentPosition: () => position() || [0, 0],
        setCurrentPosition: (value: Point) => (setPosition(value), value),
        restrictedSquares: getRestrictedSquares,
        setRestrictedSquares,
        setIsMoving,
      });
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
