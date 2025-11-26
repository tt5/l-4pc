import { setupBrowser, teardownBrowser, isBrowserConnected, getPage } from './test-utils.js';
import { beforeAll, afterAll, afterEach, vi } from 'vitest';

// Use a longer timeout for CI environments
const TEST_TIMEOUT = process.env.CI ? 300000 : 120000; // 5 min for CI, 2 min for local
const IS_DEBUG = process.env.DEBUG === 'true';

// Setup before all tests
beforeAll(async () => {
  if (IS_DEBUG) console.log('Setting up test environment...');
  
  try {
    // Always create a fresh browser instance for each test file
    await setupBrowser();
    
    // Give the browser some time to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (IS_DEBUG) console.log('Test environment ready');
  } catch (error) {
    console.error('Failed to setup browser:', error);
    try {
      await teardownBrowser();
    } catch (e) {
      console.error('Error during forced cleanup:', e);
    }
    throw error;
  }
}, TEST_TIMEOUT);

// Cleanup after all tests
afterAll(async () => {
  if (IS_DEBUG) console.log('Tearing down test environment...');
  
  try {
    if (isBrowserConnected()) {
      await teardownBrowser();
      if (IS_DEBUG) console.log('Test environment cleaned up');
    }
  } catch (error) {
    console.error('Error during teardown:', error);
    // Don't fail the test on teardown errors
  }
}, TEST_TIMEOUT);

// Reset state between tests
afterEach(async () => {
  if (IS_DEBUG) console.log('Cleaning up after test...');
  try {
    if (!isBrowserConnected()) {
      if (IS_DEBUG) console.log('Browser not connected, skipping cleanup');
      return;
    }
    
    // Skip cleanup in case of test failure to preserve state for debugging
    const testState = expect.getState();
    if (testState.currentTestName && testState.currentTestName.includes('should')) {
      const testName = testState.currentTestName;
      if (IS_DEBUG) console.log(`Running cleanup for test: ${testName}`);
    }
    
    // Basic cleanup - just navigate to about:blank
    try {
      const page = (await import('./test-utils.js')).getPage();
      if (page && !page.isClosed()) {
        await page.goto('about:blank', { 
          timeout: 5000,
          waitUntil: 'domcontentloaded' as const
        }).catch(() => {});
      }
    } catch (e) {
      if (IS_DEBUG) console.log('Cleanup navigation failed:', e);
    }
  } catch (error) {
    console.error('Error during test cleanup:', error);
  }
}, 30000); // 30 second timeout for cleanup

// Type assertion for test environment
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface Global {
      __BROWSER_GLOBAL__: any;
    }
  }
}

export {};
