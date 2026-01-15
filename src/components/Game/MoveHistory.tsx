import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js';
import styles from './MoveHistory.module.css';
import { formatMove } from '../../utils/chessNotation';
import type { BasePoint } from '../../types/board';

type Move = {
  id?: number | string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  moveNumber?: number;
  playerId?: string;
  color?: string;
  pieceType?: string;
  isCapture?: boolean;
  isCheck?: boolean;
  promotionPiece?: string;
};

type MoveHistoryProps = {
  moves: Move[];
  currentMoveIndex: number;
  currentPlayerColor: () => string;
  branchPoints?: Record<number, Array<{
    branchName: string;
    parentBranch: string;
    firstMove: Move;
  }>>;
  basePoints?: BasePoint[];
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
      }
    }
    
    // Add highlight to current move
    const currentElement = document.querySelector<HTMLElement>(`[data-move-index="${props.currentMoveIndex}"]`);
    if (currentElement) {
      currentElement.classList.add(styles.currentMove);
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
      }
    }
  });

  const hasBranches = (moveIndex: number) => {
    return props.branchPoints && props.branchPoints[moveIndex]?.length > 0;
  };
  
  const getBranches = (moveIndex: number) => {
    return props.branchPoints?.[moveIndex] || [];
  };
  
  // Format move using chess notation
  const formatMoveDisplay = (move: Move, basePoints: BasePoint[]) => {
    try {
      return formatMove(move, basePoints);
    } catch (error) {
      console.error('Error formatting move:', error);
      return `(${move.fromX},${move.fromY}) → (${move.toX},${move.toY})`;
    }
  };

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
              if (fromX === undefined || fromY === undefined || toX === undefined || toY === undefined) {
                console.warn('Move data is missing required coordinates', move);
              }
              
              // For display purposes, use displayMoveNumber
              const moveNumber = displayMoveNumber;
              
              // Only highlight if this is the exact current move index
              // Using index() directly since it's 0-based like currentMoveIndex
              const isCurrentMove = index() === props.currentMoveIndex;
              
              return (
                <div 
                  class={`${styles.moveItem} ${isCurrentMove ? styles.currentMove : ''}`}
                  data-move-index={index()}
                  data-move-number={moveNumber}
                >
                  <span class={styles.moveNumber}>{moveNumber}.</span>
                  <div class={styles.moveDetails}>
                    <div class={styles.moveCoords}>
                      {formatMoveDisplay({
                        fromX,
                        fromY,
                        toX,
                        toY,
                        pieceType: move.pieceType,
                        isCapture: move.isCapture,
                        isCheck: move.isCheck,
                        promotionPiece: move.promotionPiece
                      }, props.basePoints || [])}
                    </div>
                    {hasBranches(index()) && (
                      <div class={styles.branchInfo}>
                        <For each={getBranches(index())}>
                          {(branch) => {
                            return (
                              <div class={styles.branchContainer}>
                                <div class={styles.branchMoves}>
                                  <div class={styles.branchMoveItem}>
                                    <span class={styles.moveNumber}>{moveNumber}.</span>
                                    <span class={styles.moveCoords}>
                                      {formatMoveDisplay(branch.firstMove, props.basePoints || [])}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          }}
                        </For>
                      </div>
                    )}
                  </div>
                  <div class={styles.moveMeta}></div>
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
