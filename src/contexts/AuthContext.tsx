import { createContext, createEffect, createSignal, useContext, type ParentComponent } from 'solid-js';
import { getEnvVar } from '../lib/utils/env';
import type { User, NullableUser } from '../types/user';

interface AuthStore {
  user: () => NullableUser;
  login: (username: string, password: string) => Promise<NullableUser>;
  logout: () => Promise<void>;
  isInitialized: () => boolean;
  getToken: () => string | null;
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

  // Initialize auth state
  createEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    // Set DISABLE_DEV_USER in localStorage if it's in the environment
    const disableDevUser = import.meta.env.VITE_DISABLE_DEV_USER === 'true' || 
                         process.env.DISABLE_DEV_USER === 'true';
    
    if (disableDevUser) {
      localStorage.setItem('DISABLE_DEV_USER', 'true');
    }
    
    const isDev = typeof import.meta.env.DEV !== 'undefined' ? import.meta.env.DEV : process.env.NODE_ENV !== 'production';
    
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
    } else {
    }
    
    // If we get here, either there's no saved user or there was an error
    setIsInitialized(true);
    
  });
  

// Function to verify the current session
  const verifySession = async (savedUser: NullableUser) => {
    try {
      setIsInitialized(false);
      
      const response = await fetch('/api/auth/verify', {
        method: 'GET',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      const data = await response.json();
      
      if (data.valid && data.user) {
        console.log('Session verified:', data.user);
        return {
          user,
          isInitialized,
          login: async (username: string, password: string) => {
            try {
              const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ 
                  username, 
                  password
                })
              });

              const data = await response.json();
              
              if (!response.ok) {
                throw new Error(data?.error || 'Login failed');
              }

              if (!data.user) {
                throw new Error('Invalid server response: missing user data');
              }
              
              updateUser(data.user);
              return data.user;
            } catch (error) {
              console.error('Login error:', error);
              throw error;
            }
          },
          logout: async () => {
            try {
              const response = await fetch('/api/auth/logout', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
              });
              
              if (!response.ok) {
                throw new Error('Logout failed');
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
          }
        };
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
      
  const login = async (username: string, password: string) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          username, 
          password
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data?.error || 'Login failed');
      }

      if (!data.user) {
        throw new Error('Invalid server response: missing user data');
      }
      
      updateUser(data.user);
      return data.user;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      // First, leave the game if the user is in a game
      try {
        const gameResponse = await fetch('/api/game/leave', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include'
        });
        
        if (!gameResponse.ok) {
          console.warn('Failed to leave game before logout:', await gameResponse.text());
          // Continue with logout even if leaving game fails
        } else {
          console.log('Successfully left game before logout');
        }
      } catch (gameError) {
        console.warn('Error leaving game before logout:', gameError);
        // Continue with logout even if leaving game fails
      }
      
      // Then proceed with normal logout
      const response = await fetch('/api/auth/logout', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Logout failed');
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
    getToken
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
