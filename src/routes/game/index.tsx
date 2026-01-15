import { Title } from "@solidjs/meta";
import { Show, createSignal, createEffect, onMount, createResource } from 'solid-js';
import { useSearchParams } from '@solidjs/router';
import { useAuth } from '~/contexts/AuthContext';
import { RestrictedSquaresProvider } from '~/contexts/RestrictedSquaresContext';
import Board from '~/components/Game/Board';
import { DEFAULT_GAME_ID } from '~/constants/game';
import styles from './game.module.css';

function GameContent() {
  const { user, isInitialized, logout } = useAuth();
  const [searchParams] = useSearchParams();
  
  // Initialize gameId with priority: URL param > default
  const [gameId, setGameId] = createSignal<string>(
    (Array.isArray(searchParams.gameId) ? searchParams.gameId[0] : searchParams.gameId) || DEFAULT_GAME_ID
  );
  
  // Fetch all game IDs for the user
  const [games] = createResource(async () => {
    if (!user()) return [];
    try {
      const response = await fetch('/api/game/list', {
        headers: { 'Authorization': `Bearer ${user()?.id}` }
      });
      if (response.ok) {
        const data = await response.json();
        return data.gameIds || [];
      }
      return [];
    } catch (error) {
      console.error('Failed to fetch game list:', error);
      return [];
    }
  });

  // Fetch the latest game ID when the component mounts or user changes
  onMount(async () => {
    if (!user()) return;
    
    try {
      const response = await fetch('/api/game/latest', {
        headers: {
          'Authorization': `Bearer ${user()?.id}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.gameId) {
          setGameId(data.gameId);
        }
      }
    } catch (error) {
      console.error('Failed to fetch latest game ID:', error);
    }
  });
  
  // Update URL when gameId changes
  createEffect(() => {
    const currentGameId = gameId();
    const newParams = new URLSearchParams(window.location.search);
    
    if (currentGameId !== DEFAULT_GAME_ID) {
      newParams.set('gameId', currentGameId);
    } else {
      newParams.delete('gameId');
    }
    
    const newUrl = `${window.location.pathname}${newParams.toString() ? `?${newParams.toString()}` : ''}`;
    window.history.replaceState({}, '', newUrl);
  });
  
  return (
    <div class={styles.container}>
      <Title>Game</Title>
      
      <Show when={isInitialized()} fallback={
        <div class={styles.loadingContainer}>
          <h1>Loading Game...</h1>
          <div>Initializing authentication...</div>
        </div>
      }>
        <Show when={user()} fallback={
          <div class={styles.loginContainer}>
            <h1>Not Logged In</h1>
            <p>Please log in to access the game.</p>
          </div>
        }>
          <RestrictedSquaresProvider>
            <div class={styles.gameContainer}>
              
              <div class={styles.settingsContainer}>
                <div>
                  <h2>{user()?.username}</h2>
                  <div>Games: {games()?.join(', ') || 'No games found'}</div>
                </div>
                <button onClick={() => logout()}>Logout</button>
              </div>
              <Board gameId={gameId()} />
            </div>
          </RestrictedSquaresProvider>
        </Show>
      </Show>
    </div>
  );
}

export default function GamePage() {
  return (
    <RestrictedSquaresProvider>
      <GameContent />
    </RestrictedSquaresProvider>
  );
}
