import { createSignal, onCleanup, onMount } from 'solid-js';

interface EngineAnalysisProps {
  onBestMove?: (move: string) => void;
}

export function EngineAnalysis(props: EngineAnalysisProps) {
  const [bestMove, setBestMove] = createSignal<string>('');
  const [depth, setDepth] = createSignal<number>(0);
  const [score, setScore] = createSignal<number>(0);
  const [pv, setPv] = createSignal<string[]>([]);
  const [ws, setWs] = createSignal<WebSocket | null>(null);
  const [isConnected, setIsConnected] = createSignal<boolean>(false);

  // Connect to WebSocket server
  onMount(() => {
    const socket = new WebSocket('ws://localhost:8080');
    setWs(socket);

    socket.onopen = () => {
      console.log('Connected to engine server');
      setIsConnected(true);
      startAnalysis('startpos');
    };

    socket.onmessage = (event) => {
      const { type, data } = JSON.parse(event.data);
      
      if (type === 'analysisUpdate') {
        setBestMove(data.bestMove || '');
        setDepth(data.depth);
        setScore(data.score);
        setPv(data.pv || []);
        
        if (data.bestMove && props.onBestMove) {
          props.onBestMove(data.bestMove);
        }
      }
    };

    socket.onclose = () => {
      console.log('Disconnected from engine server');
      setIsConnected(false);
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      socket.close();
    };
  });

  // Start analysis with a new position
  function startAnalysis(fen: string) {
    ws()?.send(JSON.stringify({
      type: 'startAnalysis',
      data: { fen }
    }));
  }

  // Update the engine's position
  function updatePosition(fen: string) {
    ws()?.send(JSON.stringify({
      type: 'updatePosition',
      data: { fen }
    }));
  }

  // Make a move and update the position
  function makeMove(move: string, currentFen: string, moveHistory: string[] = []) {
    ws()?.send(JSON.stringify({
      type: 'makeMove',
      data: {
        fen: currentFen,
        move,
        moveHistory
      }
    }));
  }

  // Clean up on unmount
  onCleanup(() => {
    ws()?.send(JSON.stringify({ type: 'stopAnalysis' }));
    ws()?.close();
  });

  return (
    <div class="engine-analysis">
      <h3>Engine Analysis</h3>
      <div>Status: {isConnected() ? 'Connected' : 'Disconnected'}</div>
      <div>Best Move: {bestMove() || 'None'}</div>
      <div>Depth: {depth()}</div>
      <div>Evaluation: {score() > 0 ? `+${score()}` : score()}</div>
      <div>PV: {pv().join(' ')}</div>
    </div>
  );
}
