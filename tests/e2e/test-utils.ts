import type { Browser, Page, ElementHandle, BrowserContext } from 'puppeteer-core';
import { ChildProcess, execSync } from 'child_process';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import * as dns from 'dns';
import { vi, expect } from 'vitest';

const resolveDns = promisify(dns.lookup);

let browser: Browser | null = null;
let page: Page | null = null;
let lightpandaProcess: ChildProcess | null = null;
let isShuttingDown = false;
const IS_DEBUG = process.env.DEBUG === 'true';

// Ensure test-results directory exists
const testResultsDir = join(process.cwd(), 'test-results', 'screenshots');
if (!existsSync(testResultsDir)) {
  mkdirSync(testResultsDir, { recursive: true });
}

// Helper to check if the page is still attached
function isPageUsable(p: Page): boolean {
  try {
    return !p.isClosed() && !(p as any)._closed && !(p as any)._destroyed;
  } catch (e) {
    return false;
  }
}

    // Check if a port is available
    async function isPortAvailable(port: number): Promise<boolean> {
      try {
        // Use a simple TCP connection attempt to check port availability
        const net = await import('net');
        return new Promise((resolve, reject) => {
          const server = net.createServer();
          server.once('error', (err) => {
            reject(err); // Port is in use
          });
          server.once('listening', () => {
            server.close(() => {
              resolve(true); // Port is available
            });
          });
          server.listen(port, '127.0.0.1');
        });
      } catch (err) {
        return false; // Assume port is not available on error
      }
    }

// Kill process on a specific port
function killProcessOnPort(port: number): void {
  try {
    if (process.platform === 'win32') {
      execSync(`netstat -ano | findstr :${port}`, { stdio: 'pipe' });
      execSync(`taskkill /F /PID ${port}`);
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9`, { stdio: 'pipe' });
    }
  } catch (error) {
    // Ignore errors if no process is found
  }
}

// Get an available port
async function getAvailablePort(startPort: number = 9222, maxAttempts: number = 10): Promise<number> {
  let port = startPort;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    if (await isPortAvailable(port)) {
      return port;
    }
    port++;
    attempts++;
  }
  
  throw new Error(`Could not find an available port between ${startPort} and ${startPort + maxAttempts - 1}`);
}

// Initialize the browser and page
export async function setupBrowser() {
  if (isShuttingDown) {
    throw new Error('Browser is in the process of shutting down');
  }

  if (browser && page && isPageUsable(page)) {
    return { browser, page };
  }

  // Clean up any existing browser instances
  await teardownBrowser();

  try {
    // Use a random port between 9000 and 9999 to avoid conflicts
    let selectedPort = 9000 + Math.floor(Math.random() * 1000);
    
    // Try to find an available port
    const maxPortAttempts = 5;
    let portAttempt = 0;
    let connected = false;
    
    // Import lightpanda dynamically
    const { lightpanda } = await import('@lightpanda/browser');
    
    while (portAttempt < maxPortAttempts && !connected) {
      portAttempt++;
      const currentPort = selectedPort + portAttempt - 1;
      
      try {
        // Kill any process using the port
        killProcessOnPort(currentPort);
        
        if (IS_DEBUG) console.log(`Attempting to start Lightpanda on port ${currentPort}...`);
        
        // Start Lightpanda browser server with retry
        lightpandaProcess = await lightpanda.serve({
          host: '127.0.0.1',
          port: currentPort,
          timeout: 30000
        });
        
        // Update the port to the one we're actually using
        selectedPort = currentPort;
        connected = true;
        
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (IS_DEBUG) console.error(`Failed to start on port ${currentPort}:`, errorMessage);
        if (portAttempt >= maxPortAttempts) {
          throw new Error(`Failed to start after ${maxPortAttempts} attempts. Last error: ${errorMessage}`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    if (!connected) {
      throw new Error(`Failed to start Lightpanda after ${maxPortAttempts} attempts`);
    }
    
    if (IS_DEBUG) console.log(`Lightpanda browser started on port ${selectedPort}`);
    
    // Connect to the browser using puppeteer-core
    const puppeteer = await import('puppeteer-core');
    
    // Wait for the browser to be ready
    const maxConnectAttempts = 5;
    let connectAttempt = 0;
    let lastError: Error | null = null;
    
    while (connectAttempt < maxConnectAttempts) {
      try {
        browser = await puppeteer.connect({
          browserURL: `http://127.0.0.1:${selectedPort}`,
          defaultViewport: { width: 1280, height: 1024 }
        });
        break;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        lastError = new Error(errorMessage);
        connectAttempt++;
        if (IS_DEBUG) console.log(`Connection attempt ${connectAttempt} failed, retrying...`, errorMessage);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    if (!browser) {
      throw lastError || new Error('Failed to connect to browser');
    }

    // Get the first page
    const pages = await browser.pages();
    page = pages[0] || (await browser.newPage());
    
    // Set timeouts
    await page.setDefaultNavigationTimeout(60000);
    await page.setDefaultTimeout(30000);
    
    if (IS_DEBUG) console.log('Browser setup complete');
    
    return { browser, page };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Failed to setup browser:', errorMessage);
    
    // Save error details to a file for debugging
    try {
      writeFileSync(
        join(process.cwd(), 'test-results', 'browser-setup-error.log'),
        `Error: ${errorMessage}\n\n${error instanceof Error ? error.stack : ''}`
      );
    } catch (e) {
      console.error('Failed to save error log:', e);
    }
    
    await teardownBrowser().catch(e => 
      console.error('Error during cleanup after setup failure:', e)
    );
    
    throw error;
  }
}

