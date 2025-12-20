import { Component, Show } from 'solid-js';
import styles from './SidePanel.module.css';

type InfoTabProps = {
  username: string;
};

const InfoTab: Component<InfoTabProps> = (props) => (
  <div class={styles.infoTab}>
    <h3>Player: {props.username}</h3>
  </div>
);

export default InfoTab;
