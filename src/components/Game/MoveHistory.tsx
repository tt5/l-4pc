import { For, Show, createEffect, createMemo } from 'solid-js';
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
              
              // Use the move's moveNumber if available, otherwise fall back to displayMoveNumber
              // Note: moveNumber is 1-based, currentMoveIndex is 0-based
              const moveNumber = move.moveNumber ?? displayMoveNumber;
              const isCurrentMove = (moveNumber - 1) === props.currentMoveIndex;
              
              const moveClass = `${styles.moveItem} ${isCurrentMove ? styles.currentMove : ''}`;
              
              // Debug info
              console.group(`Move ${displayMoveNumber}`);
              console.log('Move data:', {
                moveNumber,
                isCurrentMove: isCurrentMove ? 'HIGHLIGHTED' : 'not current',
                currentMoveIndex: props.currentMoveIndex,
                move: { from: [fromX, fromY], to: [toX, toY] },
                timestamp: move.timestamp
              });
              if (isCurrentMove) {
                console.log('--- THIS MOVE IS CURRENTLY HIGHLIGHTED ---');
              }
              console.groupEnd();
              
              // Current move is now handled by moveClass
              return (
                <div class={moveClass}>
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
                      <For each={props.branchPoints?.[move.moveNumber ?? index()] || []}>
                        {(branch) => (
                          <div class={styles.branchOption}>
                            <span class={styles.branchName}>{branch.branchName}: </span>
                            {String.fromCharCode(97 + branch.firstMove.fromX)}{branch.firstMove.fromY + 1} → {String.fromCharCode(97 + branch.firstMove.toX)}{branch.firstMove.toY + 1}
                          </div>
                        )}
                      </For>
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