// Get the current page
export function getPage(): Page {
  if (!page || !isPageUsable(page)) {
    throw new Error('Page not available. It might have been closed or never initialized.');
  }
  return page;
}

// Check if browser is connected
export function isBrowserConnected(): boolean {
  return !!browser && browser.isConnected();
}

// Clean up resources
export async function teardownBrowser() {
  if (isShuttingDown) {
    return; // Already shutting down
  }
  
  isShuttingDown = true;
  
  const cleanup = async () => {
    const errors: string[] = [];
    
    // Take a final screenshot before closing
    try {
      if (page && !page.isClosed()) {
        await takeScreenshot('final-screenshot').catch(e => {
          errors.push(`Final screenshot failed: ${e instanceof Error ? e.message : String(e)}`);
        });
      }
    } catch (e) {
      errors.push(`Error in final screenshot: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Close the browser
    if (browser) {
      try {
        // Try to close pages gracefully first
        try {
          const pages = await browser.pages();
          for (const p of pages) {
            try {
              if (!p.isClosed()) {
                await p.close().catch(e => {
                  errors.push(`Error closing page: ${e instanceof Error ? e.message : String(e)}`);
                });
              }
            } catch (e) {
              errors.push(`Error processing page: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        } catch (e) {
          errors.push(`Error getting pages: ${e instanceof Error ? e.message : String(e)}`);
        }
        
        // Disconnect if connected
        try {
          if (browser.isConnected()) {
            await browser.disconnect();
          }
        } catch (e) {
          errors.push(`Error disconnecting browser: ${e instanceof Error ? e.message : String(e)}`);
        }
        
        // Close the browser
        try {
          await browser.close().catch(e => {
            errors.push(`Error closing browser: ${e instanceof Error ? e.message : String(e)}`);
          });
        } catch (e) {
          errors.push(`Fatal error closing browser: ${e instanceof Error ? e.message : String(e)}`);
        }
      } catch (e) {
        errors.push(`Error during browser cleanup: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        browser = null;
      }
    }
    
    // Kill the lightpanda process
    if (lightpandaProcess) {
      try {
        if (lightpandaProcess.pid && !lightpandaProcess.killed) {
          if (process.platform === 'win32') {
            execSync(`taskkill /F /PID ${lightpandaProcess.pid}`, { stdio: 'ignore' });
          } else {
            process.kill(-lightpandaProcess.pid, 'SIGTERM');
          }
        }
      } catch (e) {
        // Ignore errors when killing the process
      } finally {
        lightpandaProcess = null;
      }
    }
    
    page = null;
    
    // Log any errors that occurred during cleanup
    if (errors.length > 0 && IS_DEBUG) {
      console.log('Cleanup completed with the following non-fatal errors:');
      errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }
  };

  try {
    if (IS_DEBUG) console.log('Starting browser teardown...');
    await cleanup();
    if (IS_DEBUG) console.log('Browser teardown completed');
  } catch (error) {
    console.error('❌ Error during teardown:', error);
    
    try {
      // One last attempt at cleanup
      await cleanup().catch(e => 
        console.error('Error during forced cleanup:', e)
      );
    } catch (e) {
      console.error('Fatal error during forced cleanup:', e);
    }
    
    throw error;
  } finally {
    isShuttingDown = false;
  }
}

// Navigate to a URL
export async function navigateTo(url: string) {
  const page = getPage();
  try {
    await page.goto(`http://localhost:3000${url}`, { 
      waitUntil: 'networkidle0',
      timeout: 60000
    });
  } catch (error) {
    console.error(`Failed to navigate to ${url}:`, error);
    throw error;
  }
}

