import { usePlayerPosition } from '~/contexts/PlayerPositionContext';
import './PositionIndicator.css';

export default function PositionIndicator() {
  const { position } = usePlayerPosition();
  
  return (
    <div class="position-indicator">
      Position: ({position()?.[0] ?? 0}, {position()?.[1] ?? 0})
    </div>
  );
}
