import { createSignal, onCleanup } from 'solid-js';
import styles from './EngineControl.module.css';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export function EngineControl() {
  const [isRunning, setIsRunning] = createSignal(false);
  const [isLoading, setIsLoading] = createSignal(false);
  const [connectionStatus, setConnectionStatus] = createSignal<ConnectionStatus>('disconnected');
  const [error, setError] = createSignal<string | null>(null);
  
  let ws: WebSocket | null = null;
  const WS_URL = 'ws://localhost:8080';

  const connect = () => {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
      return; // Already connecting or connected
    }

    setConnectionStatus('connecting');
    setError(null);
    
    try {
      ws = new WebSocket(WS_URL);
      
      ws.onopen = () => {
        console.log('Connected to engine server');
        setConnectionStatus('connected');
        sendCommand('getEngineStatus');
      };

      ws.onmessage = (event) => {
        try {
          const { type, data } = JSON.parse(event.data);
          if (type === 'engineStatus') {
            setIsRunning(data.running);
            setIsLoading(false);
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
          setError('Error processing engine response');
        }
      };

      ws.onclose = () => {
        console.log('Disconnected from engine server');
        setConnectionStatus('disconnected');
        // Only try to reconnect if the engine is supposed to be running
        if (isRunning()) {
          console.log('Attempting to reconnect...');
          setTimeout(connect, 2000);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('disconnected');
        setError('Failed to connect to engine');
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      setConnectionStatus('disconnected');
      setError('Failed to connect to engine');
    }
  };

  const sendCommand = (command: string) => {
    if (ws?.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: command }));
        setIsLoading(true);
      } catch (error) {
        console.error('Error sending command:', error);
        setError('Failed to send command to engine');
      }
    } else {
      console.warn('WebSocket is not connected');
      setError('Not connected to engine');
    }
  };

  const handleStart = async () => {
    if (isRunning() || isLoading()) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/engine/start', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        // Wait a bit for the server to start before connecting
        await new Promise(resolve => setTimeout(resolve, 1000));
        connect();
      } else {
        setError(data.message || 'Failed to start engine');
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error starting engine:', error);
      setError('Failed to start engine');
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    if (!isRunning() || isLoading()) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // First try to stop gracefully via WebSocket
      if (ws?.readyState === WebSocket.OPEN) {
        sendCommand('stopEngine');
        // Wait a bit for the engine to stop
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Then make sure to stop via API
      const response = await fetch('/api/engine/stop', { method: 'POST' });
      const data = await response.json();
      
      if (!data.success) {
        setError(data.message || 'Failed to stop engine');
      } else {
        setIsRunning(false);
      }
    } catch (error) {
      console.error('Error stopping engine:', error);
      setError('Failed to stop engine');
    } finally {
      setIsLoading(false);
      
      // Close WebSocket connection when stopping
      if (ws) {
        ws.close();
        ws = null;
      }
      setConnectionStatus('disconnected');
    }
  };

  onCleanup(() => {
    if (ws) {
      ws.close();
    }
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
