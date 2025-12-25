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
            console.log('Engine: Received analysis', {
              bestMove: data.data?.bestMove,
              depth: data.data?.depth,
              score: data.data?.score
            });
            setAnalysis(data.data);
          } else {
            console.log('Engine: Received message', data);
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
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error('Engine: WebSocket not connected');
      return false;
    }
    
    try {
      console.log('Engine: Starting analysis for FEN', fen);
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
