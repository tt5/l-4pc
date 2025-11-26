import { createContext, createSignal, useContext, type ParentProps } from 'solid-js';
import type { Point } from '~/types/board';

interface PlayerPositionContextType {
  position: () => Point | null;
  setPosition: (pos: Point) => void;
  restrictedSquares: () => number[];
  setRestrictedSquares: (value: number[] | ((prev: number[]) => number[])) => void;
}

const PlayerPositionContext = createContext<PlayerPositionContextType>();

export function PlayerPositionProvider(props: ParentProps) {
  const [position, setPosition] = createSignal<Point | null>(null);
  const [restrictedSquares, setRestrictedSquares] = createSignal<number[]>([]);
  
  return (
    <PlayerPositionContext.Provider value={{
      position,
      setPosition,
      restrictedSquares,
      setRestrictedSquares,
    }}>
      {props.children}
    </PlayerPositionContext.Provider>
  );
}

export function usePlayerPosition() {
  const context = useContext(PlayerPositionContext);
  if (!context) {
    throw new Error('usePlayerPosition must be used within a PlayerPositionProvider');
  }
  return context;
}
