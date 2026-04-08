import { getAuthUser, getTokenFromRequest } from '~/lib/server/auth/jwt';
import { createApiResponse } from '~/utils/api';  // Add this import

export const GET = async ({ request }: { request: Request }) => {
  try {
    const user = await getAuthUser(request);
    
    if (!user) {
      return createApiResponse(
        { valid: false, message: 'No valid session found' },
        { status: 200 }
      );
    }

    return createApiResponse({
      valid: true,
      user: {
        id: user.userId,
        username: user.username,
        role: user.role || 'user',
        token: getTokenFromRequest(request)
      }
    });
  } catch (error) {
    return createApiResponse(
      { valid: false, message: 'Error verifying session' },
      { status: 500 }
    );
  }
};