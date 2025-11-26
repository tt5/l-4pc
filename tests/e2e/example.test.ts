import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupBrowser, teardownBrowser, isBrowserConnected } from './test-utils.js';

// Test timeout in milliseconds
const TEST_TIMEOUT = 120000; // 2 minutes

// Enable debug logging in test output
const DEBUG = process.env.DEBUG === 'true';

// Helper function to log debug messages
function debugLog(...args: any[]) {
  if (DEBUG) {
    console.log('[DEBUG]', ...args);
  }
}

describe('Example E2E Tests', () => {
  beforeAll(async () => {
    try {
      // Set up browser before all tests
      await setupBrowser();
      debugLog('Test suite setup complete');
    } catch (error) {
      console.error('❌ Test suite setup failed:', error);
      throw error;
    }
  }, TEST_TIMEOUT);

  afterAll(async () => {
    debugLog('Tearing down test suite...');
    try {
      // Clean up after all tests
      if (isBrowserConnected()) {
        await teardownBrowser();
      }
      debugLog('Test suite teardown complete');
    } catch (error) {
      console.error('Test suite teardown failed:', error);
    }
  }, TEST_TIMEOUT);

  it('should load the home page', async () => {
    debugLog('Starting home page test...');
    
    try {
      // Get the current page through the test-utils
      const { page } = await setupBrowser();
      
      // Navigate to the home page
      debugLog('Navigating to home page...');
      await page.goto('http://localhost:3000', { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      
      // Wait for the page to be fully loaded
      debugLog('Waiting for page to be ready...');
      await page.waitForSelector('body', { timeout: 10000 });
      
      // Get the page title
      const title = await page.title();
      debugLog(`Page title: ${title}`);
      
      // Basic assertions
      expect(title).toBeTruthy();
      
      // Get the page content
      const content = await page.content();
      expect(content).toBeTruthy();
      debugLog(`Page content length: ${content.length} characters`);
      
      // Check for a specific element on the page
      const bodyText = await page.evaluate(() => document.body.textContent || '');
      expect(bodyText).toBeTruthy();
      
      // Take a screenshot for visual verification
      debugLog('Taking screenshot...');
      try {
        await page.screenshot({ path: 'test-results/home-page.png' });
      } catch (screenshotError) {
        debugLog('Failed to take screenshot:', screenshotError);
      }
      
      debugLog('Home page test completed successfully');
    } catch (error) {
      console.error('❌ Home page test failed:', error);
      
      // Try to take a screenshot on failure
      try {
        const { page } = await setupBrowser();
        await page.screenshot({ path: 'test-results/home-page-failure.png' });
      } catch (screenshotError) {
        console.error('Failed to take failure screenshot:', screenshotError);
      }
      
      throw error;
    }
  }, TEST_TIMEOUT);
});
