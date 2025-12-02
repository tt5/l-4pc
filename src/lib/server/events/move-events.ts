import { EventEmitter } from 'events';
import type { Move } from '~/types/board';

interface Client {
  send: (data: string) => void;
  userId: string;
  ip?: string;
  connectedAt?: string;
  [key: string]: any;
}

/**
 * Service for managing move related events
 */
export class MoveEventService {
  private static instance: MoveEventService;
  private eventEmitter: EventEmitter;
  private clients: Map<string, { client: Client; cleanup: () => void }> = new Map();

  private constructor() {
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.setMaxListeners(50);
  }

  public static getInstance(): MoveEventService {
    if (!MoveEventService.instance) {
      MoveEventService.instance = new MoveEventService();
    }
    return MoveEventService.instance;
  }

  public registerClient(client: Client): { id: string; cleanup: () => void } {
    const clientId = this.getClientId(client);
    
    const cleanup = () => {
      this.clients.delete(clientId);
    };
    
    this.clients.set(clientId, { client, cleanup });
    return { id: clientId, cleanup };
  }

  private getClientId(client: Client): string {
    if ((client as any).__clientId) {
      return (client as any).__clientId;
    }
    
    const clientId = `${client.userId}@${client.ip || 'unknown'}-${Date.now()}`;
    (client as any).__clientId = clientId;
    return clientId;
  }

  public unregisterClient(client: Client): number {
    let cleanedUpCount = 0;
    
    if ((client as any).__clientId) {
      const clientId = (client as any).__clientId;
      const entry = this.clients.get(clientId);
      if (entry) {
        entry.cleanup();
        cleanedUpCount++;
      }
    }
    
    return cleanedUpCount;
  }

  public broadcast(event: string, data: any): void {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    
    for (const [id, { client }] of Array.from(this.clients.entries())) {
      if (!this.clients.has(id)) continue;
      
      try {
        client.send(message);
      } catch (error) {
        console.error(`[MoveEventService] Error sending to client ${client.userId}:`, error);
      }
    }
  }

  public emitMoveMade(move: Move): void {
    this.broadcast('move:made', {
      type: 'move:made',
      move: {
        id: move.id,
        basePointId: move.basePointId,
        from: move.from,
        to: move.to,
        playerId: move.playerId,
        timestamp: move.timestamp,
        color: move.color
      }
    });
  }

  public onMoveMade(listener: (move: Move) => void): void {
    this.eventEmitter.on('move:made', listener);
  }

  public offMoveMade(listener: (move: Move) => void): void {
    this.eventEmitter.off('move:made', listener);
  }
}

export const moveEventService = MoveEventService.getInstance();
