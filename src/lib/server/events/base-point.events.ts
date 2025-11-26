import { EventEmitter } from 'events';

export const basePointEvents = new EventEmitter();

// Optional: Add type definitions for the events
declare global {
  interface BasePointEvent {
    x: number;
    y: number;
  }
}

export default basePointEvents;
