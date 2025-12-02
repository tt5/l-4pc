import { Component, createSignal } from 'solid-js';
import { useAuth } from '../../contexts/AuthContext';
import styles from './BoardControls.module.css';

type BoardControlsProps = {
  onReset?: () => Promise<void>;
};

const BoardControls: Component<BoardControlsProps> = (props) => {
  const { user } = useAuth();
  const [isResetting, setIsResetting] = createSignal(false);

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
        body: JSON.stringify({ userId: currentUser.id })
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

  return (
    <div class={styles.boardControls}>
      <button 
        onClick={handleResetBoard} 
        disabled={isResetting()}
        class={styles.controlButton}
        title="Reset the game board to its initial state"
      >
        {isResetting() ? 'Resetting...' : 'Reset Board'}
      </button>
    </div>
  );
};

export default BoardControls;
