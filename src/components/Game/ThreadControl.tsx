import { Component, createSignal } from 'solid-js';
import { createEngineClient } from '../../engine/wsClient';
import styles from './ThreadControl.module.css';

const ThreadControl: Component = () => {
  const [threads, setThreads] = createSignal(1);
  const [isLoading, setIsLoading] = createSignal(false);
  const engineClient = createEngineClient();

  const handleThreadChange = async (e: Event) => {
    const newThreads = Number((e.target as HTMLSelectElement).value);
    console.log('[ThreadControl] Thread change initiated. New thread count:', newThreads, 'Current thread count:', threads());
    
    if (newThreads === threads()) {
      console.log('[ThreadControl] No change in thread count, ignoring update.');
      return;
    }
    
    if (isLoading()) {
      console.log('[ThreadControl] Update already in progress, ignoring concurrent request.');
      return;
    }
    
    console.log('[ThreadControl] Starting thread count update...');
    setIsLoading(true);
    
    try {
      console.log('[ThreadControl] Calling engineClient.setThreads with count:', newThreads);
      const success = engineClient.setThreads(newThreads);
      console.log('[ThreadControl] engineClient.setThreads returned:', success);
      
      if (success) {
        console.log('[ThreadControl] Updating local thread state to:', newThreads);
        setThreads(newThreads);
        console.log('[ThreadControl] Thread count updated successfully');
      } else {
        console.warn('[ThreadControl] Failed to update thread count: engineClient.setThreads returned false');
      }
    } catch (error) {
      console.error('[ThreadControl] Error updating thread count:', error);
    } finally {
      console.log('[ThreadControl] Completing update process');
      setIsLoading(false);
    }
  };

  return (
    <div class={styles.threadControl}>
      <label for="threads">Engine Threads:</label>
      <select 
        id="threads" 
        value={threads()}
        onChange={handleThreadChange}
        disabled={isLoading()}
        class={styles.threadSelect}
      >
        {[1, 2, 4, 8].map(num => (
          <option value={num}>
            {num} {num === 1 ? 'Thread' : 'Threads'}
          </option>
        ))}
      </select>
      {isLoading() && <span class={styles.loading}>Updating...</span>}
    </div>
  );
};

export default ThreadControl;
