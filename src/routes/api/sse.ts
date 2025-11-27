import { withAuth } from '~/middleware/auth';
import { basePointEventService } from '~/lib/server/events/base-point-events';
import { getBasePointRepository } from '~/lib/server/db';

// Store connected clients
const clients = new Map<string, { 
  response: Response; 
  writer: WritableStreamDefaultWriter<Uint8Array>;
  cleanup: () => void;
}>();

// Handle SSE connections
export const GET = withAuth(async ({ request, user }) => {
  // Set up SSE headers with CORS
  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': request.headers.get('origin') || '*',
    'Access-Control-Allow-Credentials': 'true',
  });

  // Create a stream for the response
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  // Create a response with the stream
  const response = new Response(stream.readable, { headers });
  
  // Add writer to the response for broadcasting
  (response as any).writer = writer;

  // Send a message to the client
  const sendMessage = (data: any, event?: string) => {
    try {
      let message = '';
      if (event) {
        message += `event: ${event}\n`;
      }
      message += `data: ${JSON.stringify(data)}\n\n`;
      writer.write(encoder.encode(message)).catch((err) => {
        console.error('Error writing to SSE stream:', err);
      });
    } catch (err) {
      console.error('Error sending SSE message:', err);
    }
  };

  // Send initial data
  const sendInitialData = async () => {
    try {
      const repository = await getBasePointRepository();
      const totalBasePoints = await repository.getTotalCount();
      sendMessage({ 
        type: 'init', 
        totalBasePoints,
        timestamp: Date.now()
      }, 'init');
    } catch (error) {
      console.error('Error sending initial data:', error);
      sendMessage({ 
        type: 'error', 
        message: 'Failed to load initial data',
        error: error instanceof Error ? error.message : String(error)
      }, 'error');
    }
  };

  // Handle base point events
  const handleBasePointCreated = (basePoint: any) => {
    sendMessage({ 
      type: 'basePoint:created', 
      basePoint,
      timestamp: Date.now()
    }, 'basePoint:created');
  };

  const handleBasePointUpdated = (basePoint: any) => {
    sendMessage({ 
      type: 'basePoint:updated', 
      basePoint,
      timestamp: Date.now()
    }, 'basePoint:updated');
  };

  const handleBasePointDeleted = (basePoint: any) => {
    sendMessage({ 
      type: 'basePoint:deleted', 
      basePoint,
      timestamp: Date.now()
    }, 'basePoint:deleted');
  };

  // Subscribe to events
  basePointEventService.on('created', handleBasePointCreated);
  basePointEventService.off('updated', handleBasePointUpdated); // Clean up any existing listeners
  basePointEventService.on('updated', handleBasePointUpdated);
  basePointEventService.on('deleted', handleBasePointDeleted);

  // Handle client disconnect
  const cleanup = () => {
    basePointEventService.off('created', handleBasePointCreated);
    basePointEventService.off('updated', handleBasePointUpdated);
    basePointEventService.off('deleted', handleBasePointDeleted);
    
    // Close the writer if it's still open
    if (writer) {
      writer.close().catch(() => {});
    }
    
    console.log(`[SSE] Client ${user.userId} disconnected`);
  };

  // Store the client
  clients.set(user.userId, { response, writer, cleanup });
  console.log(`[SSE] New client connected: ${user.userId}, total clients: ${clients.size}`);

  // Send initial data
  sendInitialData();

  // Handle client disconnect
  const handleDisconnect = () => {
    cleanup();
    clients.delete(user.userId);
    console.log(`[SSE] Client ${user.userId} cleaned up, remaining clients: ${clients.size}`);
  };

  // Set up abort handler
  request.signal.addEventListener('abort', handleDisconnect);

  // Send a ping every 30 seconds to keep the connection alive
  const pingInterval = setInterval(() => {
    sendMessage({ type: 'ping', timestamp: Date.now() }, 'ping');
  }, 30000);

  // Clean up interval on disconnect
  request.signal.addEventListener('abort', () => {
    clearInterval(pingInterval);
  });

  return response;
});

// Function to broadcast a message to all connected clients
export function broadcastMessage(data: any, event?: string) {
  try {
    const message = event ? 
      `event: ${event}\ndata: ${JSON.stringify(data)}\n\n` : 
      `data: ${JSON.stringify(data)}\n\n`;
    
    const encoder = new TextEncoder();
    const encodedMessage = encoder.encode(message);
    
    // Clean up any disconnected clients
    const disconnectedClients: string[] = [];
    
    clients.forEach((client, userId) => {
      try {
        if (client.writer) {
          client.writer.write(encodedMessage).catch((err) => {
            console.error(`[SSE] Error writing to client ${userId}:`, err);
            disconnectedClients.push(userId);
          });
        }
      } catch (err) {
        console.error(`[SSE] Error broadcasting to client ${userId}:`, err);
        disconnectedClients.push(userId);
      }
    });
    
    // Clean up disconnected clients
    disconnectedClients.forEach(userId => {
      const client = clients.get(userId);
      if (client) {
        client.cleanup();
        clients.delete(userId);
      }
    });
    
  } catch (err) {
    console.error('[SSE] Error in broadcastMessage:', err);
  }
}
