import { For, Show, createSignal } from 'solid-js';
import styles from './Board.module.css';

type Move = {
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
  const [expandedBranch, setExpandedBranch] = createSignal<number | null>(null);
  
  const hasBranches = (moveIndex: number) => {
    return props.branchPoints && props.branchPoints[moveIndex]?.length > 0;
  };
  
  const toggleBranch = (moveIndex: number) => {
    setExpandedBranch(expandedBranch() === moveIndex ? null : moveIndex);
  };
  
  const currentMove = () => props.moves[props.currentMoveIndex];
  
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
          <For each={[...props.moves].reverse()}>
            {(move, index) => {
              const fromX = move.fromX;
              const fromY = move.fromY;
              const toX = move.toX;
              const toY = move.toY;
              const moveNumber = move.moveNumber ?? (index() + 1);
              const moveTime = move.timestamp ? new Date(move.timestamp).toLocaleTimeString() : 'Unknown time';
              const isNextMove = move.moveNumber === ((currentMove()?.moveNumber ?? -1) + 1);
              
              if (fromX === undefined || fromY === undefined || toX === undefined || toY === undefined) {
                console.warn('Move data is missing required coordinates', move);
              }
              
              return (
                <div 
                  class={`${styles.moveItem} ${isNextMove ? styles.nextMove : ''}`}
                  data-move-number={moveNumber}
                  data-move-index={index()}
                  data-is-next-move={isNextMove}
                >
                  <div 
                    class={styles.colorSwatch} 
                    style={{ 'background-color': move.color }}
                    title={`Player: ${move.playerId || 'Unknown'}\nColor: ${move.color}`}
                  />
                  <div class={styles.moveDetails}>
                    <div class={styles.moveHeader}>
                      <span class={styles.moveNumber}>Move {moveNumber}</span>
                      <span class={styles.moveTime}>{moveTime}</span>
                    </div>
                    <div class={styles.moveCoords}>
                      {String.fromCharCode(97 + fromX)}{fromY + 1} → {String.fromCharCode(97 + toX)}{toY + 1}
                      {hasBranches(move.moveNumber ?? index()) && (
                        <>
                          <span 
                            class={styles.branchIndicator} 
                            title="Show alternative moves"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleBranch(move.moveNumber ?? index());
                            }}
                          >
                            ↳
                          </span>
                          {expandedBranch() === (move.moveNumber ?? index()) && (
                            <div class={styles.branchDropdown}>
                              <For each={props.branchPoints?.[move.moveNumber ?? index()] || []}>
                                {(branch) => (
                                  <div class={styles.branchOption}>
                                    {String.fromCharCode(97 + branch.firstMove.fromX)}{branch.firstMove.fromY + 1} → {String.fromCharCode(97 + branch.firstMove.toX)}{branch.firstMove.toY + 1}
                                    <span class={styles.branchName}>({branch.branchName})</span>
                                  </div>
                                )}
                              </For>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {move.playerId && (
                      <div class={styles.movePlayer} title={move.playerId}>
                        Player: {move.playerId.substring(0, 6)}...
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
