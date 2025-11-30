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
        // Yellow pieces
        await basePointRepo.add(user.id, 7, 0, '#FFEB3B', 'queen');  // Yellow Queen
        await basePointRepo.add(user.id, 6, 0, '#FFEB3B', 'king');   // Yellow King
        
        // Red pieces
        await basePointRepo.add(user.id, 6, 13, '#F44336', 'queen'); // Red Queen
        await basePointRepo.add(user.id, 7, 13, '#F44336', 'king');  // Red King
        
        // Blue pieces
        await basePointRepo.add(user.id, 0, 6, '#2196F3', 'queen');  // Blue Queen
        await basePointRepo.add(user.id, 0, 7, '#2196F3', 'king');   // Blue King
        
        // Green pieces
        await basePointRepo.add(user.id, 13, 7, '#4CAF50', 'queen'); // Green Queen
        await basePointRepo.add(user.id, 13, 6, '#4CAF50', 'king');  // Green King
      } else if (userBasePoints.length < 4) {
        // If some base points exist but not all, add the missing ones
        const existingPoints = new Set(userBasePoints.map(p => `${p.x},${p.y}`));
        const requiredPoints = [
          { x: 7, y: 0, color: '#FFEB3B' },   // Center top - Yellow
          { x: 13, y: 7, color: '#4CAF50' },  // Center right - Green
          { x: 6, y: 13, color: '#F44336' },  // Center bottom - Red
          { x: 0, y: 6, color: '#2196F3' }    // Center left - Blue
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
