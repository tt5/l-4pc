import type { APIEvent } from "@solidjs/start/server";
import { jsonResponse } from '~/lib/server/utils';
import { serialize } from 'cookie';

export async function POST({ request }: APIEvent) {
  // Create an expired cookie to clear the auth token
  const cookie = serialize('auth_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    expires: new Date(0), // Set to past date to expire the cookie
  });

  return new Response(
    JSON.stringify({ success: true, message: 'Successfully logged out' }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookie
      }
    }
  );
}
