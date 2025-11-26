import { withAuth } from '~/middleware/auth';

function json(data: any, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

export const POST = withAuth(async () => {
  return json({ message: 'Authenticated' });
});
