import { Component, createSignal } from 'solid-js';
import { useAuth } from '../../contexts/AuthContext';
import styles from './BoardControls.module.css';

type BoardControlsProps = {
  onReset?: () => Promise<void>;
  onGoBack?: () => Promise<void>;
  gameId?: string;
  canGoBack?: boolean;
};

const BoardControls: Component<BoardControlsProps> = (props) => {
  const { user } = useAuth();
  const [isResetting, setIsResetting] = createSignal(false);
  const [isGoingBack, setIsGoingBack] = createSignal(false);

  const handleResetBoard = async () => {
    const currentUser = user();
    if (!currentUser || isResetting()) return;
    
    setIsResetting(true);
    try {
      const response = await fetch('/api/reset-board', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          userId: currentUser.id,
          gameId: props.gameId
        })
      });

      if (!response.ok) {
        throw new Error('Failed to reset board');
      }

      if (props.onReset) {
        await props.onReset();
      }
      
    } catch (error) {
      console.error('Error resetting board:', error);
    } finally {
      setIsResetting(false);
    }
  };

  const handleGoBack = async () => {
    if (isGoingBack() || !props.canGoBack) return;
    
    setIsGoingBack(true);
    try {
      if (props.onGoBack) {
        await props.onGoBack();
      }
    } catch (error) {
      console.error('Error going back:', error);
    } finally {
      setIsGoingBack(false);
    }
  };

  return (
    <div class={styles.boardControls}>
      <button 
        onClick={handleGoBack} 
        disabled={!props.canGoBack || isGoingBack()}
        class={`${styles.controlButton} ${styles.goBackButton}`}
        title="Go back one move"
      >
        {isGoingBack() ? 'Going back...' : 'Go Back'}
      </button>
      <button 
        onClick={handleResetBoard} 
        disabled={isResetting()}
        class={`${styles.controlButton} ${styles.resetButton}`}
        title="Reset the game board to its initial state"
      >
        {isResetting() ? 'Resetting...' : 'Reset Board'}
      </button>
    </div>
  );
};

export default BoardControls;
