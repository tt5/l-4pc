import { createSignal, onCleanup } from 'solid-js';

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
let wsInstance: ReturnType<typeof createEngineClient> | null = null;

// Track if the page is being reloaded
let pageIsReloading = false;

// Set up beforeunload handler to detect page reloads
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    pageIsReloading = true;
  });
}

export function getEngineClient() {
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

function createEngineClient() {
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
  
  const connect = (url: string = 'ws://localhost:8080'): Promise<boolean> => {
    return new Promise((resolve) => {
      // If we're in the middle of a page reload, don't attempt to reconnect
      if (pageIsReloading) {
        console.log('[wsClient] Page is reloading, skipping connection attempt');
        resolve(false);
        return;
      }

      // Clear any pending reconnection attempts
      if (reconnectTimeout !== null) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }

      // Close existing connection if any
      if (ws) {
        try {
          ws.close();
        } catch (e) {
          console.warn('[wsClient] Error closing existing connection:', e);
        }
      }

      console.log(`[wsClient] Connecting to engine server at ${url}...`);
      ws = new WebSocket(url);
      
      // Set up connection timeout
      const connectionTimeout = setTimeout(() => {
        if (ws && ws.readyState !== WebSocket.OPEN) {
          console.error('[wsClient] Connection timeout');
          ws.close();
          handleReconnect(url, resolve);
        }
      }, 5000); // 5 second connection timeout
      
      ws.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log('[wsClient] Connected to engine server');
        
        // Only update state if we weren't already connected
        if (!isConnected()) {
          setIsConnected(true);
          emit('connected', null);
        }
        
        reconnectAttempts = 0; // Reset reconnect attempts on successful connection
        
        // If we have a last known FEN, send it to the server
        if (lastFen) {
          updatePosition(lastFen);
        }
        
        // Request engine status on connect
        ws?.send(JSON.stringify({ type: 'getEngineStatus' }));
        
        // Resolve the connection promise
        if (resolve) {
          resolve(true);
          // Clear the resolve function to prevent multiple resolves
          resolve = null as any;
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
        
        // Only update state if we're still connected
        if (isConnected()) {
          setIsConnected(false);
          emit('disconnected', { code: event.code, reason: event.reason });
        } else if (reconnectTimeout === null && !pageIsReloading) {
          // If we're not connected and not already reconnecting, and not reloading
          emit('connectionLost', { code: event.code, reason: event.reason });
        }
        
        // Don't attempt to reconnect if this was a normal closure or page is reloading
        if (event.code === 1000 || pageIsReloading) {
          console.log(`[wsClient] ${pageIsReloading ? 'Page is reloading' : 'Normal closure'}, not reconnecting`);
          if (resolve) {
            resolve(false);
            resolve = null as any;
          }
          return;
        }
        
        // Only attempt to reconnect if we're not already in a reconnection attempt
        if (!reconnectTimeout) {
          handleReconnect(url, (success) => {
            if (resolve) {
              resolve(success);
              resolve = null as any;
            }
          });
        } else if (resolve) {
          resolve(false);
          resolve = null as any;
        }
      };
      
    });
  };
  
  // Helper function to handle reconnection with exponential backoff
  const handleReconnect = (url: string, resolve: (value: boolean) => void) => {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      const error = new Error('Max reconnection attempts reached');
      console.error('[wsClient]', error);
      setError(error);
      emit('error', error);
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
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          handleReconnect(url, resolve);
        } else {
          const error = new Error('Max reconnection attempts reached');
          console.error('[wsClient]', error);
          setError(error);
          emit('error', error);
          resolve(false);
        }
      }
    }, delay);
  };
  
  const disconnect = () => {
    // Clear any pending reconnection attempts
    if (reconnectTimeout !== null) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    
    // Reset reconnect attempts
    reconnectAttempts = 0;
    
    // Close the connection if it exists
    if (ws) {
      ws.close(1000, 'Client disconnected');
      ws = null;
    }
    
    setIsConnected(false);
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
  
  const stopAnalysis = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.log('Engine: Not connected, cannot stop analysis');
      return false;
    }
    try {
      console.log('Engine: Stopping analysis');
      ws.send(JSON.stringify({ type: 'stopAnalysis' }));
      return true;
    } catch (error) {
      console.error('Engine: Failed to stop analysis:', error);
      return false;
    }
  };
  
  const makeMove = (fen: string, move: string, moveHistory: string[] = []) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    ws.send(JSON.stringify({
      type: 'makeMove',
      data: { fen, move, moveHistory }
    }));
  };
  
  const updatePosition = (fen: string, moveHistory: string[] = []) => {
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

  const emit = (event: string, ...args: any[]) => {
    if (!events[event]) return;
    for (const callback of [...events[event]]) {
      try {
        callback(...args);
      } catch (err) {
        console.error(`Error in event handler for '${event}':`, err);
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

  return {
    isConnected,
    analysis,
    error,
    connect,
    disconnect,
    startAnalysis,
    stopAnalysis,
    makeMove,
    updatePosition,
    setThreads,
    on,
    off,
    emit
  };
}

export type EngineClient = ReturnType<typeof createEngineClient>;
