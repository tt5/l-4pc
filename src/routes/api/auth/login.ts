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

    // Create base point if it doesn't exist for this user
    try {
      const basePointRepo = await getBasePointRepository();
      const userBasePoints = await basePointRepo.getByUser(user.id);
      
      if (userBasePoints.length === 0) {
        await basePointRepo.add(user.id, 0, 0);
      }
    } catch (error) {
      console.error('Error initializing base points:', error);
      // Continue with login even if base point initialization fails
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
