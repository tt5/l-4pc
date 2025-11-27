import { EventEmitter } from 'events';
import { withAuth } from '~/middleware/auth';
import { basePointEventService } from '~/lib/server/events/base-point-events';
import { getBasePointRepository } from '~/lib/server/db';

// Store connected clients
const clients = new Map<string, { response: Response; cleanup: () => void }>();

// Handle SSE connections
export const GET = withAuth(async ({ request, user }) => {
  // Create a stream for the response
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  // Set up SSE headers
  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Create a response with the stream
  const response = new Response(stream.readable, { headers });

  // Send initial connection message
  const sendMessage = (data: any, event?: string) => {
    let message = '';
    if (event) {
      message += `event: ${event}\n`;
    }
    message += `data: ${JSON.stringify(data)}\n\n`;
    writer.write(encoder.encode(message)).catch(() => {});
  };

  // Send initial data
  try {
    const repository = await getBasePointRepository();
    const totalBasePoints = await repository.getTotalCount();
    sendMessage({ type: 'init', totalBasePoints }, 'init');
  } catch (error) {
    console.error('Error sending initial data:', error);
  }

  // Handle base point events
  const handleBasePointCreated = (basePoint: any) => {
    sendMessage({ type: 'basePoint:created', basePoint }, 'basePoint:created');
  };

  const handleBasePointUpdated = (basePoint: any) => {
    sendMessage({ type: 'basePoint:updated', basePoint }, 'basePoint:updated');
  };

  const handleBasePointDeleted = (basePoint: any) => {
    sendMessage({ type: 'basePoint:deleted', basePoint }, 'basePoint:deleted');
  };

  // Subscribe to events
  basePointEventService.on('created', handleBasePointCreated);
  basePointEventService.on('updated', handleBasePointUpdated);
  basePointEventService.on('deleted', handleBasePointDeleted);

  // Handle client disconnect
  const cleanup = () => {
    basePointEventService.off('created', handleBasePointCreated);
    basePointEventService.off('updated', handleBasePointUpdated);
    basePointEventService.off('deleted', handleBasePointDeleted);
    writer.close().catch(() => {});
  };

  // Store the client
  clients.set(user.userId, { response, cleanup });

  // Handle client disconnect
  request.signal.addEventListener('abort', () => {
    cleanup();
    clients.delete(user.userId);
  });

  return response;
});

// Function to broadcast a message to all connected clients
export function broadcastMessage(data: any, event?: string) {
  const message = event ? `event: ${event}\ndata: ${JSON.stringify(data)}\n\n` : `data: ${JSON.stringify(data)}\n\n`;
  
  clients.forEach(({ response }) => {
    const writer = (response as any).writer;
    if (writer) {
      writer.write(new TextEncoder().encode(message)).catch(() => {});
    }
  });
}
