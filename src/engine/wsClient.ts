import { createSignal, onCleanup } from 'solid-js';

// Define the engine client interface
export interface EngineClient {
  isConnected: () => boolean;
  connect: (url?: string) => Promise<boolean>;
  disconnect: () => void;
  on: (event: string, callback: EventCallback) => () => void;
  off: (event: string, callback: EventCallback) => void;
  startAnalysis: (moveHistory?: string[]) => boolean;
  stopAnalysis: () => boolean;
  stopEngine: () => boolean;
  setThreads: (threads: number) => boolean;
  updatePosition: (fen: string, moveHistory?: string[]) => void;
  makeMove: (fen: string, move: string, moveHistory: string[]) => void;
  isReady: () => boolean;
  analysis: () => AnalysisUpdate | null;
  error: () => Error | null;
}

type EventCallback = (...args: any[]) => void;
type EventMap = {
  [event: string]: EventCallback[];
};

export type AnalysisUpdate = {
  depth: number;
  score: number;
  pv: string[];
  bestMove: string | null;
};

// Singleton instance
let wsInstance: EngineClient | null = null;

// Track if the page is being reloaded
let pageIsReloading = false;

// Set up beforeunload handler to detect page reloads
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    pageIsReloading = true;
  });
}

export function getEngineClient(): EngineClient {
  if (!wsInstance) {
    wsInstance = createEngineClient();
    
    // Cleanup on unmount - only register this once
    const cleanup = () => {
      if (wsInstance?.isConnected()) {
        wsInstance.disconnect();
      }
    };
    
    // Only register cleanup if we're in a component
    if (typeof onCleanup === 'function') {
      onCleanup(cleanup);
    } else {
      console.warn('getEngineClient called outside of component. Make sure to call disconnect() manually.');
    }
  }
  return wsInstance;
}

