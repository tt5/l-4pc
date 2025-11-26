import { Component, createSignal, onCleanup, createEffect } from 'solid-js';
import styles from './SidePanel.module.css';
import InfoTab from './InfoTab';
import SettingsTab from './SettingsTab';
import { useSSE } from '../../hooks/useSSE';

type Tab = 'info' | 'settings';

type Notification = {
  id: string | number;
  message: string;
  timestamp: number;
  userId?: string;
  count?: number;
};

interface SidePanelProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  username: string;
  userId: string;
  onLogout: () => void;
}

const SidePanel: Component<SidePanelProps> = (props) => {
  const [isOpen, setIsOpen] = createSignal(false);
  let panelRef: HTMLDivElement | undefined;
  
  // Use the SSE hook
  const {
    isConnected,
    error,
    totalBasePoints,
    oldestPrimeTimestamp,
    notifications,
    addedCount,
    deletedCount,
    oldestPrimeNotification,
    reconnect
  } = useSSE('/api/sse');

  // Log connection status changes
  createEffect(() => {
    console.log(`[SSE] Connection status: ${isConnected() ? 'Connected' : 'Disconnected'}`);
    if (error()) {
      console.error('[SSE] Error:', error());
    }
  });

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  // Close panel when clicking outside
  const handleClickOutside = (event: MouseEvent) => {
    if (panelRef && !panelRef.contains(event.target as Node)) {
      setIsOpen(false);
    }
  };

  // Add click outside listener
  createEffect(() => {
    if (isOpen()) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    
    onCleanup(() => {
      document.removeEventListener('mousedown', handleClickOutside);
    });
  });

  // Close panel when tab changes on mobile
  createEffect(() => {
    if (isOpen()) {
      setIsOpen(false);
    }
  });

  return (
    <div class={`${styles.sidePanel} ${isOpen() ? styles.open : ''}`} ref={panelRef}>
      <div class={styles.tabs}>
        <button
          class={`${styles.tab} ${props.activeTab === 'info' ? styles.active : ''}`}
          onClick={() => props.onTabChange('info')}
        >
          Info
        </button>
        <button
          class={`${styles.tab} ${props.activeTab === 'settings' ? styles.active : ''}`}
          onClick={() => props.onTabChange('settings')}
        >
          Settings
        </button>
      </div>
      
      <div class={styles.content}>
        {props.activeTab === 'info' ? (
          <div>
            <InfoTab 
              username={props.username}
              addedCount={addedCount()}
              deletedCount={deletedCount()}
              totalBasePoints={totalBasePoints}
              oldestPrimeNotification={oldestPrimeNotification()}
            />
          </div>
        ) : (
          <SettingsTab onLogout={props.onLogout} />
        )}
      </div>
      
      <button 
        class={styles.menuToggle} 
        onClick={() => setIsOpen(!isOpen())}
      >
        {isOpen() ? '×' : '☰'}
      </button>
      
      <div 
        class={`${styles.overlay} ${isOpen() ? styles.open : ''}`} 
        onClick={() => setIsOpen(false)}
      />
    </div>
  );
};

export default SidePanel;
