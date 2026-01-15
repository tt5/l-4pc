import { WebSocketServer } from 'ws';
import { UCIEngine } from './uciWrapper';

export function createEngineWebSocketServer(port: number = 8080) {
  const wss = new WebSocketServer({ port });
  let engine: UCIEngine | null = null;
  let isInitialized = false;
  let isEngineRunning = false;

  async function initialize() {
    if (isInitialized && engine) return true;
    
    console.log('Initializing engine...');
    try {
      engine = new UCIEngine();
      await engine.init();
      isInitialized = true;
      isEngineRunning = true;
      console.log('Engine initialized and running');
      return true;
    } catch (error) {
      console.error('Failed to initialize engine:', error);
      engine = null;
      isInitialized = false;
      isEngineRunning = false;
      throw error;
    }
  }
  
  function stopEngine() {
    if (!engine) return true;
    
    console.log('Stopping engine...');
    try {
      engine.quit();
      return true;
    } catch (error) {
      console.error('Error stopping engine:', error);
      return false;
    } finally {
      engine = null;
      isInitialized = false;
      isEngineRunning = false;
    }
  }

  // Helper function to send engine status
  function sendEngineStatus(ws: any) {
    ws.send(JSON.stringify({
      type: 'engineStatus',
      data: { running: isEngineRunning }
    }));
  }

  wss.on('connection', (ws) => {
    console.log('New client connected');
    
    // Send current status on connection
    sendEngineStatus(ws);

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
            
            // Only proceed if engine is properly initialized
            if (engine) {
              // Stop any ongoing analysis first
              engine.stopInfiniteAnalysis();
              
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
            } else {
              console.error('Failed to initialize engine');
              ws.send(JSON.stringify({
                type: 'error',
                data: 'Failed to initialize chess engine'
              }));
            }
            break;

          case 'updatePosition':
            const initialized = await initialize();
            if (!initialized || !engine) {
              console.error('Failed to initialize engine');
              return;
            }
            
            engine.stopInfiniteAnalysis();
            
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
            if (!engine) {
              throw new Error('Failed to initialize engine');
            }
            engine.setPosition({
              fen: 'startpos',
              moves: [...(data.moveHistory || []), data.move]
            });
            break;

          case 'stopAnalysis':
            if (engine) {
              engine.stop();
            }
            break;
            
          case 'startEngine':
            try {
              const started = await initialize();
              ws.send(JSON.stringify({
                type: 'engineStatus',
                data: { running: isEngineRunning, success: started }
              }));
            } catch (error) {
              ws.send(JSON.stringify({
                type: 'error',
                error: 'Failed to start engine: ' + (error instanceof Error ? error.message : 'Unknown error')
              }));
            }
            break;
            
          case 'stopEngine':
            const stopped = stopEngine();
            ws.send(JSON.stringify({
              type: 'engineStatus',
              data: { running: false, success: stopped }
            }));
            break;
            
          case 'getEngineStatus':
            sendEngineStatus(ws);
            break;
            
          case 'setThreads':
            console.log('Received setThreads message with data:', data);
            if (!engine) {
              const errorMsg = 'Engine not initialized';
              console.error(errorMsg);
              ws.send(JSON.stringify({
                type: 'error',
                data: { message: errorMsg }
              }));
              break;
            }
            if (typeof data.threads === 'number' && data.threads > 0) {
              console.log(`Setting thread count to: ${data.threads}`);
              try {
                // First stop any ongoing analysis
                engine.stopInfiniteAnalysis();
                // Then update the thread count
                engine.setThreads(data.threads);
                console.log('Thread count updated, sending confirmation');
                ws.send(JSON.stringify({
                  type: 'threadsUpdated',
                  data: { threadCount: data.threads }
                }));
              } catch (error) {
                console.error('Error updating thread count:', error);
                ws.send(JSON.stringify({
                  type: 'error',
                  data: { message: 'Failed to update thread count' }
                }));
              }
            } else {
              const errorMsg = `Invalid thread count: ${data.threads}`;
              console.error(errorMsg);
              ws.send(JSON.stringify({
                type: 'error',
                data: { message: errorMsg }
              }));
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
      // Don't stop the engine on client disconnect
      // Let explicit stop command handle it
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
