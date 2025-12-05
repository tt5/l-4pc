import { Component, createSignal } from 'solid-js';
import { useAuth } from '../../contexts/AuthContext';
import styles from './BoardControls.module.css';

type BoardControlsProps = {
  onReset?: () => Promise<void>;
  onGoBack?: () => Promise<void>;
  onGoForward?: () => Promise<void>;
  gameId?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
};

const BoardControls: Component<BoardControlsProps> = (props) => {
  const { user } = useAuth();
  const [isResetting, setIsResetting] = createSignal(false);
  const [isGoingBack, setIsGoingBack] = createSignal(false);
  const [isGoingForward, setIsGoingForward] = createSignal(false);

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
    console.log('[BoardControls] Back button clicked');
    console.log(`[BoardControls] Current state - isGoingBack: ${isGoingBack()}, canGoBack: ${props.canGoBack}`);
    
    if (isGoingBack() || !props.canGoBack) {
      console.log('[BoardControls] Back action prevented - already going back or cannot go back');
      return;
    }
    
    console.log('[BoardControls] Starting back navigation...');
    const startTime = performance.now();
    setIsGoingBack(true);
    
    try {
      if (props.onGoBack) {
        console.log('[BoardControls] Calling onGoBack callback');
        await props.onGoBack();
        console.log('[BoardControls] Successfully went back one move');
      } else {
        console.warn('[BoardControls] onGoBack callback is not defined');
      }
    } catch (error) {
      console.error('[BoardControls] Error going back:', error);
      // Log additional error details if available
      if (error instanceof Error) {
        console.error(`[BoardControls] Error details: ${error.message}`, error.stack);
      }
    } finally {
      const duration = (performance.now() - startTime).toFixed(2);
      console.log(`[BoardControls] Back navigation completed in ${duration}ms`);
      setIsGoingBack(false);
    }
  };

  const handleGoForward = async () => {
    if (isGoingForward() || !props.canGoForward) return;
    
    setIsGoingForward(true);
    try {
      if (props.onGoForward) {
        await props.onGoForward();
      }
    } catch (error) {
      console.error('Error going forward:', error);
    } finally {
      setIsGoingForward(false);
    }
  };

  return (
    <div class={styles.boardControls}>
      <div class={styles.navButtons}>
        <button 
          onClick={handleGoBack} 
          disabled={!props.canGoBack || isGoingBack()}
          class={`${styles.controlButton} ${styles.navButton} ${styles.backButton}`}
          title="Go back one move"
        >
          {isGoingBack() ? '...' : '⏪ Back'}
        </button>
        <button 
          onClick={handleGoForward} 
          disabled={!props.canGoForward || isGoingForward()}
          class={`${styles.controlButton} ${styles.navButton} ${styles.forwardButton}`}
          title="Go forward one move"
        >
          {isGoingForward() ? '...' : 'Forward ⏩'}
        </button>
      </div>
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
