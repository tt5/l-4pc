import { createSignal, onCleanup, onMount } from 'solid-js';
import styles from './EngineControl.module.css';
import { getEngineClient } from '~/engine/wsClient';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export function EngineControl() {
  const [isRunning, setIsRunning] = createSignal(false);
  const [isLoading, setIsLoading] = createSignal(false);
  const [connectionStatus, setConnectionStatus] = createSignal<ConnectionStatus>('disconnected');
  const [error, setError] = createSignal<string | null>(null);
  const engine = getEngineClient();

  // Set up engine status listener
  onMount(() => {
    const cleanup = engine.on('status', (status) => {
      console.log('[EngineControl] Engine status update:', status);
      const isRunning = status?.running === true;
      setIsRunning(isRunning);
      setConnectionStatus(isRunning ? 'connected' : 'disconnected');
      
      if (isRunning) {
        setError(null);
      }
    });

    // Initial status check
    if (engine.isReady()) {
      engine.send('getEngineStatus');
    }

    return () => {
      cleanup();
    };
  });

  // Send command to engine
  const sendCommand = (command: string, data: any = {}) => {
    if (!engine.isReady()) {
      console.warn('Cannot send command: Engine not connected');
      return false;
    }

    try {
      engine.send(command, data);
      setIsLoading(true);
      return true;
    } catch (error) {
      console.error('Error sending command:', error);
      setError('Failed to send command to engine');
      return false;
    }
  };

  // Handle start/stop engine
  const handleStart = async () => {
    if (isRunning() || isLoading()) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/engine/start', { method: 'POST' });
      const result = await response.json();
      
      if (result.success) {
        // The WebSocket client will automatically connect and update the status
        console.log('Engine start requested, waiting for status update...');
      } else {
        setError(result.message || 'Failed to start engine');
      }
    } catch (error) {
      console.error('Error starting engine:', error);
      setError('Failed to start engine');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    if (!isRunning() || isLoading()) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // First try to stop gracefully via WebSocket if connected
      if (engine.isReady()) {
        sendCommand('stopEngine');
        // Wait a bit for the engine to stop
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Then make sure to stop via API
      const response = await fetch('/api/engine/stop', { method: 'POST' });
      const result = await response.json();
      
      if (!result.success) {
        setError(result.message || 'Failed to stop engine');
      } else {
        console.log('Engine stop requested, waiting for status update...');
      }
    } catch (error) {
      console.error('Error stopping engine:', error);
      setError('Failed to stop engine');
    } finally {
      setIsLoading(false);
    }
  };

  // Clean up on unmount
  onCleanup(() => {
    // No need to clean up the WebSocket connection as it's managed by the singleton
  });

  return (
    <div class={styles.container}>
      <h3>Engine Control</h3>
      <div class={styles.buttons}>
        <button
          onClick={handleStart}
          disabled={isRunning() || isLoading()}
          class={styles.button}
          classList={{
            [styles.button]: true,
            [styles.disabled]: isRunning() || isLoading(),
            [styles.active]: !isRunning() && !isLoading()
          }}
        >
          {isLoading() && isRunning() === false ? 'Starting...' : 'Start Engine'}
        </button>
        <button
          onClick={handleStop}
          disabled={!isRunning() || isLoading()}
          class={styles.button}
          classList={{
            [styles.button]: true,
            [styles.disabled]: !isRunning() || isLoading(),
            [styles.active]: isRunning() && !isLoading()
          }}
        >
          {isLoading() && isRunning() ? 'Stopping...' : 'Stop Engine'}
        </button>
      </div>
      <div class={styles.status}>
        Status: <span class={isRunning() ? styles.running : styles.stopped}>
          {isRunning() ? 'Running' : 'Stopped'}
          {connectionStatus() === 'connecting' && ' (Connecting...)'}
          {connectionStatus() === 'connected' && ' (Connected)'}
        </span>
      </div>
      {error() && <div class={styles.error}>{error()}</div>}
    </div>
  );
}

export default EngineControl;
