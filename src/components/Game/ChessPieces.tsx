import { type Component } from 'solid-js';

interface ChessPieceProps {
  color?: string;
  class?: string;
}

export const King: Component<ChessPieceProps> = (props) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="45" 
    height="45"
    viewBox="0 0 45 45"
    class={props.class}
  >
    <g 
      fill={props.color || 'currentColor'} 
      fill-rule="evenodd" 
      stroke="#000" 
      stroke-linecap="round" 
      stroke-linejoin="round" 
      stroke-width="1.5"
    >
      <path d="M22.5 11.63V6M20 8h5"/>
      <path stroke-linecap="butt" d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5"/>
      <path d="M12.5 37c5.5 3.5 14.5 3.5 20 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5v7"/>
      <path d="M12.5 30c5.5-3 14.5-3 20 0m-20 3.5c5.5-3 14.5-3 20 0m-20 3.5c5.5-3 14.5-3 20 0"/>
    </g>
  </svg>
);

export const Queen: Component<ChessPieceProps> = (props) => (
  <svg 
    viewBox="0 0 45 45" 
    class={props.class}
    style={`fill: ${props.color || '#ffffff'}; stroke: #000000; stroke-width: 1.5; stroke-linejoin: round;`}
  >
    <path d="M 9,26 C 17.5,24.5 30,24.5 36,26 L 38.5,13.5 L 31,25 L 30.7,10.9 L 25.5,24.5 L 22.5,10 L 19.5,24.5 L 14.3,10.9 L 14,25 L 6.5,13.5 L 9,26 z"/>
    <path d="M 9,26 C 9,28 10.5,28 11.5,30 C 12.5,31.5 12.5,31 12,33.5 C 10.5,34.5 11,36 11,36 C 9.5,37.5 11,38.5 11,38.5 C 17.5,39.5 27.5,39.5 34,38.5 C 34,38.5 35.5,37.5 34,36 C 34,36 34.5,34.5 33,33.5 C 32.5,31 32.5,31.5 33.5,30 C 34.5,28 36,28 36,26 C 27.5,24.5 17.5,24.5 9,26 z"/>
    <path d="M 11.5,30 C 15,29 30,29 33.5,30" style="fill:none"/>
    <path d="M 12,33.5 C 18,32.5 27,32.5 33,33.5" style="fill:none"/>
    <circle cx="6" cy="12" r="2" />
    <circle cx="14" cy="9" r="2" />
    <circle cx="22.5" cy="8" r="2" />
    <circle cx="31" cy="9" r="2" />
    <circle cx="39" cy="12" r="2" />
  </svg>
);
