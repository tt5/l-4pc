import jwt from 'jsonwebtoken';

export interface TokenPayload {
  userId: string;
  username: string;
  role?: 'admin' | 'user';
}

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined in environment variables');
}

// After the check, we know JWT_SECRET is a string
const secret: string = JWT_SECRET;

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, secret);
    // Ensure the decoded token matches our TokenPayload
    if (typeof decoded === 'object' && decoded !== null && 'userId' in decoded && 'username' in decoded) {
      return decoded as TokenPayload;
    }
    return null;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

export function getTokenFromRequest(request: Request): string | null {
  // Try to get token from Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }

  // Try to get token from cookies
  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader) {
    const cookies = new Map(
      cookieHeader.split('; ').map(c => {
        const [key, ...values] = c.split('=');
        return [key, values.join('=')];
      })
    );
    return cookies.get('auth_token') || null;
  }

  return null;
}

export async function getAuthUser(request: Request): Promise<TokenPayload | null> {
  try {
    const token = getTokenFromRequest(request);
    
    if (!token) {
      console.log('No authentication token found in request');
      return null;
    }
    
    const payload = verifyToken(token);
    
    if (!payload) {
      console.warn('Token verification failed');
      return null;
    }
    
    return payload;
    
  } catch (error) {
    console.error('Error in getAuthUser:', error);
    return null;
  }
}
