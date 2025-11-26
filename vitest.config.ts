import solid from "vite-plugin-solid"
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  // @ts-ignore - Vite plugins are properly typed but TypeScript needs help here
  plugins: [solid()],
  resolve: {
    conditions: ["development", "browser"],
  },
  test: {
    globals: true,
    // Always use node environment for E2E tests
    environment: 'node',
    setupFiles: mode === 'e2e' ? [] : ['./src/test/setup.ts'],
    include: [
      mode === 'e2e' 
        ? 'tests/e2e/**/*.test.{js,ts,tsx}'
        : 'src/**/*.{test,spec}.{js,ts,tsx}'
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
    // Disable browser mode since we're using Puppeteer directly
    browser: {
      enabled: false,
    },
  },
}));