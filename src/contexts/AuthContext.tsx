import { createContext, createEffect, createSignal, onMount, useContext, type ParentComponent } from 'solid-js';
import { getEnvVar } from '../lib/utils/env';
import type { User, NullableUser } from '../types/user';
import { makeApiCall, parseApiResponse } from '../utils/clientApi';

interface AuthStore {
  user: () => NullableUser;
  login: (username: string, password: string) => Promise<NullableUser>;
  logout: () => Promise<void>;
  isInitialized: () => boolean;
  getToken: () => string | null;
  updateUser: (userData: User) => void;
}

const AuthContext = createContext<AuthStore>();
// Generate a secure random user ID using crypto.getRandomValues
// This matches the server-side implementation in the registration endpoint
const createRandomId = (prefix: string = 'id'): string => {
  // Generate 16 random bytes (32 hex characters)
  const randomBytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(randomBytes);
  } else {
    // Fallback for environments without crypto.getRandomValues (shouldn't happen in modern browsers)
    console.warn('crypto.getRandomValues not available, using Math.random() fallback');
    for (let i = 0; i < 16; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return `${prefix}_` + Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
};

const createUserId = (): string => createRandomId('user');

const createAuthStore = (): AuthStore => {
  const [user, setUser] = createSignal<User | null>(null);
  const [isInitialized, setIsInitialized] = createSignal(false);
  const updateUser = (userData: User | null) => {
    setUser(userData);
    if (typeof window !== 'undefined') {
      if (userData) {
        sessionStorage.setItem('user', JSON.stringify(userData));
      } else {
        sessionStorage.removeItem('user');
      }
    }
  };

// Function to verify the current session
  const verifySession = async (savedUser: NullableUser) => {
    try {
      setIsInitialized(false);
      
      const token = savedUser?.token;
      if (!token) {
        console.log('No token available for session verification');
        updateUser(null);
        return;
      }
      
      const response = await makeApiCall('/api/auth/verify', {
        method: 'GET',
        headers: { 
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      }, token);

      const data = await parseApiResponse(response, 'verify-session');
      
      if (data.data?.valid && data.data.user) {
        console.log('Session verified:', data.data.user);
        updateUser({
          ...data.data.user,
          token: data.data.user.token || savedUser?.token
        });
      } else {
        console.log('No valid session found');
        updateUser(null);
        // Clear any stale session data
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('user');
        }
      }
    } catch (error) {
      console.error('Session verification error:', error);
      updateUser(null);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('user');
      }
    } finally {
      setIsInitialized(true);
    }
  };

  // Initialize auth state once on mount
onMount(() => {
  if (typeof window === 'undefined') {
    return;
  }

  // Check for saved user first
  const savedUser = typeof window !== 'undefined' ? sessionStorage.getItem('user') : null;
  
  if (savedUser) {
    try {
      const parsed = JSON.parse(savedUser);
      
      // Handle both formats: { user: { id, username } } and { id, username }
      const userData = parsed.user || parsed;
      
      if (userData && typeof userData === 'object' && userData.id) {
        updateUser(userData);
        
        // Verify the session is still valid
        verifySession(userData);
      } else {
        // Clear invalid user data
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('user');
        }
      }
    } catch (error) {
      updateUser(null);
      // Clear corrupted user data
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('user');
      }
    }
  }
  
  // Mark as initialized
  setIsInitialized(true);
});

      
  const login = async (username: string, password: string) => {
    try {
      const response = await makeApiCall('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ 
          username, 
          password
        })
      });

      const data = await parseApiResponse(response, 'login');
      
      if (!data.data?.user) {
        throw new Error('Invalid server response: missing user data');
      }
      
      updateUser(data.data.user);
      return data.data.user;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      const token = getToken();
      
      // First, leave the game if the user is in a game
      if (token) {
        try {
          const gameResponse = await makeApiCall('/api/game/leave', {
            method: 'POST'
          }, token);
          
          const gameData = await parseApiResponse(gameResponse, 'leave-game');
          console.log('Successfully left game before logout');
        } catch (gameError) {
          console.warn('Error leaving game before logout:', gameError);
          // Continue with logout even if leaving game fails
        }
      }
      
      // Then proceed with normal logout
      if (token) {
        const response = await makeApiCall('/api/auth/logout', { 
          method: 'POST'
        }, token);
        
        const data = await parseApiResponse(response, 'logout');
      }
      
      // Clear the user from local storage and state
      updateUser(null);
      
      // Force a full page reload to clear any application state
      window.location.href = '/';
    } catch (error) {
      // Even if the API call fails, clear the user from state
      updateUser(null);
      window.location.href = '/';
    }
  };

  // Add method to get the current auth token
  const getToken = (): string | null => {
    const currentUser = user();
    return currentUser?.token || null;
  };

  return {
    user,
    login,
    logout,
    isInitialized,
    getToken,
    updateUser
  };
};

export const AuthProvider: ParentComponent = (props) => (
  <AuthContext.Provider value={createAuthStore()}>
    {props.children}
  </AuthContext.Provider>
);

export const useAuth = (): AuthStore => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
