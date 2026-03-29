import type { APIEvent } from "@solidjs/start/server";
import { jsonResponse } from '~/lib/server/utils';

export async function POST({ request }: APIEvent) {
  // JWT-only auth - no cookies to clear
  // Client will handle token removal
  
  return jsonResponse({ 
    success: true, 
    message: 'Successfully logged out' 
  });
}
