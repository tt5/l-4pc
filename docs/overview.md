# 4PC - A Strategic Board Game

## Project Purpose
4PC is a turn-based strategic board game where players compete to control territories on a grid-based board. The game features real-time multiplayer functionality, user authentication, and an interactive game board with drag-and-drop mechanics.

## Game Overview
- **Board**: 14x14 grid with non-playable corner zones
- **Players**: 2-4 players (Red, Blue, Yellow, Green)
- **Objective**: Strategically place and move pieces to control the board
- **Turn-based**: Players take turns to make their moves

## Core Features
- **User Authentication**: Secure login/registration system
- **Interactive Game Board**: Drag-and-drop interface for moving pieces
- **Real-time Updates**: Live game state synchronization between players
- **Game Rules**: Enforced game mechanics and move validation
- **Responsive Design**: Works on desktop and tablet devices

## Technical Highlights
- **Frontend**: Built with SolidJS for reactive UI components
- **State Management**: Context API for global state and game data
- **Real-time**: Server-Sent Events (SSE) for live updates
- **Type Safety**: Full TypeScript support
- **Testing**: Comprehensive test suite with Vitest

## Project Structure
- `/src`
  - `/components` - Reusable UI components
  - `/contexts` - State management
  - `/routes` - Application pages and routing
  - `/constants` - Game configuration and constants
  - `/hooks` - Custom React hooks
  - `/lib` - Server-side logic and utilities
  - `/types` - TypeScript type definitions
  - `/utils` - Helper functions and utilities
- `/tests` - Unit and integration tests
- `/migrations` - Database schema migrations
- `/public` - Static assets and media files

## Getting Started
1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables (copy `.env.example` to `.env`)
4. Initialize the database: `npm run db:init`
5. Start the development server: `npm run dev`
6. Open `http://localhost:3000` in your browser

## Requirements
- Node.js 22 or higher
- SQLite database
- Modern web browser with JavaScript enabled

## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.