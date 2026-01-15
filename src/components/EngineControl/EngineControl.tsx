import { createSignal, onCleanup, onMount } from 'solid-js';
import styles from './EngineControl.module.css';

export function EngineControl() {
  const [isRunning, setIsRunning] = createSignal(false);
  const [isLoading, setIsLoading] = createSignal(false);
  let ws: WebSocket | null = null;
  const WS_URL = 'ws://localhost:8080';

  const connect = () => {
    try {
      ws = new WebSocket(WS_URL);
      
      ws.onopen = () => {
        console.log('Connected to engine server');
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
        }
      };

      ws.onclose = () => {
        console.log('Disconnected from engine server');
        // Try to reconnect after a delay
        setTimeout(connect, 2000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to connect to WebSocket:', error);
      // Retry connection after delay
      setTimeout(connect, 2000);
    }
  };

  const sendCommand = (command: string) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: command }));
      setIsLoading(true);
    } else {
      console.warn('WebSocket is not connected');
      connect(); // Try to reconnect
    }
  };

  onMount(() => {
    connect();
    return () => {
      if (ws) {
        ws.close();
      }
    };
  });

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
          onClick={() => sendCommand('startEngine')}
          disabled={isRunning() || isLoading()}
          class={styles.button}
          classList={{
            [styles.button]: true,
            [styles.disabled]: isRunning() || isLoading(),
            [styles.active]: !isRunning() && !isLoading()
          }}
        >
          {isLoading() ? '...' : 'Start Engine'}
        </button>
        <button
          onClick={() => sendCommand('stopEngine')}
          disabled={!isRunning() || isLoading()}
          class={styles.button}
          classList={{
            [styles.button]: true,
            [styles.disabled]: !isRunning() || isLoading(),
            [styles.active]: isRunning() && !isLoading()
          }}
        >
          {isLoading() ? '...' : 'Stop Engine'}
        </button>
      </div>
      <div class={styles.status}>
        Status: <span class={isRunning() ? styles.running : styles.stopped}>
          {isRunning() ? 'Running' : 'Stopped'}
        </span>
      </div>
    </div>
  );
}

export default EngineControl;
