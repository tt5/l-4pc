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

  // Set up engine status and connection listeners
  onMount(() => {
    const updateStatus = (isRunning: boolean) => {
      console.log('[EngineControl] Updating engine status:', { isRunning });
      setIsRunning(isRunning);
      setConnectionStatus(isRunning ? 'connected' : 'disconnected');
      if (isRunning) {
        setError(null);
      }
    };

    const onStatus = (status: { running: boolean }) => {
      console.log('[EngineControl] Engine status update:', status);
      updateStatus(status?.running === true);
    };

    const onConnected = () => {
      console.log('[EngineControl] WebSocket connected');
      updateStatus(true);
    };

    const onDisconnected = () => {
      console.log('[EngineControl] WebSocket disconnected');
      updateStatus(false);
    };

    const onConnectionLost = () => {
      console.log('[EngineControl] WebSocket connection lost, attempting to reconnect...');
      setConnectionStatus('connecting');
    };

    // Set up all event listeners
    const cleanupStatus = engine.on('status', onStatus);
    const cleanupConnected = engine.on('connected', onConnected);
    const cleanupDisconnected = engine.on('disconnected', onDisconnected);
    const cleanupConnectionLost = engine.on('connectionLost', onConnectionLost);

    // Initial status check
    updateStatus(engine.isConnected());

    // Clean up all listeners on unmount
    return () => {
      cleanupStatus();
      cleanupConnected();
      cleanupDisconnected();
      cleanupConnectionLost();
    };
  });

  // Send command to engine
  const sendCommand = (command: string, data: any = {}) => {
    if (!engine.isConnected()) {
      console.warn('Cannot send command: Engine not connected');
      return false;
    }

    try {
      // Map commands to the appropriate WebSocket client methods
      switch (command) {
        case 'startAnalysis':
          engine.startAnalysis(data.moveHistory || []);
          break;
        case 'stopAnalysis':
          engine.stopAnalysis();
          break;
        case 'makeMove':
          engine.makeMove(data.fen, data.move, data.moveHistory || []);
          break;
        case 'updatePosition':
          engine.updatePosition(data.fen, data.moveHistory || []);
          break;
        case 'setThreads':
          engine.setThreads(data.threads);
          break;
        default:
          console.warn(`Unknown command: ${command}`);
          return false;
      }
      
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
    setConnectionStatus('connecting');
    
    try {
      // First, start the engine process
      const response = await fetch('/api/engine/start', { method: 'POST' });
      const result = await response.json();
      
      if (result.success) {
        // Connect the WebSocket client
        try {
          await engine.connect();
          console.log('Engine started and WebSocket connected');
        } catch (err) {
          console.error('Failed to connect WebSocket:', err);
          setError('Engine started but failed to connect WebSocket');
          setConnectionStatus('disconnected');
        }
      } else {
        setError(result.message || 'Failed to start engine');
        setConnectionStatus('disconnected');
      }
    } catch (error) {
      console.error('Error starting engine:', error);
      setError('Failed to start engine');
      setConnectionStatus('disconnected');
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
      if (engine.isConnected()) {
        // Use the stopEngine method instead of sendCommand
        const stopped = engine.stopEngine();
        if (!stopped) {
          console.warn('Failed to stop engine via WebSocket');
        }
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
