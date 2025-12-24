// src/engine/testInfinite.ts
import { UCIEngine } from './uciWrapper';

async function testInfiniteAnalysis() {
  const engine = new UCIEngine();

  try {
    // Initialize the engine
    console.log('Initializing engine...');
    await engine.init();
    console.log('Engine initialized');

    // Set up position
    const fen = 'startpos moves e2e4 e7e5 g1f3 b8c6';
    console.log(`Setting position: ${fen}`);
    engine.setPosition(fen);

    // Set up analysis callback
    engine.onAnalysisUpdate = (info) => {
      console.log(`Depth: ${info.depth}, Eval: ${info.score > 0 ? '+' : ''}${info.score}`);
      console.log(`PV: ${info.pv.join(' ')}`);
      if (info.bestMove) {
        console.log(`Best move: ${info.bestMove}`);
      }
    };

    // Start infinite analysis
    console.log('Starting infinite analysis...');
    engine.startInfiniteAnalysis();

    // Stop after 10 seconds for testing
    setTimeout(() => {
      console.log('Stopping analysis...');
      engine.stopInfiniteAnalysis();
      engine.quit();
      console.log('Analysis stopped');
    }, 10000);

  } catch (error) {
    console.error('Error:', error);
    engine.quit();
  }
}

testInfiniteAnalysis().catch(console.error);