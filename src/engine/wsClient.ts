import { createSignal, onCleanup } from 'solid-js';

type EventCallback = (...args: any[]) => void;
type EventMap = {
  [event: string]: EventCallback[];
};

type AnalysisUpdate = {
  depth: number;
  score: number;
  pv: string[];
  bestMove: string | null;
};

export function createEngineClient() {
  const [isConnected, setIsConnected] = createSignal(false);
  const [analysis, setAnalysis] = createSignal<AnalysisUpdate | null>(null);
  const [error, setError] = createSignal<Error | null>(null);
  
  let ws: WebSocket | null = null;
  let lastFen: string | null = null; // Track the last sent FEN
  const events: EventMap = {}; // Store event listeners
  
  const connect = (url: string = 'ws://localhost:8080') => {
    try {
      ws = new WebSocket(url);
      
      ws.onopen = () => {
        console.log('Connected to engine server');
        setIsConnected(true);
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
              bestMove: bestMove
            };
            setAnalysis(analysisData);
            
            // Emit bestmove event with the best move
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
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setError(new Error('Failed to connect to engine server'));
      };
      
      ws.onclose = () => {
        console.log('Disconnected from engine server');
        setIsConnected(false);
      };
      
    } catch (err) {
      console.error('Failed to connect to engine server:', err);
      setError(err instanceof Error ? err : new Error('Failed to connect to engine server'));
    }
  };
  
  const startAnalysis = (fen: string, moveHistory: string[] = []) => {
    // Don't resend the same FEN and move history
    const currentState = JSON.stringify({ fen, moveHistory });
    if (currentState === lastFen) {
      return false;
    }
    
    console.log('Starting analysis for FEN:', fen, 'with moves:', moveHistory);
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error('Engine: WebSocket not connected');
      return false;
    }
    
    try {
      lastFen = currentState; // Update the last sent state
      ws.send(JSON.stringify({
        type: 'startAnalysis',
        data: { 
          fen,
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
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    ws.send(JSON.stringify({
      type: 'updatePosition',
      data: { 
        fen,
        moveHistory 
      }
    }));
  };
  
  const disconnect = () => {
    if (ws) {
      stopAnalysis();
      ws.close();
      ws = null;
      setIsConnected(false);
    }
  };
  
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
    on,
    off,
    emit
  };
}

export type EngineClient = ReturnType<typeof createEngineClient>;
