import { Component, createSignal } from 'solid-js';
import { useAuth } from '../../contexts/AuthContext';
import styles from './BoardControls.module.css';

type BoardControlsProps = {
  onReset?: () => void;
  onGoBack?: () => Promise<void>;
  onGoForward?: () => Promise<void>;
  onDeleteCurrentMove?: () => Promise<void>;
  onSaveGame?: () => Promise<void>;
  onLoadGame?: (gameId: string) => Promise<void>;
  onCellSizeChange?: (size: number) => void;
  cellSize?: number;
  gameId?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
  canDeleteCurrentMove?: boolean;
};

const BoardControls: Component<BoardControlsProps> = (props) => {
  const { user } = useAuth();
  const [isResetting, setIsResetting] = createSignal(false);
  const [isGoingBack, setIsGoingBack] = createSignal(false);
  const [isGoingForward, setIsGoingForward] = createSignal(false);
  const [isDeleting, setIsDeleting] = createSignal(false);
  const [isSaving, setIsSaving] = createSignal(false);
  const [gameIdInput, setGameIdInput] = createSignal('');
  const [isLoading, setIsLoading] = createSignal(false);
  const [localCellSize, setLocalCellSize] = createSignal(props.cellSize || 50);

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
        props.onReset();
      }
      
    } catch (error) {
      console.error('Error resetting board:', error);
    } finally {
      setIsResetting(false);
    }
  };

  const handleGoBack = async () => {
    
    if (isGoingBack() || !props.canGoBack) {
      console.log('[BoardControls] Back action prevented - already going back or cannot go back');
      return;
    }
    
    setIsGoingBack(true);
    
    try {
      if (props.onGoBack) {
        await props.onGoBack();
      } else {
      }
    } catch (error) {
      console.error('[BoardControls] Error going back:', error);
      // Log additional error details if available
      if (error instanceof Error) {
        console.error(`[BoardControls] Error details: ${error.message}`, error.stack);
      }
    } finally {
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

  const handleSaveClick = async (e: Event) => {
    e.preventDefault();
    if (isSaving() || !props.onSaveGame) return;
    setIsSaving(true);
    try {
      await props.onSaveGame();
    } catch (error) {
      console.error('Error saving game:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadGame = async (e: Event) => {
    e.preventDefault();
    const id = gameIdInput().trim();
    if (!id || !props.onLoadGame) return;
    
    setIsLoading(true);
    try {
      await props.onLoadGame(id);
      setGameIdInput('');
    } catch (error) {
      console.error('Error loading game:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCellSizeChange = (e: Event) => {
    const newSize = parseInt((e.target as HTMLInputElement).value, 10);
    setLocalCellSize(newSize);
    if (props.onCellSizeChange) {
      props.onCellSizeChange(newSize);
    }
  };

  return (
    <div class={styles.boardControls}>
      <div class={styles.controlGroup}>
        <label class={styles.controlLabel}>Grid Size</label>
        <input
          type="range"
          min="30"
          max="100"
          step="5"
          value={localCellSize()}
          onInput={handleCellSizeChange}
          class={styles.slider}
        />
        <span class={styles.sizeDisplay}>{localCellSize()}px</span>
      </div>
      <div class={styles.gameId}>{props.gameId}</div>
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
      {props.canDeleteCurrentMove && (
        <button
          onClick={async (e) => {
            e.preventDefault();
            if (isDeleting() || !props.onDeleteCurrentMove) return;
            setIsDeleting(true);
            try {
              await props.onDeleteCurrentMove();
            } catch (error) {
              console.error('Error deleting move:', error);
            } finally {
              setIsDeleting(false);
            }
          }}
          disabled={isDeleting() || !props.canDeleteCurrentMove}
          class={`${styles.controlButton} ${styles.deleteButton}`}
          title="Delete current move and all subsequent moves"
        >
          {isDeleting() ? 'Deleting...' : 'Delete Move'}
        </button>
      )}
      <div class={styles.loadGameContainer}>
        <input
          type="text"
          value={gameIdInput()}
          onInput={(e) => setGameIdInput(e.currentTarget.value)}
          placeholder="Enter game ID"
          class={styles.gameIdInput}
        />
        <button
          onClick={handleLoadGame}
          disabled={isLoading() || !gameIdInput() || !props.onLoadGame}
          class={`${styles.controlButton} ${styles.loadButton}`}
          title="Load a saved game"
        >
          {isLoading() ? 'Loading...' : 'Load Game'}
        </button>
      </div>
      <button
        onClick={handleSaveClick}
        disabled={isSaving() || !props.onSaveGame}
        class={`${styles.controlButton} ${styles.saveButton}`}
        title="Save the current game state"
      >
        {isSaving() ? 'Saving...' : 'Save Game'}
      </button>
    </div>
  );
};

export default BoardControls;
