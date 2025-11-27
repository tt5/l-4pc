import { createSignal, createEffect, onMount, Show } from 'solid-js';
import styles from './GameStatus.module.css';
import { useUser } from '../../contexts/UserContext';
import { usePlayerPosition } from '../../contexts/PlayerPositionContext';
import { useNavigation } from '../../lib/utils/navigation';

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
  const { jumpToPosition } = useNavigation();
  const { setPosition, setRestrictedSquares } = usePlayerPosition();
  
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
