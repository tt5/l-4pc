# 4PC - A Strategic Board Game

## Project Overview
4PC is an advanced analysis and training tool designed for the strategic board game 4PC. It allows you to control all four colors (Red, Blue, Yellow, and Green) to study board positions, test strategies, and improve your understanding of the game. This tool provides deep insights into territory control, piece interactions, and strategic planning in a turn-based environment.

## Core Features
- **Analysis Mode**: Study and analyze different board positions
- **Training Tool**: Practice and refine strategies by controlling all four colors
- **Turn Simulation**: Step through moves in any order to explore variations
- **Position Evaluation**: Get insights into board control and piece values

## Board & Interface
- **Game Board**: 14x14 grid with non-playable corner zones
- **Color Control**: Manage all four colors (Red, Blue, Yellow, Green)
- **Move Tracking**: Review and analyze move sequences
- **Position Setup**: Create custom starting positions for study

## Key Features
- **Strategic Analysis**: Study and understand complex board positions
- **Training Focus**: Improve your skills through deliberate practice
- **Interactive Interface**: Intuitive drag-and-drop controls
- **User Accounts**: Track stats and game history
- **Responsive Design**: Play on desktop or tablet devices

## Technical Implementation
- **Frontend**: Built with SolidJS for high-performance UI
- **State Management**: Context API for efficient state handling
- **Real-time Sync**: Server-Sent Events for live game updates
- **Type Safety**: Full TypeScript support for reliable code
- **Testing**: Comprehensive test suite using Vitest

## Project Structure
```
/src
  /components  # Reusable UI components
  /contexts   # State management
  /routes     # Application pages
  /constants  # Game configuration
  /hooks      # Custom React hooks
  /lib        # Server-side logic
  /types      # TypeScript definitions
  /utils      # Helper functions
/tests        # Test files
/migrations   # Database migrations
/public      # Static assets
```

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