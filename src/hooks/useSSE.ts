import { createSignal, onCleanup } from 'solid-js';

type Notification = {
  id: string | number;
  message: string;
  timestamp: number;
  userId?: string;
  count?: number;
};

type SSEMessage = {
  type: string;
  event?: string;
  point?: any;
  count?: number;
  totalBasePoints?: number;
  initialCount?: number;
  message?: string;
  [key: string]: any;
};

type BasePointUpdateHandler = (point: any) => void;

export const useSSE = (url: string, onBasePointUpdated?: BasePointUpdateHandler) => {
  // State
  const [totalBasePoints, setTotalBasePoints] = createSignal<number | null>(null);
  const [notifications, setNotifications] = createSignal<Notification[]>([]);
  const [addedCount, setAddedCount] = createSignal(0);
  const [deletedCount, setDeletedCount] = createSignal(0);
  const [isConnected, setIsConnected] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);

  // Reconnection state
  const MAX_RECONNECT_ATTEMPTS = 5;
  const INITIAL_RECONNECT_DELAY = 1000;
  const CONNECTION_TIMEOUT = 10000;
  
  // Refs
  const eventSourceRef = { current: null as EventSource | null };
  const reconnectAttemptsRef = { current: 0 };
  const reconnectTimeoutRef = { current: null as NodeJS.Timeout | null };
  const connectionTimeoutRef = { current: null as NodeJS.Timeout | null };
  const isMountedRef = { current: true };

  // Cleanup function
  const cleanup = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
  };

  const handleMessage = (message: SSEMessage) => {
    console.log('[SSE] handleMessage called with:', message);
    try {
      switch (message.type) {
        case 'basePoint:created':
          setAddedCount(prev => prev + 1);
          if (message.totalBasePoints !== undefined) {
            setTotalBasePoints(message.totalBasePoints);
          }
          break;
          
        case 'basePoint:deleted':
          setDeletedCount(prev => prev + 1);
          if (message.totalBasePoints !== undefined) {
            setTotalBasePoints(message.totalBasePoints);
          }
          break;
          
        case 'basePoint:updated':
          console.log('[SSE] Processing basePoint:updated:', message);
          if (onBasePointUpdated) {
            // Use the point property if it exists, otherwise use the message itself
            const pointData = message.point || message.basePoint || message;
            console.log('[SSE] Calling onBasePointUpdated with point:', pointData);
            onBasePointUpdated(pointData);
          } else {
          }
          break;
          
        case 'init':
          if (message.totalBasePoints !== undefined) {
            setTotalBasePoints(message.totalBasePoints);
          }
          break;
          
        default:
          console.warn('Unhandled message type:', message.type);
      }
      
      // Add notification if message contains one
      if (message.message) {
        const notification: Notification = {
          id: Date.now(),
          message: message.message,
          timestamp: Date.now(),
          userId: message.userId,
          count: message.count
        };
        
        setNotifications(prev => [notification, ...prev].slice(0, 50));
      }
    } catch (err) {
      console.error('Error handling SSE message:', err);
    }
  };

  const attemptReconnect = () => {
    if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
      const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current);
      reconnectAttemptsRef.current++;
      console.log(`[SSE] Attempting to reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
      
      reconnectTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          connect();
        }
      }, delay);
    } else {
      console.error('[SSE] Max reconnection attempts reached');
    }
  };

  const connect = () => {
    if (!isMountedRef.current) return;

    cleanup();
    
    setError(null);
    
    try {
      console.log(`[SSE] Attempting to connect to ${url}`);
      eventSourceRef.current = new EventSource(url, { withCredentials: true });
      const eventSource = eventSourceRef.current;

      // Connection timeout
      connectionTimeoutRef.current = setTimeout(() => {
        if (!isConnected() && eventSourceRef.current) {
          console.error('[SSE] Connection timeout');
          eventSourceRef.current.close();
          eventSourceRef.current = null;
          setError(new Error('Connection timeout'));
          attemptReconnect();
        }
      }, CONNECTION_TIMEOUT);

      eventSource.onopen = () => {
        console.log('[SSE] Connection opened');
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        setError(null);
      };

      eventSource.onerror = (event: Event) => {
        console.error('[SSE] Connection error:', event);
        if (!isMountedRef.current) return;
        
        setIsConnected(false);
        setError(new Error('SSE connection error'));
        cleanup();
        
        attemptReconnect();
      };

      // Handle custom events
      eventSource.addEventListener('basePoint:created', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          handleMessage({ type: 'basePoint:created', ...data });
        } catch (err) {
          console.error('Error handling basePoint:created event:', err);
        }
      });

      eventSource.addEventListener('basePoint:updated', (e: MessageEvent) => {
        try {
          console.log('[SSE] Received basePoint:updated raw event:', e);
          const data = JSON.parse(e.data);
          console.log('[SSE] Parsed basePoint:updated data:', data);
          
          // Extract the point data from the basePoint property if it exists
          const pointData = data.basePoint || data;
          const message = { 
            type: 'basePoint:updated', 
            point: pointData,
            ...data 
          };
          
          console.log('[SSE] Dispatching to handleMessage:', message);
          handleMessage(message);
        } catch (err) {
          console.error('Error handling basePoint:updated event:', err);
        }
      });

      eventSource.addEventListener('basePoint:deleted', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          handleMessage({ type: 'basePoint:deleted', ...data });
        } catch (err) {
          console.error('Error handling basePoint:deleted event:', err);
        }
      });

      // Handle generic messages
      eventSource.onmessage = (event: MessageEvent) => {
        try {
          const message = JSON.parse(event.data);
          handleMessage(message);
        } catch (err) {
          console.error('Error parsing SSE message:', err);
        }
      };

    } catch (err) {
      console.error('Error creating SSE connection:', err);
      setError(err instanceof Error ? err : new Error('Failed to create SSE connection'));
      attemptReconnect();
    }
  };

  // Initialize connection
  connect();

  // Cleanup on unmount
  onCleanup(() => {
    isMountedRef.current = false;
    cleanup();
  });

  // Reconnect function
  const reconnect = () => {
    reconnectAttemptsRef.current = 0;
    connect();
  };

  return {
    isConnected,
    error,
    totalBasePoints,
    notifications,
    addedCount,
    deletedCount,
    reconnect
  };
};