// Get text content of an element
export async function getText(selector: string): Promise<string | null> {
  const page = getPage();
  try {
    const element = await page.$(selector);
    return element ? await page.evaluate(el => el.textContent || '', element) : null;
  } catch (error) {
    console.error(`Failed to get text for selector '${selector}':`, error);
    return null;
  }
}

// Take a screenshot with better error handling
export async function takeScreenshot(name: string): Promise<string | null> {
  if (isShuttingDown) {
    if (IS_DEBUG) console.log('Skipping screenshot - browser is shutting down');
    return null;
  }

  let page: Page;
  try {
    page = getPage();
  } catch (error) {
    if (IS_DEBUG) console.log(`Cannot take screenshot '${name}': Page not available`);
    return null;
  }
  
  const safeName = name.replace(/[^a-z0-9-]/gi, '_').toLowerCase();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = join(testResultsDir, `${safeName}-${timestamp}.png`);
  
  try {
    // Ensure the directory exists
    const dir = join(testResultsDir);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Check if the page is still valid
    if (page.isClosed()) {
      if (IS_DEBUG) console.log(`Cannot take screenshot '${name}': Page is closed`);
      return null;
    }
    
    // Try to take a screenshot with minimal options
    try {
      await page.screenshot({ 
        path: screenshotPath,
        type: 'png',
        encoding: 'binary',
        fullPage: true,
        captureBeyondViewport: true
      } as any); // Using type assertion to bypass type checking
      
      if (IS_DEBUG) console.log(`Screenshot saved: ${screenshotPath}`);
      return screenshotPath;
    } catch (screenshotError) {
      if (IS_DEBUG) {
        console.warn(`Screenshot '${name}' failed:`, 
          screenshotError instanceof Error ? screenshotError.message : String(screenshotError));
      }
      
      // If the page is closed or the browser is disconnected, give up
      if (page.isClosed() || !browser?.isConnected()) {
        if (IS_DEBUG) console.log('Page closed or browser disconnected, cannot retry screenshot');
        return null;
      }
      
      // Try a simpler approach
      try {
        await (page as any).screenshot({ 
          path: screenshotPath,
          type: 'png'
        });
        
        if (IS_DEBUG) console.log(`Screenshot saved (fallback): ${screenshotPath}`);
        return screenshotPath;
      } catch (fallbackError) {
        if (IS_DEBUG) {
          console.warn(`Fallback screenshot '${name}' also failed:`, 
            fallbackError instanceof Error ? fallbackError.message : String(fallbackError));
        }
        return null;
      }
    }
  } catch (error) {
    // Don't fail the test if screenshot fails
    if (IS_DEBUG) {
      console.warn(`Unexpected error taking screenshot '${name}':`, 
        error instanceof Error ? error.message : String(error));
    }
    return null;
  }
}

// Click an element
// Click an element
export async function click(selector: string, options?: { timeout?: number }) {
  const page = getPage();
  try {
    await page.waitForSelector(selector, { visible: true, timeout: options?.timeout || 5000 });
    await page.click(selector);
  } catch (error) {
    console.error(`Failed to click on '${selector}':`, error);
    throw error;
  }
}

// Type text into an input field
export async function type(selector: string, text: string, options?: { delay?: number, timeout?: number }) {
  const page = getPage();
  try {
    await page.waitForSelector(selector, { visible: true, timeout: options?.timeout || 5000 });
    await page.type(selector, text, { delay: options?.delay || 100 });
  } catch (error) {
    console.error(`Failed to type '${text}' into '${selector}':`, error);
    throw error;
  }
}
