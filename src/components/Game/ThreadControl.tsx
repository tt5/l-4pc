import { Component } from 'solid-js';
import styles from './ThreadControl.module.css';

interface ThreadControlProps {
  threads: number;
  isLoading: boolean;
  onThreadChange: (threads: number) => void;
}

const ThreadControl: Component<ThreadControlProps> = (props) => {
  const handleChange = (e: Event) => {
    const newThreads = parseInt((e.target as HTMLSelectElement).value, 10);
    if (!isNaN(newThreads) && typeof props.onThreadChange === 'function') {
      props.onThreadChange(newThreads);
    }
  };

  return (
    <div class={styles.threadControl}>
      <label for="threads">Engine Threads:</label>
      <select 
        id="threads" 
        value={props.threads}
        onChange={handleChange}
        disabled={props.isLoading}
        class={styles.threadSelect}
      >
        {[1, 2, 4, 8].map(num => (
          <option value={num}>
            {num} {num === 1 ? 'Thread' : 'Threads'}
          </option>
        ))}
      </select>
      {props.isLoading && <span class={styles.loading}>Updating...</span>}
    </div>
  );
};

export default ThreadControl;
