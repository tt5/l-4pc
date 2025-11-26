/**
 * Safely gets an environment variable that works in both server and client contexts
 */
export function getEnvVar(key: string, defaultValue: string = ''): string {
  if (typeof window === 'undefined') {
    // Server-side
    return process.env[key] ?? defaultValue;
  } else {
    // Client-side - check URL params first, then localStorage, then meta tag
    const params = new URLSearchParams(window.location.search);
    const paramValue = params.get(key);
    if (paramValue !== null) {
      return paramValue;
    }
    
    const storedValue = localStorage.getItem(key);
    if (storedValue !== null) {
      return storedValue;
    }
    
    const metaTag = document.querySelector(`meta[name="${key}"]`) as HTMLMetaElement | null;
    return metaTag?.content ?? defaultValue;
  }
}

/**
 * Sets an environment variable in the client
 */
export function setClientEnvVar(key: string, value: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, value);
    // Also update URL params without reloading
    const url = new URL(window.location.href);
    url.searchParams.set(key, value);
    window.history.replaceState({}, '', url);
  }
}
