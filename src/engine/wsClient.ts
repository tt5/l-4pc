import { createSignal, onCleanup } from 'solid-js';

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
            // Extract best move from PV if bestMove is null
            const pv = data.data?.pv || [];
            const bestMove = data.data?.bestMove || (pv.length > 0 ? pv[0] : null);
            
            console.log('Engine: Analysis Update', {
              depth: data.data?.depth,
              score: data.data?.score,
              bestMove: bestMove || 'No move found',
              pv: pv.join(' ') || 'No principal variation'
            });

            // Update analysis with the extracted best move
            setAnalysis({
              ...data.data,
              bestMove: bestMove
            });
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
  
  const startAnalysis = (fen: string) => {
    // Don't resend the same FEN
    if (fen === lastFen) {
      console.log('Engine: FEN unchanged, skipping analysis request');
      return false;
    }
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error('Engine: WebSocket not connected');
      return false;
    }
    
    try {
      console.log('Engine: Starting analysis for new FEN');
      lastFen = fen; // Update the last sent FEN
      ws.send(JSON.stringify({
        type: 'startAnalysis',
        data: { fen }
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
  
  const updatePosition = (fen: string) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    ws.send(JSON.stringify({
      type: 'updatePosition',
      data: { fen }
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
  
  onCleanup(() => {
    disconnect();
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
    updatePosition
  };
}

export type EngineClient = ReturnType<typeof createEngineClient>;
