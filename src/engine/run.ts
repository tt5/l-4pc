import { UCIEngine } from './uciWrapper';

async function main() {
  // Example usage in your game
  const engine = new UCIEngine();

// Initialize the engine
await engine.init();

// Set up the starting position with moves
engine.setPosition({
  fen: 'startpos',
  moves: ['h2h3', 'b7c7'] // UCI format: from-to (e.g., h2h3)
});

// Or using the direct string format
// engine.setPosition('startpos moves h2h3 b7c7');

// Get the engine's best move
const bestMove = await engine.go(2000); // 2 seconds per move
console.log('Best move:', bestMove);

  // Clean up
  engine.quit();
}

// Run the async function
main().catch(console.error);