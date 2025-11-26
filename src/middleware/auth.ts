import type { APIEvent } from '@solidjs/start/server';
import { jsonResponse } from '~/lib/server/utils';
import type { TokenPayload } from '~/lib/server/auth/jwt';
import { getAuthUser } from '~/lib/server/auth/jwt';

type AuthResponse = 
  | { user: TokenPayload }
  | Response;

export async function requireAuth(event: APIEvent): Promise<AuthResponse> {
  const user = await getAuthUser(event.request);
  if (!user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  return { user };
}

// Extend the APIEvent type to include the user in locals
type AuthenticatedAPIEvent = APIEvent & {
  locals: {
    user?: TokenPayload;
    [key: string]: any;
  };
};

export function withAuth(handler: (event: AuthenticatedAPIEvent & { user: TokenPayload }) => Promise<Response>) {
  return async (event: APIEvent): Promise<Response> => {
    // Cast to our extended type
    const authEvent = event as AuthenticatedAPIEvent;
    
    // For SSE connections, we want to allow anonymous access but still pass the user if available
    const isSSE = authEvent.request.headers.get('accept') === 'text/event-stream';
    
    // For all requests, try to get the user from the auth token
    const user = await getAuthUser(authEvent.request);
    
    if (isSSE) {
      
      // Ensure user is set in locals for SSE connections
      if (user) {
        if (!authEvent.locals) authEvent.locals = {};
        authEvent.locals.user = user;
      }
      
      // For SSE, we always want to call the handler, but with the user if available
      return handler({ 
        ...authEvent, 
        user: user || { userId: 'anonymous', username: 'anonymous' },
        locals: {
          ...authEvent.locals,
          user: user || { userId: 'anonymous', username: 'anonymous' }
        }
      });
    }
    
    // For non-SSE requests, require authentication
    if (!user) {
      console.warn('[Auth] Unauthorized access attempt');
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    
    
    // Ensure user is set in locals for authenticated requests
    if (!authEvent.locals) authEvent.locals = {};
    authEvent.locals.user = user;
    
    return handler({ 
      ...authEvent, 
      user,
      locals: {
        ...authEvent.locals,
        user
      }
    });
  };
}
