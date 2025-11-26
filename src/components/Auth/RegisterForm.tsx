import { createSignal } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import styles from './Login.module.css';

export default function RegisterForm() {
  const [username, setUsername] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [error, setError] = createSignal('');
  const [isLoading, setIsLoading] = createSignal(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username(),
          password: password(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      // Redirect to login page after successful registration
      navigate('/login', { state: { registered: true } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div class={styles.loginContainer}>
      <div class={styles.loginForm}>
        <h2>Create an Account</h2>
        
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
              {isLoading() ? 'Creating Account...' : 'Sign Up'}
            </button>
          </div>
        </form>
        
        <div class={styles.footer}>
          <span>Already have an account? </span>
          <A href="/login" class={styles.link}>
            Sign in
          </A>
        </div>
      </div>
    </div>
  );
}
