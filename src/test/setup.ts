import { afterEach } from 'vitest';
import { cleanup } from '@solidjs/testing-library';

// Clean up after each test
// This will unmount any mounted components and clear any mocks
afterEach(() => {
  cleanup();
});

// Mock any global objects if needed
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

// Only mock localStorage in browser environment
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
  });
}
