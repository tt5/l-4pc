import { Component, createSignal } from 'solid-js';
import { createEngineClient } from '../../engine/wsClient';
import styles from './ThreadControl.module.css';

const ThreadControl: Component = () => {
  const [threads, setThreads] = createSignal(1);
  const [isLoading, setIsLoading] = createSignal(false);
  const engineClient = createEngineClient();

  const handleThreadChange = async (e: Event) => {
    const newThreads = Number((e.target as HTMLSelectElement).value);
    if (newThreads !== threads() && !isLoading()) {
      setIsLoading(true);
      try {
        const success = engineClient.setThreads(newThreads);
        if (success) {
          setThreads(newThreads);
        }
      } catch (error) {
        console.error('Failed to update thread count:', error);
      } finally {
        setIsLoading(false);
      }
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
          <option value={num} key={num}>
            {num} {num === 1 ? 'Thread' : 'Threads'}
          </option>
        ))}
      </select>
      {isLoading() && <span class={styles.loading}>Updating...</span>}
    </div>
  );
};

export default ThreadControl;
