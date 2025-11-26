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
  oldestPrimeTimestamp?: number;
  message?: string;
  [key: string]: any;
};

export const useSSE = (url: string) => {
  const [totalBasePoints, setTotalBasePoints] = createSignal<number | null>(null);
  const [oldestPrimeTimestamp, setOldestPrimeTimestamp] = createSignal<number | null>(null);
  const [notifications, setNotifications] = createSignal<Notification[]>([]);
  const [addedCount, setAddedCount] = createSignal(0);
  const [deletedCount, setDeletedCount] = createSignal(0);
  const [oldestPrimeNotification, setOldestPrimeNotification] = createSignal<Notification | null>(null);
  const [isConnected, setIsConnected] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);

  // Reconnection state
  const MAX_RECONNECT_ATTEMPTS = 5;
  const INITIAL_RECONNECT_DELAY = 1000;
  const CONNECTION_TIMEOUT = 5000;
  
  let eventSource: EventSource | null = null;
  let reconnectAttempts = 0;
  let reconnectTimeout: NodeJS.Timeout | null = null;
  let connectionTimeout: NodeJS.Timeout | null = null;
  let isMounted = true;

  const cleanup = () => {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    if (connectionTimeout) clearTimeout(connectionTimeout);
  };

  const connect = () => {
    if (!isMounted) return;

    cleanup();
    
    setError(null);
    eventSource = new EventSource(url);

    // Connection timeout
    connectionTimeout = setTimeout(() => {
      if (!isConnected() && eventSource) {
        eventSource.close();
        handleError(new Error('Connection timeout'));
      }
    }, CONNECTION_TIMEOUT);

    eventSource.onopen = () => {
      if (connectionTimeout) clearTimeout(connectionTimeout);
      setIsConnected(true);
      reconnectAttempts = 0;
    };

    eventSource.onmessage = (event) => handleMessage(event);

    eventSource.onerror = (event) => {
      console.error('[SSE] Error:', event);
      handleError(new Error('SSE connection error'));
    };
  };

  const handleError = (err: Error) => {
    if (!isMounted) return;
    
    setError(err);
    setIsConnected(false);
    cleanup();
    
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.min(INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts), 30000);
      reconnectAttempts++;
      reconnectTimeout = setTimeout(() => connect(), delay);
    } else {
      console.error('[SSE] Max reconnection attempts reached');
    }
  };

  const handleMessage = (event: MessageEvent) => {
    if (!event.data?.trim()) return;

    try {
      const message: SSEMessage = event.data.startsWith('{') 
        ? JSON.parse(event.data)
        : { type: event.type, ...JSON.parse(event.data) };

      // Handle base point changes
      if (message.type === 'basePointChanged' || message.event === 'basePointChanged' ||
          message.type === 'basePointDeleted' || message.event === 'basePointDeleted') {
        const pointData = message.point || message;
        if (!pointData) return;

        const isDeletion = message.type === 'basePointDeleted' || message.event === 'basePointDeleted';
        const count = message.count || 1;

        if (isDeletion) {
          setDeletedCount(prev => prev + count);
        } else {
          setAddedCount(prev => prev + count);
        }

        const notification: Notification = {
          id: pointData.id || Date.now(),
          message: isDeletion 
            ? `Removed ${count} base point${count > 1 ? 's' : ''} at (${pointData.x}, ${pointData.y})`
            : `Added ${count} base point${count > 1 ? 's' : ''} at (${pointData.x}, ${pointData.y})`,
          timestamp: pointData.timestamp || Date.now(),
          userId: pointData.userId,
          count
        };

        setNotifications(prev => [notification, ...prev].slice(0, 50));
      }

      // Handle cleanup events
      if (message.type === 'cleanup' || message.event === 'cleanup') {
        if (message.totalBasePoints !== undefined || message.initialCount !== undefined) {
          setTotalBasePoints(message.initialCount ?? message.totalBasePoints ?? null);
        }
        if (message.oldestPrimeTimestamp !== undefined) {
          setOldestPrimeTimestamp(message.oldestPrimeTimestamp);
        }
      }
    } catch (err) {
      console.error('[SSE] Error processing message:', err);
    }
  };

  // Initialize connection
  connect();

  // Cleanup on unmount
  onCleanup(() => {
    isMounted = false;
    cleanup();
  });

  return {
    isConnected,
    error,
    totalBasePoints,
    oldestPrimeTimestamp,
    notifications,
    addedCount,
    deletedCount,
    oldestPrimeNotification,
    reconnect: () => {
      reconnectAttempts = 0;
      connect();
    }
  };
};
