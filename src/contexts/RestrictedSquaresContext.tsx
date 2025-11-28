import { createContext, createSignal, useContext, type ParentProps } from 'solid-js';

interface RestrictedSquaresContextType {
  restrictedSquares: () => number[];
  setRestrictedSquares: (value: number[] | ((prev: number[]) => number[])) => void;
}

const RestrictedSquaresContext = createContext<RestrictedSquaresContextType>();

export function RestrictedSquaresProvider(props: ParentProps) {
  const [restrictedSquares, setRestrictedSquares] = createSignal<number[]>([]);
  
  return (
    <RestrictedSquaresContext.Provider value={{
      restrictedSquares,
      setRestrictedSquares,
    }}>
      {props.children}
    </RestrictedSquaresContext.Provider>
  );
}

export function useRestrictedSquares() {
  const context = useContext(RestrictedSquaresContext);
  if (!context) {
    throw new Error('useRestrictedSquares must be used within a RestrictedSquaresProvider');
  }
  return context;
}
