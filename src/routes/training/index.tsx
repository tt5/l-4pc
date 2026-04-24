import { Component, createSignal, onMount } from 'solid-js';
import { TrainingBoard } from '~/components/Game/TrainingBoard';
import styles from './index.module.css';

export default function TrainingPage() {
  const [currentFen4, setCurrentFen4] = createSignal<string>('');
  const [prevPuzzle, setPrevPuzzle] = createSignal<any | null>(null);
  const [currentPuzzle, setCurrentPuzzle] = createSignal<any | null>(null);
  const [nextPuzzle, setNextPuzzle] = createSignal<any | null>(null);
  const [totalCount, setTotalCount] = createSignal<number>(0);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [puzzleSolved, setPuzzleSolved] = createSignal(false);
  const [reloadLoading, setReloadLoading] = createSignal(false);
  const [reloadMessage, setReloadMessage] = createSignal<string | null>(null);

  const loadRandomPuzzle = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/puzzles/random');
      if (!response.ok) {
        throw new Error('Failed to load random puzzle');
      }
      const data = await response.json();
      const puzzle = data.data.puzzle;
      setCurrentPuzzle(puzzle);
      setCurrentFen4(puzzle.fen4);
      await loadNeighbors(puzzle.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load puzzle');
    } finally {
      setLoading(false);
    }
  };

  const loadNeighbors = async (currentId: number) => {
    try {
      const response = await fetch(`/api/puzzles/${currentId}/neighbors`);
      if (!response.ok) {
        throw new Error('Failed to load neighbors');
      }
      const data = await response.json();
      setPrevPuzzle(data.data.previous);
      setNextPuzzle(data.data.next);
      setTotalCount(data.data.totalCount);
    } catch (err) {
      console.error('Failed to load neighbors:', err);
    }
  };

  const goToPrevious = async () => {
    const prev = prevPuzzle();
    const current = currentPuzzle();
    if (!prev) return;
    
    setCurrentPuzzle(prev);
    setCurrentFen4(prev.fen4);
    setPuzzleSolved(false);
    await loadNeighbors(prev.id);
    
    // The old current puzzle becomes the next
    if (current) {
      setNextPuzzle(current);
    }
  };

  const goToNext = async () => {
    const next = nextPuzzle();
    const current = currentPuzzle();
    if (!next) return;
    
    setCurrentPuzzle(next);
    setCurrentFen4(next.fen4);
    setPuzzleSolved(false);
    await loadNeighbors(next.id);
    
    // The old current puzzle becomes the previous
    if (current) {
      setPrevPuzzle(current);
    }
  };

  onMount(() => {
    loadRandomPuzzle();
  });

  const handleMove = (move: { fromX: number; fromY: number; toX: number; toY: number }) => {
    console.log('Move made:', move);
    // TODO: Implement solution verification
  };

  const handleCheckmate = (winnerColor: string) => {
    setPuzzleSolved(true);
    console.log('Checkmate! Winner:', winnerColor);

    // Auto-advance to next puzzle after 2 seconds
    setTimeout(() => {
      goToNext();
    }, 200);
  };

  const handleReload = async () => {
    try {
      setReloadLoading(true);
      setReloadMessage(null);
      
      const response = await fetch('/api/puzzles/reload', {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Failed to reload puzzles');
      }
      
      const data = await response.json();
      const { imported, skipped, total } = data.data;
      
      setReloadMessage(`Reloaded ${imported} new puzzles (${skipped} duplicates skipped)`);
      
      // Refresh current puzzle after reload
      await loadRandomPuzzle();
    } catch (err) {
      setReloadMessage(err instanceof Error ? err.message : 'Failed to reload puzzles');
    } finally {
      setReloadLoading(false);
    }
  };


  return (
    <div class={styles.container}>
      <h1 class={styles.title}>Training Mode</h1>
      
      {loading() && <div>Loading puzzle...</div>}
      
      {error() && <div class={styles.error}>{error()}</div>}
      
      {!loading() && !error() && currentPuzzle() && (
        <div class={styles.content}>
          {/* Navigation controls */}
          <div class={styles.navigation}>
            <button 
              class={styles.navButton}
              onClick={goToPrevious}
              disabled={!prevPuzzle()}
            >
              ← Previous
            </button>
            <div class={styles.puzzleCounter}>
              Puzzle #{currentPuzzle().id} of {totalCount()}
            </div>
            <button 
              class={styles.navButton}
              onClick={handleReload}
              disabled={reloadLoading()}
            >
              {reloadLoading() ? 'Reloading...' : '↻ Reload Puzzles'}
            </button>
            <button 
              class={styles.navButton}
              onClick={goToNext}
              disabled={!nextPuzzle()}
            >
              Next →
            </button>
            {reloadMessage() && (
              <div class={styles.reloadMessage}>{reloadMessage()}</div>
            )}
          </div>

          {/* Board area */}
          <div class={styles.boardArea}>
            <div class={styles.boardWrapper}>
              <div class={styles.boardHeader}>
                <h2 class={styles.boardTitle}>
                  Difficulty: {currentPuzzle().difficulty}
                </h2>
                <p class={`${styles.boardDescription} ${styles['colorToMove' + currentPuzzle().color_to_move]}`}>
                  Color to move: {currentPuzzle().color_to_move}
                </p>
              </div>
              <TrainingBoard
                fen4={currentFen4()}
                onMove={handleMove}
                onCheckmate={handleCheckmate}
                readOnly={puzzleSolved()}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
