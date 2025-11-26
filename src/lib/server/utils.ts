// Utility functions for server-side operations

export function isServer(): boolean {
  return typeof window === 'undefined';
}

export function assertServer(): void {
  if (!isServer()) {
    throw new Error('This function can only be used on the server');
  }
}

export function jsonResponse(data: any, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });
}
