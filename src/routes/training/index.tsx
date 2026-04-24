import { Component, createSignal, onMount } from 'solid-js';
import { TrainingBoard } from '~/components/Game/TrainingBoard';
import styles from './index.module.css';

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
      setPuzzles(data.data.puzzles || []);
      if (data.data.puzzles && data.data.puzzles.length > 0) {
        setCurrentPuzzle(data.data.puzzles[0]);
        setCurrentFen4(data.data.puzzles[0].fen4);
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
    <div class={styles.container}>
      <h1 class={styles.title}>Training Mode</h1>
      
      {loading() && <div>Loading puzzles...</div>}
      
      {error() && <div class={styles.error}>{error()}</div>}
      
      {!loading() && !error() && (
        <div class={styles.content}>
          {/* Puzzle list sidebar */}
          <div class={styles.sidebar}>
            <h2 class={styles.sidebarTitle}>Checkmate Puzzles</h2>
            {puzzles().length === 0 ? (
              <p class={styles.noPuzzles}>No puzzles available yet.</p>
            ) : (
              <ul class={styles.puzzleList}>
                {puzzles().map((puzzle, index) => (
                  <li
                    class={`${styles.puzzleItem} ${
                      currentPuzzle()?.id === puzzle.id ? styles.puzzleItemActive : styles.puzzleItemInactive
                    }`}
                    onClick={() => selectPuzzle(puzzle)}
                  >
                    <div class={styles.puzzleTitle}>Puzzle #{index + 1}</div>
                    <div class={styles.puzzleMeta}>Difficulty: {puzzle.difficulty}</div>
                    <div class={styles.puzzleMeta}>Color: {puzzle.color_to_move}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Board area */}
          <div class={styles.boardArea}>
            {currentPuzzle() ? (
              <div>
                <div class={styles.boardHeader}>
                  <h2 class={styles.boardTitle}>
                    Puzzle #{puzzles().findIndex(p => p.id === currentPuzzle().id) + 1}
                  </h2>
                  <p class={styles.boardDescription}>
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
              <p class={styles.selectPuzzle}>Select a puzzle to start training.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
