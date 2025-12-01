import type { APIEvent } from '@solidjs/start/server';
import { getDb, getBasePointRepository } from '~/lib/server/db';
import { generateToken } from '~/lib/server/auth/jwt';
import { serialize } from 'cookie';
import { randomBytes } from 'crypto';

function json(data: any, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

type LoginRequest = {
  username: string;
  password: string; // In a real app, verify hashed password
};

export async function POST({ request }: APIEvent) {
  try {
    const requestData = await request.json();
    
    const { username, password } = requestData as LoginRequest;
    
    if (!username || !password) {
      return json(
        { error: 'Username and password are required' }, 
        { status: 400 }
      );
    }

    const db = await getDb();
    
    // In a real app, verify password hash
    let user = await db.get<{ id: string, username: string }>(
      'SELECT id, username FROM users WHERE username = ?',
      [username]
    );
    
    if (!user) {
      // For development, create the user if it doesn't exist
      if (process.env.NODE_ENV !== 'production') {
        const userId = `user_${randomBytes(16).toString('hex')}`;
        await db.run(
          'INSERT INTO users (id, username) VALUES (?, ?)',
          [userId, username]
        );
        user = { id: userId, username };
      } else {
        return json(
          { error: 'Invalid credentials' },
          { status: 401 }
        );
      }
    }

    // Ensure all four base points exist for the user
    try {
      const basePointRepo = await getBasePointRepository();
      const userBasePoints = await basePointRepo.getByUser(user.id);
      
      if (userBasePoints.length === 0) {
        // Add all base points if none exist with specific colors and piece types
        // Yellow pieces (top)
        await basePointRepo.add(user.id, 7, 0, '#FFEB3B', 'queen');  // Yellow Queen
        await basePointRepo.add(user.id, 8, 0, '#FFEB3B', 'bishop'); // Yellow Queen's Bishop
        await basePointRepo.add(user.id, 6, 0, '#FFEB3B', 'king');   // Yellow King
        await basePointRepo.add(user.id, 5, 0, '#FFEB3B', 'bishop'); // Yellow King's Bishop
        await basePointRepo.add(user.id, 4, 0, '#FFEB3B', 'knight'); // Yellow Queen's Knight
        await basePointRepo.add(user.id, 9, 0, '#FFEB3B', 'knight'); // Yellow King's Knight
        await basePointRepo.add(user.id, 3, 0, '#FFEB3B', 'rook');   // Yellow Queen's Rook
        await basePointRepo.add(user.id, 10, 0, '#FFEB3B', 'rook');  // Yellow King's Rook
        await basePointRepo.add(user.id, 7, 1, '#FFEB3B', 'pawn');   // Yellow Queen's Pawn
        await basePointRepo.add(user.id, 6, 1, '#FFEB3B', 'pawn');   // Yellow King's Pawn
        await basePointRepo.add(user.id, 8, 1, '#FFEB3B', 'pawn');   // Yellow Queen's Bishop's Pawn
        await basePointRepo.add(user.id, 5, 1, '#FFEB3B', 'pawn');   // Yellow King's Bishop's Pawn
        await basePointRepo.add(user.id, 4, 1, '#FFEB3B', 'pawn');   // Yellow Queen's Knight's Pawn
        await basePointRepo.add(user.id, 9, 1, '#FFEB3B', 'pawn');   // Yellow King's Knight's Pawn
        await basePointRepo.add(user.id, 3, 1, '#FFEB3B', 'pawn');   // Yellow Queen's Rook's Pawn
        await basePointRepo.add(user.id, 10, 1, '#FFEB3B', 'pawn');  // Yellow King's Rook's Pawn
        
        // Red pieces (bottom)
        await basePointRepo.add(user.id, 6, 13, '#F44336', 'queen'); // Red Queen
        await basePointRepo.add(user.id, 5, 13, '#F44336', 'bishop');// Red Queen's Bishop
        await basePointRepo.add(user.id, 7, 13, '#F44336', 'king');  // Red King
        await basePointRepo.add(user.id, 8, 13, '#F44336', 'bishop');// Red King's Bishop
        await basePointRepo.add(user.id, 4, 13, '#F44336', 'knight');// Red Queen's Knight
        await basePointRepo.add(user.id, 9, 13, '#F44336', 'knight');// Red King's Knight
        await basePointRepo.add(user.id, 3, 13, '#F44336', 'rook');  // Red Queen's Rook
        await basePointRepo.add(user.id, 10, 13, '#F44336', 'rook'); // Red King's Rook
        await basePointRepo.add(user.id, 6, 12, '#F44336', 'pawn');  // Red Queen's Pawn
        await basePointRepo.add(user.id, 7, 12, '#F44336', 'pawn');  // Red King's Pawn
        await basePointRepo.add(user.id, 5, 12, '#F44336', 'pawn');  // Red Queen's Bishop's Pawn
        await basePointRepo.add(user.id, 8, 12, '#F44336', 'pawn');  // Red King's Bishop's Pawn
        await basePointRepo.add(user.id, 4, 12, '#F44336', 'pawn');  // Red Queen's Knight's Pawn
        await basePointRepo.add(user.id, 9, 12, '#F44336', 'pawn');  // Red King's Knight's Pawn
        await basePointRepo.add(user.id, 3, 12, '#F44336', 'pawn');  // Red Queen's Rook's Pawn
        await basePointRepo.add(user.id, 10, 12, '#F44336', 'pawn'); // Red King's Rook's Pawn
        
        // Blue pieces (left)
        await basePointRepo.add(user.id, 0, 6, '#2196F3', 'queen');  // Blue Queen
        await basePointRepo.add(user.id, 0, 5, '#2196F3', 'bishop'); // Blue Queen's Bishop
        await basePointRepo.add(user.id, 0, 7, '#2196F3', 'king');   // Blue King
        await basePointRepo.add(user.id, 0, 8, '#2196F3', 'bishop'); // Blue King's Bishop
        await basePointRepo.add(user.id, 0, 4, '#2196F3', 'knight'); // Blue Queen's Knight
        await basePointRepo.add(user.id, 0, 9, '#2196F3', 'knight'); // Blue King's Knight
        await basePointRepo.add(user.id, 0, 3, '#2196F3', 'rook');   // Blue Queen's Rook
        await basePointRepo.add(user.id, 0, 10, '#2196F3', 'rook');  // Blue King's Rook
        await basePointRepo.add(user.id, 1, 6, '#2196F3', 'pawn');   // Blue Queen's Pawn
        await basePointRepo.add(user.id, 1, 7, '#2196F3', 'pawn');   // Blue King's Pawn
        await basePointRepo.add(user.id, 1, 5, '#2196F3', 'pawn');   // Blue Queen's Bishop's Pawn
        await basePointRepo.add(user.id, 1, 8, '#2196F3', 'pawn');   // Blue King's Bishop's Pawn
        await basePointRepo.add(user.id, 1, 4, '#2196F3', 'pawn');   // Blue Queen's Knight's Pawn
        await basePointRepo.add(user.id, 1, 9, '#2196F3', 'pawn');   // Blue King's Knight's Pawn
        await basePointRepo.add(user.id, 1, 3, '#2196F3', 'pawn');   // Blue Queen's Rook's Pawn
        await basePointRepo.add(user.id, 1, 10, '#2196F3', 'pawn');  // Blue King's Rook's Pawn
        
        // Green pieces (right)
        await basePointRepo.add(user.id, 13, 7, '#4CAF50', 'queen'); // Green Queen
        await basePointRepo.add(user.id, 13, 8, '#4CAF50', 'bishop');// Green Queen's Bishop
        await basePointRepo.add(user.id, 13, 6, '#4CAF50', 'king');  // Green King
        await basePointRepo.add(user.id, 13, 5, '#4CAF50', 'bishop');// Green King's Bishop
        await basePointRepo.add(user.id, 13, 4, '#4CAF50', 'knight');// Green Queen's Knight
        await basePointRepo.add(user.id, 13, 9, '#4CAF50', 'knight');// Green King's Knight
        await basePointRepo.add(user.id, 13, 3, '#4CAF50', 'rook');  // Green Queen's Rook
        await basePointRepo.add(user.id, 13, 10, '#4CAF50', 'rook'); // Green King's Rook
        await basePointRepo.add(user.id, 12, 7, '#4CAF50', 'pawn');  // Green Queen's Pawn
        await basePointRepo.add(user.id, 12, 6, '#4CAF50', 'pawn');  // Green King's Pawn
        await basePointRepo.add(user.id, 12, 8, '#4CAF50', 'pawn');  // Green Queen's Bishop's Pawn
        await basePointRepo.add(user.id, 12, 5, '#4CAF50', 'pawn');  // Green King's Bishop's Pawn
        await basePointRepo.add(user.id, 12, 4, '#4CAF50', 'pawn');  // Green Queen's Knight's Pawn
        await basePointRepo.add(user.id, 12, 9, '#4CAF50', 'pawn');  // Green King's Knight's Pawn
        await basePointRepo.add(user.id, 12, 3, '#4CAF50', 'pawn');  // Green Queen's Rook's Pawn
        await basePointRepo.add(user.id, 12, 10, '#4CAF50', 'pawn'); // Green King's Rook's Pawn
        await basePointRepo.add(user.id, 12, 5, '#4CAF50', 'pawn');  // Green Bishop's Pawn
      } else if (userBasePoints.length < 4) {
        // If some base points exist but not all, add the missing ones
        const existingPoints = new Set(userBasePoints.map(p => `${p.x},${p.y}`));
        const requiredPoints = [
          // Yellow pieces (top)
          { x: 7, y: 0, color: '#FFEB3B' },   // Yellow Queen
          { x: 8, y: 0, color: '#FFEB3B' },   // Yellow Queen's Bishop
          { x: 6, y: 0, color: '#FFEB3B' },   // Yellow King
          { x: 5, y: 0, color: '#FFEB3B' },   // Yellow King's Bishop
          // Red pieces (bottom)
          { x: 6, y: 13, color: '#F44336' },  // Red Queen
          { x: 5, y: 13, color: '#F44336' },  // Red Queen's Bishop
          { x: 7, y: 13, color: '#F44336' },  // Red King
          { x: 8, y: 13, color: '#F44336' },  // Red King's Bishop
          // Blue pieces (left)
          { x: 0, y: 6, color: '#2196F3' },   // Blue Queen
          { x: 0, y: 5, color: '#2196F3' },   // Blue Queen's Bishop
          { x: 0, y: 7, color: '#2196F3' },   // Blue King
          { x: 0, y: 8, color: '#2196F3' },   // Blue King's Bishop
          // Green pieces (right)
          { x: 13, y: 7, color: '#4CAF50' },  // Green Queen
          { x: 13, y: 8, color: '#4CAF50' },  // Green Queen's Bishop
          { x: 13, y: 6, color: '#4CAF50' },  // Green King
          { x: 13, y: 5, color: '#4CAF50' }   // Green King's Bishop
        ];

        for (const point of requiredPoints) {
          const pointKey = `${point.x},${point.y}`;
          if (!existingPoints.has(pointKey)) {
            await basePointRepo.add(user.id, point.x, point.y, point.color);
          }
        }
      }
    } catch (error) {
      console.error('Error initializing base points:', error);
      // Continue with login even if base points initialization fails
    }

    const token = generateToken({
      userId: user.id,
      username: user.username
    });

    // Set HTTP-only cookie
    const cookie = serialize('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return json(
      { 
        user: { 
          id: user.id, 
          username: user.username 
        } 
      },
      { 
        status: 200,
        headers: {
          'Set-Cookie': cookie
        }
      }
    );
  } catch (error) {
    console.error('Login error:', error);
    return json(
      { error: 'Failed to log in' },
      { status: 500 }
    );
  }
}
