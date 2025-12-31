import { WebSocketServer } from 'ws';
import { UCIEngine } from './uciWrapper';

export function createEngineWebSocketServer(port: number = 8080) {
  const wss = new WebSocketServer({ port });
  const engine = new UCIEngine();
  let isInitialized = false;

  async function initialize() {
    if (!isInitialized) {
      console.log('Initializing engine...');
      await engine.init();
      isInitialized = true;
      console.log('Engine initialized');
    }
  }

  wss.on('connection', (ws) => {
    console.log('New client connected');

    // Handle incoming messages
    ws.on('message', async (message) => {
      try {
        const { type, data } = JSON.parse(message.toString());
        
        // Ensure FEN is completely removed from analysis data
        if (data && type === 'startAnalysis') {
          delete data.fen;
        }
        
        console.log('Received message:', type, data);

        switch (type) {
          case 'startAnalysis':
            await initialize();
            // Stop any ongoing analysis first
            if (engine) {
              engine.stopInfiniteAnalysis();
            }
            
            // Set up analysis update handler
            engine.onAnalysisUpdate = (analysis) => {
              ws.send(JSON.stringify({
                type: 'analysisUpdate',
                data: analysis
              }));
            };
            
            // Set the position using move history if available
            if (data.moveHistory && data.moveHistory.length > 0) {
              engine.setPosition({
                fen: 'startpos',
                moves: data.moveHistory
              });
            } else {
              engine.setPosition('startpos');
            }
            engine.startInfiniteAnalysis();
            break;

          case 'updatePosition':
            await initialize();
            if (engine) {
              engine.stopInfiniteAnalysis();
            }
            
            // Set the position using move history if available
            if (data.moveHistory && data.moveHistory.length > 0) {
              engine.setPosition({
                fen: 'startpos',
                moves: data.moveHistory
              });
            } else {
              engine.setPosition('startpos');
            }
            engine.startInfiniteAnalysis();
            break;

          case 'makeMove':
            await initialize();
            engine.setPosition({
              fen: 'startpos',
              moves: [...(data.moveHistory || []), data.move]
            });
            break;

          case 'stopAnalysis':
            engine.stop();
            break;
            
          case 'setThreads':
            console.log('Received setThreads message with data:', data);
            if (typeof data.threads === 'number' && data.threads > 0) {
              console.log(`Setting thread count to: ${data.threads}`);
              engine.setThreads(data.threads);
              console.log('Thread count updated, sending confirmation');
              ws.send(JSON.stringify({
                type: 'threadsUpdated',
                data: { threadCount: data.threadCount }
              }));
            } else {
              const errorMsg = `Invalid thread count: ${data.threadCount}`;
              console.error(errorMsg);
              throw new Error(errorMsg);
            }
            break;
        }
      } catch (error) {
        console.error('Error handling message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        }));
      }
    });

    ws.on('close', () => {
      console.log('Client disconnected');
      engine.stop();
    });
  });

  console.log(`WebSocket server running on ws://localhost:${port}`);
  return wss;
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
  createEngineWebSocketServer(port);
}
