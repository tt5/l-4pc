# 4-Person Chess (4PC) Project

## Project Overview

This is a web application for playing 4-person chess, built with modern web technologies. The game allows four players to participate in a single chess match, each controlling their own set of pieces.

## Technical Stack

- **Frontend Framework**: SolidJS with TypeScript
- **Routing**: `@solidjs/router` for client-side routing
- **Build Tool**: Vite (via Vinxi)
- **Styling**: CSS with PostCSS and Stylelint for linting
- **Testing**: Vitest for unit tests, Puppeteer for browser testing
- **Database**: SQLite3 with a migration system
- **Authentication**: JWT (JSON Web Tokens) for user authentication

## Code Architecture

### Core Game Components

#### Board Component (`/src/components/Game/Board.tsx`)
- Manages the game board state and rendering
- Handles user interactions (piece selection, moves)
- Integrates with move history and game controls
- Manages game state through SolidJS signals

#### Game Logic (`/src/utils/gameUtils.ts`)
- **Move Validation**: Validates piece movements
- **Legal Moves Calculation**: Determines valid moves for each piece
- **Team Management**: Handles team-based gameplay
- **Board State**: Manages piece positions and game rules

### State Management
- **Local State**: Component-level state for UI interactions
- **Contexts**:
  - `AuthContext`: Manages user authentication state
  - `UserContext`: Handles user data and preferences
  - `RestrictedSquaresContext`: Tracks restricted squares for move validation

### Utilities
- **Board Utilities**: Board-related calculations and transformations
- **Game Utilities**: Core game rules and validations
- **Color Utilities**: Manages team colors and visual representation

### Types and Constants
- **Game Types**: TypeScript interfaces for game objects
- **Constants**: Game configuration and settings

### Data Flow
1. User interacts with the game board
2. Board component validates the move using game utilities
3. If valid, updates the board state
4. Renders the updated game state

### Key Features Implementation
- **Team Play**: Players are assigned to teams with coordinated pieces
- **Move Validation**: Enforces game rules for each piece type
- **Game State Management**: Tracks piece positions and game progress

## Key Features

1. **Team-Based Chess**: Supports 4 players (2 teams of 2) in a single game
2. **User Authentication**: Secure login and user management
3. **Database Integration**: SQLite for data persistence

## Project Structure

- `/src` - Main application source code
  - `/components` - Reusable UI components
  - `/contexts` - React contexts (Auth, User)
  - `/routes` - Application routes and pages
  - `/lib` - Core application logic
  - `/utils` - Utility functions
  - `/types` - TypeScript type definitions
- `/migrations` - Database migration files
- `/public` - Static assets
- `/tests` - Test files
- `/scripts` - Utility scripts for database management

## Development Setup

The project includes several npm scripts for development and maintenance:

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- Database management scripts (migrations, validation)
- Testing commands (unit tests, E2E tests)

## Dependencies

- **Core**: SolidJS, Vinxi, SQLite
- **Styling**: PostCSS, Stylelint
- **Testing**: Vitest, Playwright
- **Build Tools**: TypeScript, Vite

The project follows modern web development practices with a focus on type safety, testing, and maintainability. It's designed to be run in a Node.js environment (v22+).