import { createSignal, onCleanup, onMount } from 'solid-js';
import styles from './EngineControl.module.css';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export function EngineControl() {
  const [isRunning, setIsRunning] = createSignal(false);
  const [isLoading, setIsLoading] = createSignal(false);
  const [connectionStatus, setConnectionStatus] = createSignal<ConnectionStatus>('disconnected');
  const [error, setError] = createSignal<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = createSignal(0);
  const reconnectTimeoutRef = { current: null as NodeJS.Timeout | null };
  
  let ws: WebSocket | null = null;
  const WS_URL = 'ws://localhost:8080';
  const MAX_RECONNECT_ATTEMPTS = 5;
  const INITIAL_RECONNECT_DELAY = 1000; // 1 second
  const MAX_RECONNECT_DELAY = 30000; // 30 seconds

  // Calculate reconnect delay with exponential backoff
  const getReconnectDelay = (attempt: number) => {
    return Math.min(INITIAL_RECONNECT_DELAY * Math.pow(2, attempt), MAX_RECONNECT_DELAY);
  };

  // Clean up WebSocket connection
  const cleanup = () => {
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      ws = null;
    }
    
    // Clear any pending reconnection attempts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  };

  // Handle reconnection
  const scheduleReconnect = () => {
    if (reconnectAttempts() >= MAX_RECONNECT_ATTEMPTS) {
      console.log('Max reconnection attempts reached');
      setError('Failed to connect to engine after multiple attempts');
      return;
    }

    const delay = getReconnectDelay(reconnectAttempts());
    console.log(`Scheduling reconnection attempt ${reconnectAttempts() + 1} in ${delay}ms`);
    
    reconnectTimeoutRef.current = setTimeout(() => {
      setReconnectAttempts(prev => prev + 1);
      connect();
    }, delay);
  };

  const connect = () => {
    // Clean up any existing connection
    cleanup();
    
    // Don't try to connect if we're already connected/connecting
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setConnectionStatus('connecting');
    setError(null);

    try {
      console.log(`Connecting to WebSocket at ${WS_URL}...`);
      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log('WebSocket connection established');
        setConnectionStatus('connected');
        setReconnectAttempts(0); // Reset reconnect attempts on successful connection
        sendCommand('getEngineStatus');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('Received message:', message);

          switch (message.type) {
            case 'engineStatus':
              setIsRunning(message.data?.running || false);
              setIsLoading(false);
              break;
            case 'error':
              console.error('Engine error:', message.data?.message);
              setError(message.data?.message || 'An error occurred');
              break;
          }
        } catch (error) {
          console.error('Error processing message:', error, event.data);
          setError('Error processing engine response');
        }
      };

      ws.onclose = (event) => {
        console.log(`WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`);
        setConnectionStatus('disconnected');
        
        // Only try to reconnect if the engine is supposed to be running
        if (isRunning()) {
          console.log('Connection lost, attempting to reconnect...');
          scheduleReconnect();
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
      
      if (isRunning()) {
        scheduleReconnect();
      }
    }
  };

  // Send command to WebSocket
  const sendCommand = (command: string, data: any = {}) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('Cannot send command: WebSocket not connected');
      // Try to reconnect if we're supposed to be connected
      if (isRunning() && connectionStatus() !== 'connecting') {
        connect();
      }
      return false;
    }

    try {
      const message = JSON.stringify({ type: command, data });
      ws.send(message);
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
        // Wait a bit for the server to start before connecting
        await new Promise(resolve => setTimeout(resolve, 1000));
        connect();
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
      if (ws?.readyState === WebSocket.OPEN) {
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
        setIsRunning(false);
        cleanup();
      }
    } catch (error) {
      console.error('Error stopping engine:', error);
      setError('Failed to stop engine');
    } finally {
      setIsLoading(false);
    }
  };

  // Set up initial connection when component mounts
  onMount(() => {
    if (isRunning()) {
      connect();
    }

    return () => {
      cleanup();
    };
  });

  // Clean up on unmount
  onCleanup(() => {
    cleanup();
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
