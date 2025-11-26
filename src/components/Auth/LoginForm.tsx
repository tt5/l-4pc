import { createSignal } from 'solid-js';
import { A, useNavigate, useLocation } from '@solidjs/router';
import { useAuth } from '../../contexts/AuthContext';
import styles from './Login.module.css';

interface LocationState {
  registered?: boolean;
}

export default function LoginForm() {
  const [username, setUsername] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [error, setError] = createSignal('');
  const [isLoading, setIsLoading] = createSignal(false);
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();

  // Check for registration success message
  const registered = (location.state as LocationState)?.registered;

  // Get return URL from query parameters or default to '/game'
  const getReturnUrl = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('returnUrl') || '/game';
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // Use the auth context's login function which handles the API call
      await auth.login(username(), password());
      
      // Redirect to the return URL or game page after successful login
      const returnUrl = getReturnUrl();
      navigate(returnUrl, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div class={styles.loginContainer}>
      <div class={styles.loginForm}>
        <h2>Sign In</h2>
        
        {registered && (
          <div class={styles.successMessage}>
            Registration successful! Please sign in.
          </div>
        )}
        
        {error() && (
          <div class={styles.errorMessage}>
            {error()}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div>
            <label for="username">
              Username
            </label>
            <input
              type="text"
              id="username"
              value={username()}
              onInput={(e) => setUsername(e.currentTarget.value)}
              required
            />
          </div>
          
          <div>
            <label for="password">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              required
            />
          </div>
          
          <div>
            <button
              type="submit"
              disabled={isLoading()}
              class={isLoading() ? styles.buttonLoading : ''}
            >
              {isLoading() ? 'Signing in...' : 'Sign In'}
            </button>
          </div>
        </form>
        
        <div class={styles.footer}>
          <p>
            Don't have an account?{' '}
            <A href="/register" class={styles.link}>
              Register here
            </A>
          </p>
        </div>
      </div>
    </div>
  );
}
