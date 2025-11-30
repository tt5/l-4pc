import { type Component } from 'solid-js';

interface ChessPieceProps {
  color?: string;
  class?: string;
}

export const King: Component<ChessPieceProps> = (props) => (
  <svg 
    viewBox="0 0 100 100" 
    class={props.class}
    style={`fill: ${props.color || 'currentColor'};`}
  >
    <path d="M50,10 L60,30 L75,30 L65,45 L70,60 L50,50 L30,60 L35,45 L25,30 L40,30 Z" />
    <path d="M35,65 L65,65 L65,75 C65,80 60,85 50,85 C40,85 35,80 35,75 Z" />
  </svg>
);

export const Queen: Component<ChessPieceProps> = (props) => (
  <svg 
    viewBox="0 0 100 100" 
    class={props.class}
    style={`fill: ${props.color || 'currentColor'};`}
  >
    <circle cx="50" cy="30" r="15" />
    <path d="M30,40 L70,40 L65,80 L35,80 Z" />
    <path d="M25,40 L30,40 L35,80 L25,80 Z" />
    <path d="M70,40 L75,40 L75,80 L65,80 Z" />
  </svg>
);
