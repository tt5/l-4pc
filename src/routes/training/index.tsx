import { Component, createSignal, onMount } from 'solid-js';
import { TrainingBoard } from '~/components/Game/TrainingBoard';

export default function TrainingPage() {
  const [currentFen4, setCurrentFen4] = createSignal<string>('');
  const [puzzles, setPuzzles] = createSignal<any[]>([]);
  const [currentPuzzle, setCurrentPuzzle] = createSignal<any | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  const loadPuzzles = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/puzzles');
      if (!response.ok) {
        throw new Error('Failed to load puzzles');
      }
      const data = await response.json();
      setPuzzles(data.puzzles || []);
      if (data.puzzles && data.puzzles.length > 0) {
        setCurrentPuzzle(data.puzzles[0]);
        setCurrentFen4(data.puzzles[0].fen4);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load puzzles');
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    loadPuzzles();
  });

  const handleMove = (move: { fromX: number; fromY: number; toX: number; toY: number }) => {
    console.log('Move made:', move);
    // TODO: Implement solution verification
  };

  const selectPuzzle = (puzzle: any) => {
    setCurrentPuzzle(puzzle);
    setCurrentFen4(puzzle.fen4);
  };

  return (
    <div class="p-8">
      <h1 class="text-3xl font-bold mb-6">Training Mode</h1>
      
      {loading() && <div>Loading puzzles...</div>}
      
      {error() && <div class="text-red-500">{error()}</div>}
      
      {!loading() && !error() && (
        <div class="flex gap-8">
          {/* Puzzle list sidebar */}
          <div class="w-64 flex-shrink-0">
            <h2 class="text-xl font-semibold mb-4">Checkmate Puzzles</h2>
            {puzzles().length === 0 ? (
              <p class="text-gray-500">No puzzles available yet.</p>
            ) : (
              <ul class="space-y-2">
                {puzzles().map((puzzle, index) => (
                  <li
                    key={puzzle.id}
                    class={`p-3 rounded cursor-pointer hover:bg-gray-100 ${
                      currentPuzzle()?.id === puzzle.id ? 'bg-blue-100' : 'bg-gray-50'
                    }`}
                    onClick={() => selectPuzzle(puzzle)}
                  >
                    <div class="font-medium">Puzzle #{index + 1}</div>
                    <div class="text-sm text-gray-600">Difficulty: {puzzle.difficulty}</div>
                    <div class="text-sm text-gray-600">Color: {puzzle.color_to_move}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Board area */}
          <div class="flex-1">
            {currentPuzzle() ? (
              <div>
                <div class="mb-4">
                  <h2 class="text-xl font-semibold">
                    Puzzle #{puzzles().findIndex(p => p.id === currentPuzzle().id) + 1}
                  </h2>
                  <p class="text-gray-600">
                    Difficulty: {currentPuzzle().difficulty} | 
                    Color to move: {currentPuzzle().color_to_move}
                  </p>
                </div>
                <TrainingBoard 
                  fen4={currentFen4()} 
                  onMove={handleMove}
                  readOnly={false}
                />
              </div>
            ) : (
              <p class="text-gray-500">Select a puzzle to start training.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
