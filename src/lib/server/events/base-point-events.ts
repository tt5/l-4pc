import { EventEmitter } from 'events';
import { BasePoint } from '~/types/board';

type BasePointEvent = 'created' | 'updated' | 'deleted' | 'worldReset';
interface Client {
  send: (data: string) => void;
  userId: string;
  ip?: string;
  connectedAt?: string;
  [key: string]: any; // Allow additional properties
};

/**
 * Service for managing base point related events
 * Uses the singleton pattern to ensure a single event bus across the application
 */
export class BasePointEventService {
  private static instance: BasePointEventService;
  private eventEmitter: EventEmitter;
  private clients: Map<string, { client: Client; cleanup: () => void }> = new Map(); // Store client with cleanup function

  private constructor() {
    this.eventEmitter = new EventEmitter();
    // Increase max listeners for high-volume applications
    this.eventEmitter.setMaxListeners(50);
  }

  /**
   * Get the singleton instance of the service
   */
  public static getInstance(): BasePointEventService {
    if (!BasePointEventService.instance) {
      BasePointEventService.instance = new BasePointEventService();
    }
    return BasePointEventService.instance;
  }

  /**
   * Subscribe to base point events
   * @param event - The event type to listen for
   * @param listener - Callback function to handle the event
   */
  public on(event: BasePointEvent, listener: (point: BasePoint) => void): void {
    this.eventEmitter.on(event, listener);
  }

  /**
   * Unsubscribe from base point events
   * @param event - The event type to stop listening to
   * @param listener - The callback function to remove
   */
  public off(event: BasePointEvent, listener: (point: BasePoint) => void): void {
    this.eventEmitter.off(event, listener);
  }

  /**
   * Register a new client connection
   * @param client - The client connection
   */
  /**
   * Generate a unique client ID based on user ID and IP
   */
  private getClientId(client: Client): string {
    // Use a stable ID based on user ID and IP
    // If the client already has an ID (from a previous connection), use that
    if ((client as any).__clientId) {
      return (client as any).__clientId;
    }
    
    // Otherwise generate a new stable ID
    const clientId = `${client.userId}@${client.ip || 'unknown'}-${Date.now()}`;
    (client as any).__clientId = clientId;
    return clientId;
  }

  public registerClient(client: Client): { id: string; cleanup: () => void } {
    const clientId = this.getClientId(client);
    
    // Cleanup function to unregister this client
    const cleanup = () => {
      if (this.clients.delete(clientId)) {
      }
    };
    
    // Store client with its cleanup function
    this.clients.set(clientId, { client, cleanup });
    
    // Return the cleanup function to the caller
    return { id: clientId, cleanup };
  }

  /**
   * Unregister a client connection
   * @param client - The client connection to remove
   */
  public unregisterClient(client: Client): number {
    let cleanedUpCount = 0;
    
    // If client has an ID, use that for direct lookup
    if ((client as any).__clientId) {
      const clientId = (client as any).__clientId;
      const entry = this.clients.get(clientId);
      if (entry) {
        entry.cleanup();
        cleanedUpCount++;
      }
    }
    
    // Fallback: Find by user ID and IP if no ID is set or if direct lookup failed
    const clientKey = `${client.userId}@${client.ip || 'unknown'}`;
    const matchingClients = Array.from(this.clients.entries())
      .filter(([id]) => id.startsWith(clientKey));
    
    for (const [id, entry] of matchingClients) {
      entry.cleanup();
      cleanedUpCount++;
    }
    
    if (cleanedUpCount === 0) {
    } else {
    }
    
    return cleanedUpCount;
  }

  /**
   * Broadcast a message to all connected clients
   * @param event - The event type
   * @param data - The data to send
   */
  public broadcast(event: string, data: any): void {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    
    // Create a copy of clients to avoid modification during iteration
    const clients = Array.from(this.clients.entries());
    
    for (const [id, { client }] of clients) {
      if (!this.clients.has(id)) {
        continue; // Skip if client was removed during iteration
      }
      try {
        
        client.send(message);
      } catch (error) {
        console.error(`[EventService] Error sending to client ${client.userId}:`, error);
      }
    }
  }

  /**
   * Emit a base point created event
   * @param point - The created base point
   */
  public emitCreated(point: BasePoint): void {
    this.eventEmitter.emit('created', point);
    this.broadcast('created', {
      type: 'basePointChanged',
      event: 'created',
      point: {
        id: point.id,
        x: point.x,
        y: point.y,
        userId: point.userId,
        timestamp: point.createdAtMs || Date.now()
      }
    });
  }

  /**
   * Emit a base point updated event
   * @param point - The updated base point
   */
  public emitUpdated(point: BasePoint): void {
    this.eventEmitter.emit('updated', point);
    this.broadcast('updated', {
      type: 'basePointChanged',
      event: 'updated',
      point: {
        id: point.id,
        x: point.x,
        y: point.y,
        userId: point.userId,
        timestamp: point.createdAtMs || Date.now()
      }
    });
  }

  /**
   * Emit a base point deleted event
   * @param point - The deleted base point
   */
  public emitDeleted(point: BasePoint): void {
    this.eventEmitter.emit('deleted', point);
    const count = (point as any).count || 1;
    this.broadcast('basePointDeleted', {
      type: 'basePointDeleted',
      event: 'basePointDeleted',
      point: {
        id: point.id,
        x: point.x,
        y: point.y,
        userId: point.userId,
        timestamp: Date.now()
      },
      count: count // Include the count at the root level for easier access in the UI
    });
  }

  /**
   * Get all listeners for a specific event (for testing/debugging)
   */
  public getListeners(event: BasePointEvent): Function[] {
    return this.eventEmitter.listeners(event);
  }

  /**
   * Get all connected clients (for debugging)
   */
  public getClients(): Array<Client & { clientId: string }> {
    return Array.from(this.clients.entries()).map(([clientId, entry]) => ({
      ...entry.client,
      clientId // Include the internal client ID for debugging
    }));
  }
  
  /**
   * Get connection stats (for debugging)
   */
  public getConnectionStats() {
    const clients = this.getClients();
    const stats = {
      total: clients.length,
      byUser: clients.reduce((acc, client) => {
        acc[client.userId] = (acc[client.userId] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      connections: clients.map(c => ({
        userId: c.userId,
        ip: c.ip,
        clientId: (c as any).__clientId || 'none',
        connectedAt: c.connectedAt
      }))
    };
    
    return stats;
  }
}

// Export a singleton instance
export const basePointEventService = BasePointEventService.getInstance();