function createEngineClient(): EngineClient {
  const [isConnected, setIsConnected] = createSignal(false);
  const [analysis, setAnalysis] = createSignal<AnalysisUpdate | null>(null);
  const [error, setError] = createSignal<Error | null>(null);
  
  let ws: WebSocket | null = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 3000; // 3 seconds
  let reconnectTimeout: number | null = null;
  let lastFen: string | null = null; // Track the last sent FEN
  const events: EventMap = {}; // Store event listeners
  let isIntentionalDisconnect = false; // Track if disconnection was intentional
  
  // Event emitter function
  const emit = (event: string, ...args: any[]): void => {
    if (events[event]) {
      events[event].forEach(callback => {
        try {
          callback(...args);
        } catch (err) {
          console.error(`[wsClient] Error in ${event} handler:`, err);
        }
      });
    }
  };
  
  // Implement all the methods required by the EngineClient interface
  const connect = (url: string = 'ws://localhost:8080'): Promise<boolean> => {
    return new Promise((resolve) => {
      // Clear any pending reconnection attempts
      if (reconnectTimeout !== null) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }

      // Close existing connection if any
      if (ws) {
        try {
          ws.close();
        } catch (err) {
          console.warn('[wsClient] Error closing existing connection:', err);
        }
        ws = null;
      }

      console.log(`[wsClient] Connecting to engine server at ${url}...`);
      
      // Set a flag to track if we've resolved the promise
      let isResolved = false;

      // Set up connection timeout
      const connectionTimeout = setTimeout(() => {
        if (ws && ws.readyState !== WebSocket.OPEN) {
          console.error('[wsClient] Connection timeout');
          ws.close();
          handleReconnect(url, resolve);
        }
      }, 5000); // 5 second connection timeout
      
      ws = new WebSocket(url);
      
      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log('[wsClient] Connected to engine server');
        
        // Update connection state and emit events
        setIsConnected(true);
        emit('connected', null);
        emit('status', { running: true });
        
        reconnectAttempts = 0; // Reset reconnect attempts on successful connection
        
        // If we have a last known FEN, send it to the server
        if (lastFen) {
          updatePosition(lastFen);
        }
        
        // Request engine status on connect
        try {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'getEngineStatus' }));
          }
        } catch (err) {
          console.error('[wsClient] Error sending getEngineStatus:', err);
        }
        
        // Resolve the connection promise if not already resolved
        if (!isResolved) {
          isResolved = true;
          resolve(true);
        }
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'analysisUpdate') {
            const pv = Array.isArray(data.data?.pv) ? data.data.pv : [];
            const pvString = pv.join(' ');
            
            // Extract the first move from PV as the best move if not explicitly provided
            let bestMove = data.data?.bestMove;
            if (!bestMove && pv.length > 0) {
              // The first move in PV is the best move
              bestMove = pv[0];
            }
            
            // Extract score from PV string if available
            const scoreMatch = pvString.match(/score (\d+)/);
            const pvScore = scoreMatch ? parseInt(scoreMatch[1], 10) : null;
            const effectiveScore = pvScore !== null ? pvScore : (data.data?.score || 0);
            const displayScore = (effectiveScore / 100).toFixed(2) + ' pawns';
            
            // Create analysis object with proper best move
            const analysisUpdate = {
              depth: data.data?.depth || 0,
              score: displayScore,
              bestMove: bestMove || null,
              pv: pvString || 'No principal variation',
              rawScore: String(effectiveScore),
              scoreSource: pvScore !== null ? 'pv' : 'data'
            };
            
            console.log('Engine: Analysis Update', analysisUpdate);

            // Update analysis with the extracted best move
            const analysisData = {
              ...data.data,
              bestMove: bestMove,
              score: displayScore,
              depth: data.data?.depth || 0,
              pv: pvString
            };
            setAnalysis(analysisData);
            
            // Emit analysis event with the full analysis data
            emit('analysis', analysisData);
            
            // Also emit bestmove event with just the best move
            if (bestMove) {
              emit('bestmove', bestMove);
            }
          } else {
            console.log('Engine: Received message', { type: data.type, data: data.data });
          }
        } catch (err) {
          console.error('Engine: Error parsing message:', err, 'Raw:', event.data);
        }
      };
      
      ws.onerror = (event) => {
        clearTimeout(connectionTimeout);
        const error = new Error(`WebSocket error: ${event.type}`);
        console.error('[wsClient]', error);
        setError(error);
        emit('error', error);
        
        // Only try to reconnect if this is not a normal closure
        if (ws) {
          ws.close();
          handleReconnect(url, resolve);
        }
      };
      
      ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        console.log(`[wsClient] Disconnected from engine server: ${event.code} ${event.reason || ''}`);
        
        // Update connection state and emit events
        const wasConnected = isConnected();
        setIsConnected(false);
        
        if (wasConnected) {
          emit('disconnected', { code: event.code, reason: event.reason });
          emit('status', { running: false });
        } else if (reconnectTimeout === null && !pageIsReloading && !isIntentionalDisconnect) {
          // If we're not connected, not already reconnecting, not reloading, and not an intentional disconnect
          emit('connectionLost', { code: event.code, reason: event.reason });
          emit('status', { running: false });
        }
        
        // Don't attempt to reconnect if this was a normal closure, page is reloading, or disconnection was intentional
        const shouldNotReconnect = event.code === 1000 || pageIsReloading || isIntentionalDisconnect;
        if (shouldNotReconnect) {
          console.log(`[wsClient] ${pageIsReloading ? 'Page is reloading' : isIntentionalDisconnect ? 'Intentional disconnect' : 'Normal closure'}, not reconnecting`);
          if (!isResolved) {
            isResolved = true;
            resolve(false);
          }
          return;
        }
        
        // Only attempt to reconnect if we're not already in a reconnection attempt
        if (!reconnectTimeout) {
          handleReconnect(url, (success) => {
            if (!isResolved) {
              isResolved = true;
              resolve(success);
            }
          });
        } else if (!isResolved) {
          isResolved = true;
          resolve(false);
        }
      };
      
    });
  };
  
  // Helper function to reset reconnection state
  const resetReconnectionState = (): void => {
    if (reconnectTimeout !== null) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    reconnectAttempts = 0;
  };

  // Helper function to handle reconnection with exponential backoff
  const handleReconnect = (url: string, resolve: (value: boolean) => void): void => {
    // If this is an intentional disconnect, don't attempt to reconnect
    if (isIntentionalDisconnect) {
      console.log('[wsClient] Not reconnecting - intentional disconnect');
      resetReconnectionState();
      resolve(false);
      return;
    }

    let isResolved = false; // Track if the promise has been resolved
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      const error = new Error('Max reconnection attempts reached');
      console.error('[wsClient]', error);
      setError(error);
      emit('error', error);
      resetReconnectionState();
      resolve(false);
      return;
    }

    const delay = Math.min(RECONNECT_DELAY * Math.pow(2, reconnectAttempts), 30000); // Max 30s delay
    reconnectAttempts++;
    
    console.log(`[wsClient] Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay}ms...`);
    
    reconnectTimeout = window.setTimeout(async () => {
      if (pageIsReloading) {
        console.log('[wsClient] Page is reloading, aborting reconnection');
        resolve(false);
        return;
      }
      
      try {
        const connected = await connect(url);
        if (connected) {
          console.log('[wsClient] Reconnection successful');
          resolve(true);
        } else if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          // Only continue reconnection if we haven't reached max attempts
          handleReconnect(url, resolve);
        } else {
          const error = new Error('Max reconnection attempts reached');
          console.error('[wsClient]', error);
          setError(error);
          emit('error', error);
          resolve(false);
        }
      } catch (err) {
        console.error('[wsClient] Reconnection attempt failed:', err);
        ws = null;
        setIsConnected(false);
        if (!isResolved) {
          isResolved = true;
          resolve(false);
        }
      }
    });
  };
  
  const startAnalysis = (moveHistory: string[] = []) => {
    // Don't resend the same move history
    const currentState = JSON.stringify(moveHistory);
    if (currentState === lastFen) {
      return false;
    }
    
    console.log('Starting analysis with moves:', moveHistory);
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error('Engine: WebSocket not connected');
      return false;
    }
    
    try {
      lastFen = currentState; // Update the last sent state
      ws.send(JSON.stringify({
        type: 'startAnalysis',
        data: { 
          moveHistory
        }
      }));
      return true;
    } catch (error) {
      console.error('Engine: Failed to send analysis request:', error);
      return false;
    }
  };
  
  const stopAnalysis = (): boolean => {
    if (!isConnected() || !ws) return false;
    
    try {
      ws.send(JSON.stringify({ 
        type: 'stopAnalysis',
        data: {}
      }));
      return true;
    } catch (err) {
      console.error('[wsClient] Error stopping analysis:', err);
      setError(err instanceof Error ? err : new Error('Failed to stop analysis'));
      return false;
    }
  };
  
  const stopEngine = (): boolean => {
    if (!isConnected() || !ws) return false;
    
    // Reset reconnection state
    resetReconnectionState();
    
    if (ws) {
      ws.close(1000, 'Client disconnected');
      ws = null;
    }
    
    setIsConnected(false);
    emit('disconnected', { code: 1000, reason: 'Client disconnected' });
    emit('status', { running: false });
    
    // Reset the flag after a short delay to handle any queued close events
    setTimeout(() => {
      isIntentionalDisconnect = false;
    }, 100);
    
    return true;
  };
  
  const makeMove = (fen: string, move: string, moveHistory: string[] = []): void => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    ws.send(JSON.stringify({
      type: 'makeMove',
      data: { fen, move, moveHistory }
    }));
  };
  
  const updatePosition = (fen: string, moveHistory: string[] = []): boolean => {
    lastFen = fen; // Update the last known FEN
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    
    try {
      ws.send(JSON.stringify({
        type: 'updatePosition',
        data: { 
          fen,
          moveHistory 
        }
      }));
      return true;
    } catch (error) {
      console.error('Failed to update position:', error);
      return false;
    }
  };

  const setThreads = (threads: number) => {
    console.log('[wsClient] setThreads called with:', threads);
    
    if (!ws) {
      console.error('[wsClient] WebSocket is not initialized');
      return false;
    }
    
    if (ws.readyState !== WebSocket.OPEN) {
      console.error(`[wsClient] WebSocket is not open. State: ${ws.readyState}`);
      return false;
    }
    
    try {
      const message = {
        type: 'setThreads',
        data: { threads }
      };
      
      console.log('[wsClient] Sending message:', message);
      ws.send(JSON.stringify(message));
      console.log('[wsClient] Message sent successfully');
      return true;
    } catch (error) {
      console.error('[wsClient] Failed to set threads:', error);
      return false;
    }
  };
  
  // disconnect function is already defined above
  
  // Event emitter methods
  const on = (event: string, callback: EventCallback) => {
    if (!events[event]) {
      events[event] = [];
    }
    events[event].push(callback);
    return () => off(event, callback);
  };

  const off = (event: string, callback: EventCallback) => {
    if (!events[event]) return;
    const index = events[event].indexOf(callback);
    if (index > -1) {
      events[event].splice(index, 1);
    }
  };

  // Disconnect function implementation
  const disconnect = (): void => {
    if (reconnectTimeout !== null) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    if (ws) {
      try {
        // Notify server we're disconnecting
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'disconnect' }));
        }
        ws.close();
      } catch (err) {
        console.error('[wsClient] Error during disconnect:', err);
      } finally {
        ws = null;
        setIsConnected(false);
        emit('disconnected');
      }
    }
  };

  // Cleanup on component unmount
  onCleanup(() => {
    disconnect();
    if (ws) {
      ws.close();
    }
  });

  // Implement isReady method
  const isReady = (): boolean => {
    return isConnected() && ws?.readyState === WebSocket.OPEN;
  };

  return {
    isConnected,
    analysis,
    error,
    connect,
    disconnect,
    startAnalysis,
    stopAnalysis,
    stopEngine,
    makeMove,
    updatePosition,
    setThreads,
    on,
    off,
    isReady
  };
}

// Export the EngineClient interface
