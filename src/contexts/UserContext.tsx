import { createContext, useContext, createSignal, Accessor, JSX, onMount } from 'solid-js';

export interface User {
  id: string;
  username: string;
  email?: string;
  gameJoined: boolean;
  homeX: number;
  homeY: number;
  role?: string;
}

const UserContext = createContext<{
  user: Accessor<User | null>;
  setUser: (user: User | null) => void;
  loading: Accessor<boolean>;
}>();

export function UserProvider(props: { children: JSX.Element }) {
  const [user, setUser] = createSignal<User | null>(null);
  const [loading, setLoading] = createSignal(true);

  // Load user from session on mount
  onMount(async () => {
    try {
      const response = await fetch('/api/auth/verify');
      if (response.ok) {
        const data = await response.json();
        if (data.valid && data.user) {
          // Map the verify endpoint response to our User type
          setUser({
            id: data.user.id,
            username: data.user.username,
            gameJoined: false, // This should be updated from game status
            homeX: 0,         // These should be updated from game status
            homeY: 0,         // These should be updated from game status
            role: data.user.role
          });
        }
      }
    } catch (error) {
      console.error('Failed to load user:', error);
    } finally {
      setLoading(false);
    }
  });

  return (
    <UserContext.Provider value={{ user, setUser, loading }}>
      {props.children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
