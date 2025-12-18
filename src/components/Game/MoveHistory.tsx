import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import styles from './MoveHistory.module.css';

type Move = {
  id?: number | string;  // Add id as an optional property
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  moveNumber?: number;
  timestamp?: string | number;
  playerId?: string;
  color: string;
};

type MoveHistoryProps = {
  moves: Move[];
  currentMoveIndex: number;
  currentPlayerColor: () => string;
  branchPoints?: Record<number, Array<{
    branchName: string;
    parentBranch: string;
    firstMove: any;
  }>>;
};

export const MoveHistory = (props: MoveHistoryProps) => {
  const [prevMoveIndex, setPrevMoveIndex] = createSignal<number | null>(null);
  const [expandedBranches, setExpandedBranches] = createSignal<Record<number, boolean>>({});

  // Effect to handle move highlighting
  createEffect(() => {
    // Remove highlight from previous move
    if (prevMoveIndex() !== null && prevMoveIndex() !== props.currentMoveIndex) {
      const prevElement = document.querySelector<HTMLElement>(`[data-move-index="${prevMoveIndex()}"]`);
      if (prevElement) {
        prevElement.classList.remove(styles.currentMove);
        prevElement.style.setProperty('background-color', 'transparent');
        prevElement.style.setProperty('border', 'none');
      }
    }
    
    // Add highlight to current move
    const currentElement = document.querySelector<HTMLElement>(`[data-move-index="${props.currentMoveIndex}"]`);
    if (currentElement) {
      currentElement.classList.add(styles.currentMove);
      currentElement.style.setProperty('background-color', 'rgba(255, 0, 0, 0.3)');
      currentElement.style.setProperty('border', '2px solid red');
    }
    
    // Update previous move index
    setPrevMoveIndex(props.currentMoveIndex);
  });

  // Cleanup on unmount
  onCleanup(() => {
    if (prevMoveIndex() !== null) {
      const element = document.querySelector<HTMLElement>(`[data-move-index="${prevMoveIndex()}"]`);
      if (element) {
        element.classList.remove(styles.currentMove);
        element.style.setProperty('background-color', 'transparent');
        element.style.setProperty('border', 'none');
      }
    }
  });

  // Debug effect to log when props change
  createEffect(() => {
    console.log('Moves updated:', props.moves.length, 'moves');
    console.log('Current move index:', props.currentMoveIndex);
    if (props.currentMoveIndex >= 0 && props.currentMoveIndex < props.moves.length) {
      console.log('Current move:', props.moves[props.currentMoveIndex]);
    }
  });

  const hasBranches = (moveIndex: number) => {
    return props.branchPoints && props.branchPoints[moveIndex]?.length > 0;
  };
  
  const getBranches = (moveIndex: number) => {
    return props.branchPoints?.[moveIndex] || [];
  };
  
  const isBranchPoint = (moveIndex: number, branchName: string) => {
    return props.branchPoints?.[moveIndex]?.some(b => b.branchName === branchName);
  };

  // Toggle branch expansion
  const toggleBranchExpansion = (moveIndex: number) => {
    setExpandedBranches(prev => ({
      ...prev,
      [moveIndex]: !prev[moveIndex]
    }));
  };

  // Format move coordinates for display
  const formatMove = (move: { fromX: number; fromY: number; toX: number; toY: number }) => {
    return `(${move.fromX},${move.fromY}) → (${move.toX},${move.toY})`;
  };

  // Auto-expand the current branch
  createEffect(() => {
    const index = props.currentMoveIndex;
    if (index >= 0) {
      setExpandedBranches(prev => ({
        ...prev,
        [index]: true
      }));
    }
  });
  
  // Memoize the current move to prevent unnecessary re-renders
  const currentMove = createMemo(() => props.moves[props.currentMoveIndex]);
  
  return (
    <div class={styles.moveHistoryContainer}>
      <div class={`${styles.turnIndicator} ${styles[props.currentPlayerColor()]}`}>
        {props.currentPlayerColor()}'s turn
      </div>
      <h3>Move History</h3>
      <div class={styles.moveHistory}>
        <Show 
          when={props.moves.length > 0} 
          fallback={<div>No moves yet</div>}
        >
          <For each={props.moves}>
            {(move, index) => {
              const fromX = move.fromX;
              const fromY = move.fromY;
              const toX = move.toX;
              const toY = move.toY;
              // Use 1-based indexing for display
              const displayMoveNumber = index() + 1;
              const moveTime = move.timestamp ? new Date(move.timestamp).toLocaleTimeString() : 'Unknown time';
              if (fromX === undefined || fromY === undefined || toX === undefined || toY === undefined) {
                console.warn('Move data is missing required coordinates', move);
              }
              
              // For display purposes, use displayMoveNumber
              const moveNumber = displayMoveNumber;
              
              // Only highlight if this is the exact current move index
              // Using index() directly since it's 0-based like currentMoveIndex
              const isCurrentMove = index() === props.currentMoveIndex;
              
              // Always include moveItem class, conditionally add currentMove
              const moveClass = `${styles.moveItem}${isCurrentMove ? ` ${styles.currentMove}` : ''}`;
              
              // Debug info for individual move
              console.group(`Move ${displayMoveNumber}`);
              console.log('Move data:', {
                moveNumber,
                isCurrentMove: isCurrentMove ? 'HIGHLIGHTED' : 'not current',
                currentMoveIndex: props.currentMoveIndex,
                move: { from: [fromX, fromY], to: [toX, toY] },
                timestamp: move.timestamp
              });
              console.groupEnd();
              
              return (
                <div 
                  class={styles.moveItem}
                  data-move-index={index()}
                  data-move-number={moveNumber}
                  style={{
                    padding: '4px',
                    'border-radius': '4px',
                    margin: '2px 0',
                    'background-color': isCurrentMove ? 'rgba(255, 0, 0, 0.3)' : 'transparent',
                    border: isCurrentMove ? '2px solid red' : 'none',
                    display: 'flex',
                    'align-items': 'center',
                    gap: '8px'
                  }}
                >
                  <span class={styles.moveNumber}>{moveNumber}.</span>
                  <div class={styles.moveDetails}>
                    <div class={styles.moveCoords}>
                      ({fromX},{fromY}) → ({toX},{toY})
                    </div>
                    {hasBranches(index()) && (
                      <div class={styles.branchInfo}>
                        <For each={getBranches(index())}>
                          {(branch) => {
                            const branchMove = {
                              ...branch.firstMove,
                              branchName: branch.branchName,
                              parentBranch: branch.parentBranch
                            };
                            const isExpanded = expandedBranches()[index()];
                            
                            return (
                              <div class={styles.branchContainer}>
                                <div 
                                  class={styles.branchHeader}
                                  onClick={() => toggleBranchExpansion(index())}
                                >
                                  <span class={styles.branchBadge} title={branch.branchName}>
                                    {branch.branchName === 'main' ? 'Main Line' : 
                                     branch.branchName.includes('branch-') ? 'Branch' : branch.branchName}
                                    {branch.parentBranch && branch.parentBranch !== 'main' && (
                                      <span class={styles.parentBranch}>from {branch.parentBranch}</span>
                                    )}
                                  </span>
                                  <span class={styles.branchMove}>
                                    {formatMove(branch.firstMove)}
                                  </span>
                                  <span class={styles.expandIcon}>
                                    {isExpanded ? '▼' : '▶'}
                                  </span>
                                </div>
                                
                                {isExpanded && (
                                  <div class={styles.branchMoves}>
                                    <div class={styles.branchMoveItem}>
                                      <span class={styles.moveNumber}>{moveNumber + 1}.</span>
                                      <span class={styles.moveCoords}>
                                        {formatMove(branch.firstMove)}
                                      </span>
                                    </div>
                                    {/* Additional branch moves could be rendered here */}
                                  </div>
                                )}
                              </div>
                            );
                          }}
                        </For>
                      </div>
                    )}
                  </div>
                  <div class={styles.moveMeta}>
                    <span class={styles.moveTime}>{moveTime}</span>
                    {move.playerId && (
                      <span class={styles.movePlayer} title={move.playerId}>
                        Player: {move.playerId.substring(0, 6)}...
                      </span>
                    )}
                  </div>
                </div>
              );
            }}
          </For>
        </Show>
      </div>
    </div>
  );
};

export default MoveHistory;
