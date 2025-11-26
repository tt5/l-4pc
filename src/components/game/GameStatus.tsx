import { createSignal, createEffect, onMount, Show } from 'solid-js';
import styles from './GameStatus.module.css';
import { useUser } from '../../contexts/UserContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayerPosition } from '../../contexts/PlayerPositionContext';
import { useNavigation } from '../../lib/utils/navigation';
import { createPoint } from '../../types/board';
import { useNavigate } from '@solidjs/router';

// API response types
interface GameStatusResponse {
  success: boolean;
  gameJoined: boolean;
  homeX: number;
  homeY: number;
  message?: string;
  error?: string;
}

// Component state type
interface GameStatusState {
  gameJoined: boolean;
  homeX: number;
  homeY: number;
  isLoading: boolean;
  error: string | null;
  message: string | null;
}

export function GameStatus() {
  const [state, setState] = createSignal<GameStatusState>({
    gameJoined: false,
    homeX: 0,
    homeY: 0,
    isLoading: true,
    error: null,
    message: null
  });
  
  const userContext = useUser();
  const auth = useAuth();
  const navigate = useNavigate();
  const { jumpToPosition } = useNavigation();
  const { setPosition, setRestrictedSquares } = usePlayerPosition();
  
  // Update state helper
  const updateState = (updates: Partial<GameStatusState>) => {
    setState(prev => ({
      ...prev,
      ...updates,
      // Clear error when loading starts
      ...(updates.isLoading === true ? { error: null, message: null } : {})
    }));
  };

  // Fetch the current game status
  const fetchGameStatus = async () => {
    if (!userContext.user()) {
      updateState({ 
        isLoading: false,
        error: 'You must be logged in to view game status' 
      });
      return;
    }
    
    updateState({ isLoading: true });
    
    try {
      const response = await fetch('/api/game/status', {
        credentials: 'include'  // This ensures cookies are sent with the request
      });
      const data: GameStatusResponse = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch game status');
      }
      
      updateState({
        isLoading: false,
        gameJoined: data.gameJoined,
        homeX: data.homeX,
        homeY: data.homeY,
        message: data.message || null
      });
      
    } catch (error) {
      console.error('Error fetching game status:', error);
      updateState({ 
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load game status',
        message: 'An error occurred while loading the game status.'
      });
    }
  };

  // Handle joining the game
  const handleJoinGame = async () => {
    if (!auth.user()) {
      console.log("User is not logged in")
      // Save the current URL to return to after login
      const returnUrl = window.location.pathname + window.location.search;
      navigate(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
      return;
    }

    updateState({ isLoading: true });
    
    try {
      const response = await fetch('/api/game/join', { 
        method: 'POST',
        credentials: 'include',  // This ensures cookies are sent with the request
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const data: GameStatusResponse = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to join game');
      }
      
      // Update state with new game status
      updateState({
        isLoading: false,
        gameJoined: data.gameJoined,
        homeX: data.homeX,
        homeY: data.homeY,
        message: data.message || 'Successfully joined the game!'
      });
      
      // Jump to home base coordinates if we have valid coordinates
      if (typeof data.homeX === 'number' && typeof data.homeY === 'number') {
        try {
          // First update the position in the context
          const newPosition = createPoint(-data.homeX, -data.homeY);
          setPosition(newPosition);
          
          // Then fetch and update restricted squares
          const result = await jumpToPosition(-data.homeX, -data.homeY);
          if (result) {
            
            // Update the restricted squares in the context
            setRestrictedSquares(result.restrictedSquares);
          }
        } catch (error) {
          console.error('Failed to jump to home base:', error);
        }
      }
      
      // Note: We're not reloading the page here anymore to prevent losing the jump state
      // The page will update automatically through the position change
      
    } catch (error) {
      console.error('Error joining game:', error);
      updateState({ 
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to join game',
        message: 'An error occurred while joining the game.'
      });
    }
  };

  // Handle leaving the game
  const handleLeaveGame = async () => {
    if (!userContext.user()) return;
    
    if (!confirm('Are you sure you want to leave the game? Your base will remain but you won\'t be able to add new base points.')) {
      return;
    }
    
    updateState({ isLoading: true });
    
    try {
      const response = await fetch('/api/game/leave', { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const data: { success: boolean; message?: string; error?: string } = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to leave game');
      }
      
      // Show success message before reloading
      updateState({
        isLoading: false,
        gameJoined: false,
        message: data.message || 'Successfully left the game.'
      });
      
      // Refresh the page after a short delay to show the success message
      setTimeout(() => {
        window.location.reload();
      }, 1500);
      
    } catch (error) {
      console.error('Error leaving game:', error);
      updateState({ 
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to leave game',
        message: 'An error occurred while leaving the game.'
      });
    }
  };

  // Initial load
  onMount(() => {
    fetchGameStatus();
  });
  
  // Auto-refresh status when user changes
  createEffect(() => {
    if (userContext.user()) {
      fetchGameStatus();
    }
  });

  return (
    <div class={styles.gameStatus}>
      {/* Loading state */}
      <Show when={state().isLoading}>
        <div class={styles.loading}>Loading game status...</div>
      </Show>

      {/* Error message */}
      <Show when={state().error}>
        <div class={styles.errorMessage}>
          {state().error}
        </div>
      </Show>

      {/* Success message */}
      <Show when={state().message && !state().isLoading}>
        <div class={styles.successMessage}>
          {state().message}
        </div>
      </Show>

      {/* Game status info */}
      <div class={styles.statusInfo} classList={{ [styles.isLoading]: state().isLoading }}>
        <div class={styles.statusRow}>
          <span class={styles.statusLabel}>Game Status:</span>
          <span class={styles.statusValue}>
            {state().gameJoined ? '✅ Joined' : '❌ Not Joined'}
          </span>
        </div>
        
        <Show when={state().gameJoined}>
          <div class={styles.statusRow}>
            <span class={styles.statusLabel}>Home Base:</span>
            <span class={styles.statusValue}>
              ({state().homeX}, {state().homeY})
            </span>
          </div>
        </Show>
      </div>

      {/* Action buttons */}
      <div class={styles.actions}>
        <Show
          when={state().gameJoined}
          fallback={
            <button 
              onClick={handleJoinGame} 
              disabled={state().isLoading}
              class={styles.joinButton}
            >
              {state().isLoading ? 'Joining...' : 'Join Game'}
            </button>
          }
        >
          <button 
            onClick={handleLeaveGame} 
            disabled={state().isLoading}
            class={styles.leaveButton}
          >
            {state().isLoading ? 'Leaving...' : 'Leave Game'}
          </button>
        </Show>
      </div>
    </div>
  );
}
