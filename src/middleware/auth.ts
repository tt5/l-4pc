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
    
    // Get the user from the auth token
    const user = await getAuthUser(authEvent.request);
    
    // Require authentication for all requests
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
