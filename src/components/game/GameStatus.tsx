import { createSignal } from 'solid-js';
import styles from './GameStatus.module.css';
import { useUser } from '../../contexts/UserContext';
import { usePlayerPosition } from '../../contexts/PlayerPositionContext';

// Component state type
interface GameStatusState {
  isLoading: boolean;
  error: string | null;
  message: string | null;
}

export function GameStatus() {
  const [state, setState] = createSignal<GameStatusState>({
    isLoading: false,
    error: null,
    message: 'Game is always active for all users.'
  });
  
  const userContext = useUser();
  const { setRestrictedSquares } = usePlayerPosition();
  
  // Show message or error state
  return (
    <div class={styles.gameStatus}>
      {state().message && (
        <div class={styles.message}>
          {state().message}
        </div>
      )}
      {state().error && (
        <div class={styles.error}>
          <p>Error: {state().error}</p>
        </div>
      )}
    </div>
  );
}
