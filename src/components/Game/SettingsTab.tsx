import { Component, Show } from 'solid-js';
import styles from './SidePanel.module.css';

interface SettingsTabProps {
  onLogout: () => void;
}

const SettingsTab: Component<SettingsTabProps> = (props) => {
  return (
    <div class={styles.settingsTab}>
      <h3>Settings</h3>
      <div class={styles.settingsContent}>
        <div class={styles.settingGroup}>
          <h4>Account</h4>
          <button 
            class={styles.logoutButton}
            onClick={props.onLogout}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsTab;
