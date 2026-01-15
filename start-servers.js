import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const servers = [
  { name: 'App', command: 'npm', args: ['run', 'dev'], cwd: __dirname },
  { name: 'Engine', command: 'npm', args: ['run', 'engine:server'], cwd: __dirname }
];

servers.forEach(({ name, command, args, cwd }) => {
  const proc = spawn(command, args, { 
    stdio: 'inherit',
    shell: true,
    cwd,
    env: { ...process.env, FORCE_COLOR: '1' }
  });
  
  proc.on('error', (error) => {
    console.error(`[${name}] Error:`, error.message);
  });

  proc.on('close', (code) => {
    console.log(`[${name}] Process exited with code ${code}`);
  });
});

process.on('SIGINT', () => {
  console.log('\nShutting down all servers...');
  process.exit(0);
});