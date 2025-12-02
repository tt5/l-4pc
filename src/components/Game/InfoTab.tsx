import { Component, Show } from 'solid-js';
import styles from './SidePanel.module.css';

type Notification = {
  id: string | number;
  message: string;
  timestamp: number;
  userId?: string;
  count?: number;
};

type InfoTabProps = {
  username: string;
  totalBasePoints: number | null;
};

const InfoTab: Component<InfoTabProps> = (props) => (
  <div class={styles.infoTab}>
    <h3>Player: {props.username}</h3>
    
    <Show when={props.totalBasePoints !== null}>
      <p>Total base points: {props.totalBasePoints}</p>
    </Show>
  </div>
);

export default InfoTab;
