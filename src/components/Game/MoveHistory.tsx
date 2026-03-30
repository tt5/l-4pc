import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js';
import styles from './MoveHistory.module.css';
import { formatMove } from '../../utils/chessNotation';
import type { BranchPoints, Move, NamedColor, SimpleMove } from '../../types/board';
import { PLAYER_COLORS } from '~/constants/game';

type HistoryMove = Partial<Move>

type MoveHistoryProps = {
  moves: Move[];
  mainLineMoves: Move[];
  currentMoveIndex: number;
  branchPoints?: BranchPoints;
};

export const MoveHistory = (props: MoveHistoryProps) => {
  const [prevMoveIndex, setPrevMoveIndex] = createSignal<number | null>(null);

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
  const formatMoveDisplay = (move: HistoryMove) => {
    try {
      
      const formatingMove = {
        fromX: move.fromX!,
        fromY: move.fromY!,
        toX: move.toX!,
        toY: move.toY!,
        pieceType: move.pieceType,
        color: move.color,
        isCapture: !!move.capturedPiece,
        //isCheck: move.isCheck,
        //promotionPiece: move.promotionPiece
      };
      
      const result = formatMove(formatingMove);
      return result;
    } catch (error) {
      console.error('Error formatting move:', error);
      return `(${move.fromX},${move.fromY}) → (${move.toX},${move.toY})`;
    }
  };

  const getCurrentPlayerColor = () => {
    const colorIndex = props.currentMoveIndex % PLAYER_COLORS.length;
    return PLAYER_COLORS[colorIndex] || 'RED'; // fallback to RED if undefined
  };

        console.log(`MoveHistor turn: ${JSON.stringify(getCurrentPlayerColor())}`)
  return (
    <div class={styles.moveHistoryContainer}>
      <div class={`${styles.turnIndicator} ${styles[getCurrentPlayerColor().toLowerCase()] || 'red'}`}>
        {getCurrentPlayerColor()}'s turn
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
              
              // Calculate move number display (1.1, 1.2, 1.3, 1.4, 2.1, etc.)
              const turnNumber = Math.floor(index() / 4) + 1;
              const playerMoveNumber = (index() % 4) + 1;
              const displayMoveNumber = `${turnNumber}.${playerMoveNumber}`;
              
              const moveNumber = index() + 1;
              
              // Only highlight if this is the exact current move index
              // Using index() directly since it's 0-based like currentMoveIndex
              const isCurrentMove = index() === props.currentMoveIndex;
              
              return (
                <div 
                  class={`
                    ${styles.moveItem}
                    ${isCurrentMove ? styles.currentMove : ''}
                    ${props.moves[moveNumber-1].branchName === 'main' ? styles.mainLine : ''}
                  `}
                  data-move-index={index()}
                  data-move-number={moveNumber}
                >
                  <span class={styles.moveNumber}>{displayMoveNumber}</span>
                  <div class={styles.moveDetails}>
                    <div class={styles.moveCoords}>
                      {formatMoveDisplay({
                        fromX,
                        fromY,
                        toX,
                        toY,
                        pieceType: move.pieceType,
                        //isCapture: !!move.capturedPiece,
                        //isCheck: move.isCheck,
                        //promotionPiece: move.promotionPiece
                      })}
                    </div>
                    {hasBranches(index()) && (
                      <div class={styles.branchInfo}>
                        <For each={getBranches(index())}>
                          {(branch) => {
                            if (moveNumber > 1 && props.moves[moveNumber-2].branchName === 'main'
                               &&  branch.branchName === props.moves[moveNumber-1].branchName) {
                              return (
                                <div class={`${styles.branchContainer}`}>
                                  <div class={styles.branchMoves}>
                                    <div class={styles.branchMoveItem}>
                                      <span class={styles.moveCoords}>
                                        {formatMoveDisplay({
                                          
                                          fromX: props.mainLineMoves[moveNumber-1].fromX,
                                          fromY: props.mainLineMoves[moveNumber-1].fromY,
                                          toX: props.mainLineMoves[moveNumber-1].toX,
                                          toY: props.mainLineMoves[moveNumber-1].toY,
                                          pieceType: props.mainLineMoves[moveNumber-1].pieceType,
                                          //isCapture: !!move.capturedPiece,
                                          //isCheck: move.isCheck,
                                          //promotionPiece: move.promotionPiece
                                        })}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <div class={styles.branchContainer}>
                                <div class={styles.branchMoves}>
                                  <div class={styles.branchMoveItem}>
                                    <span class={styles.moveCoords}>
                                      {formatMoveDisplay(branch.firstMove)}
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
