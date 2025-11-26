import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { 
  navigateTo, 
  getPage, 
  setupBrowser,
  teardownBrowser,
  isBrowserConnected
} from './test-utils';

const TEST_TIMEOUT = 30000; // 30 seconds

// Debug logging
const log = (...args: any[]) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}]`, ...args);
};

// Ensure we only set up/tear down the browser once
let isSetup = false;

describe('Smoke Test', () => {
  beforeAll(async () => {
    log('Starting test setup...');
    if (!isSetup) {
      log('Setting up browser...');
      try {
        await setupBrowser();
        isSetup = true;
        log('Browser setup complete');
      } catch (error) {
        log('Browser setup failed:', error);
        throw error;
      }
    } else {
      log('Browser already set up, skipping...');
    }
  }, TEST_TIMEOUT);

  afterAll(async () => {
    log('Starting test teardown...');
    if (isSetup) {
      log('Tearing down browser...');
      try {
        await teardownBrowser();
        log('Browser teardown complete');
      } catch (error) {
        log('Error during browser teardown:', error);
      } finally {
        isSetup = false;
      }
      
      // Add a small delay to allow resources to be properly released
      log('Waiting for resources to be released...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      log('Teardown complete');
    } else {
      log('No browser instance to tear down');
    }
  }, TEST_TIMEOUT);

  it('should load the home page', async () => {
    log('Starting test: should load the home page');
    
    try {
      log('Navigating to home page...');
      await navigateTo('/');
      log('Navigation complete');
      
      const page = getPage();
      log('Got page instance');
      
      // Basic page load check with timeout
      log('Waiting for page to be ready...');
      await page.waitForFunction(
        'document.readyState === "complete"',
        { timeout: 10000 }
      );
      log('Page is ready');
      
      log('Getting page title...');
      const title = await page.title();
      log(`Page title: ${title}`);
      
      log('Checking for body element...');
      const bodyElement = await page.$('body');
      log(`Body element found: ${!!bodyElement}`);
      
      // Simple assertions
      log('Running assertions...');
      expect(title).toBeTruthy();
      expect(bodyElement).not.toBeNull();
      
      log('Test completed successfully');
    } catch (error) {
      log('Test failed with error:', error);
      throw error;
    }
  }, TEST_TIMEOUT);
});
