import { EventEmitter } from 'events';

export type BasePointEventType = 'basePointAdded' | 'basePointUpdated' | 'basePointRemoved';

export interface BasePoint {
  x: number;
  y: number;
  // Add other properties as needed
}

export const basePointEvents = new EventEmitter();

// Optional: Add type definitions for the events
declare global {
  interface BasePointEvent {
    x: number;
    y: number;
  }
}

export default basePointEvents;
