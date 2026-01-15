import { spawn } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { APIEvent } from '@solidjs/start/server';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PID_FILE = join(process.cwd(), '.engine.pid');

let engineProcess: import('child_process').ChildProcessWithoutNullStreams | null = null;

export async function POST({ request, params }: APIEvent) {
  try {
    const { action } = params;
    
    if (action === 'start') {
      if (engineProcess) {
        return new Response(JSON.stringify({ success: false, message: 'Engine already running' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Start the engine server
      engineProcess = spawn('npm', ['run', 'engine:server'], {
        detached: true,
        stdio: 'pipe',  // Changed from 'ignore' to 'pipe' to ensure streams exist
        shell: true
      }) as import('child_process').ChildProcessWithoutNullStreams;

      // Store the PID for later use
      if (!engineProcess.pid) {
        throw new Error('Failed to start engine process: No process ID');
      }
      await writeFile(PID_FILE, engineProcess.pid.toString());

      // Handle process exit
      engineProcess.on('exit', () => {
        engineProcess = null;
        unlink(PID_FILE).catch(() => {});
      });

      return new Response(JSON.stringify({ success: true, pid: engineProcess.pid }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } else if (action === 'stop') {
      if (!engineProcess) {
        return new Response(JSON.stringify({ success: false, message: 'No engine process running' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Kill the process group to ensure all child processes are terminated
      if (engineProcess && engineProcess.pid) {
        process.kill(-engineProcess.pid, 'SIGTERM');
      }
      engineProcess = null;
      await unlink(PID_FILE).catch(() => {});

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: false, message: 'Invalid action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error('Engine control error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      message: errorMessage 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Clean up on process exit
process.on('SIGINT', async () => {
  if (engineProcess?.pid) {
    process.kill(-engineProcess.pid, 'SIGTERM');
    await unlink(PID_FILE).catch(() => {});
  }
  process.exit(0);
});
