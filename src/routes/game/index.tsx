import { Title } from "@solidjs/meta";
import { Show, createSignal, createEffect } from 'solid-js';
import { useSearchParams } from '@solidjs/router';
import { useAuth } from '~/contexts/AuthContext';
import { RestrictedSquaresProvider } from '~/contexts/RestrictedSquaresContext';
import Board from '~/components/Game/Board';
import SidePanel from '~/components/Game/SidePanel';
import { DEFAULT_GAME_ID } from '~/constants/game';
import styles from './game.module.css';

function GameContent() {
  const { user, isInitialized, logout, gameId: authGameId } = useAuth();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = createSignal('info');
  
  // Initialize gameId with priority: auth context > URL param > default
  const [gameId, setGameId] = createSignal<string>(
    authGameId() || (Array.isArray(searchParams.gameId) ? searchParams.gameId[0] : searchParams.gameId) || DEFAULT_GAME_ID
  );
  
  // Sync auth game ID with local state
  createEffect(() => {
    if (authGameId()) {
      setGameId(authGameId()!);
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
              <SidePanel 
                activeTab={activeTab() as 'info' | 'settings'}
                onTabChange={(tab) => setActiveTab(tab)}
                username={user()!.username}
                userId={user()!.id}
                onLogout={logout}
              />
              
              <div class={styles.gameBoard}>
                <Show when={activeTab() === 'info'}>
                  <Board gameId={gameId()} />
                </Show>
                <Show when={activeTab() === 'settings'}>
                  <h2>Settings</h2>
                </Show>
              </div>
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
