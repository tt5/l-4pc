import type { APIEvent } from '@solidjs/start/server';
import { withAuth } from '../../middleware/auth';
import { basePointEventService } from '../../lib/server/events/base-point-events';
import type { TokenPayload } from '../../lib/server/auth/jwt';

interface Client {
  userId: string;
  username: string;
  ip?: string;
  connectedAt: string;
  send: (data: string) => void;
}

type SSEEvent = APIEvent & {
  user: TokenPayload;
  locals: {
    user?: TokenPayload;
    [key: string]: any;
  };
};

export const GET = withAuth(async (event: SSEEvent) => {
  const { request, clientAddress } = event;
  const user = event.user || { userId: 'anonymous', username: 'anonymous' };


  // Create a new response stream
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let isConnected = true;
      let pingInterval: NodeJS.Timeout;

      // Helper to send messages to the client
      const send = (data: string) => {
        if (!isConnected) return;
        try {
          controller.enqueue(encoder.encode(data));
        } catch (error) {
          console.error('[SSE] Error sending data:', error);
          isConnected = false;
          controller.close();
        }
      };

      // Send initial connection message
      const sendInitialMessage = () => {
        const message = `event: connected\ndata: ${JSON.stringify({
          message: 'Connection established',
          timestamp: new Date().toISOString(),
          userId: user.userId
        })}\n\n`;
        send(message);
      };

      // Set up ping interval
      const setupPing = () => {
        pingInterval = setInterval(() => {
          if (!isConnected) {
            clearInterval(pingInterval);
            return;
          }
          const pingMessage = `event: ping\ndata: ${JSON.stringify({
            type: 'ping',
            timestamp: Date.now()
          })}\n\n`;
          send(pingMessage);
        }, 30000);
      };

      // Set up the client
      const client: Client = {
        userId: user.userId,
        username: user.username,
        ip: clientAddress,
        connectedAt: new Date().toISOString(),
        send: (data: string) => {
          if (isConnected) {
            send(`data: ${data}\n\n`);
          }
        }
      };

      // Register the client
      const { cleanup } = basePointEventService.registerClient(client);

      // Initial setup
      sendInitialMessage();
      setupPing();

      // Cleanup on stream cancellation
      const cleanupAndClose = () => {
        if (!isConnected) return;
        isConnected = false;
        clearInterval(pingInterval);
        cleanup();
        controller.close();
      };

      // Handle client disconnect
      request.signal.addEventListener('abort', cleanupAndClose);

      // Cleanup on stream close
      return () => {
        cleanupAndClose();
        request.signal.removeEventListener('abort', cleanupAndClose);
      };
    }
  });

  // Return the response with proper headers
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Content-Encoding': 'none',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': 'true'
    }
  });
});
