/**
 * Server-side API response utilities
 * 
 * This module provides helpers for creating consistent API responses with proper typing,
 * status codes, and headers. It's designed to be used in server-side API routes.
 */

/**
 * Standard API response format
 * @template T - Type of the data payload
 */
export interface BaseApiResponse<T = unknown> {
  success: boolean;
  timestamp: number;
  requestId?: string;
}

export interface SuccessResponse<T> extends BaseApiResponse<T> {
  success: true;
  data: T; // Required when success is true
}

export interface ErrorResponse<T = unknown> extends BaseApiResponse<T> {
  success: false;
  error: string;
  data?: T;
} 
 
export type ApiResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;
/**
 * Options for creating an API response
 * @interface ApiResponseOptions
 * @property {number} [status=200] - HTTP status code
 * @property {Record<string, string>} [headers={}] - Additional response headers
 * @property {string} [requestId] - Unique request identifier for tracing
 * @property {number} [duration] - Request processing time in milliseconds
 */
type ApiResponseOptions = {
  status?: number;
  headers?: Record<string, string>;
  requestId?: string;
  duration?: number;
};

export function createApiResponse<T = any>(
  data: T,
  { status = 200, headers = {}, requestId, duration }: ApiResponseOptions = {}
) {
  const isSuccess = status >= 200 && status < 300;

  const response: ApiResponse<T> = isSuccess
  ? {
      success: true,
      data,
      timestamp: Date.now(),
    }
  : {
      success: false,
      error: typeof data === 'string' ? data : 'Request failed',
      timestamp: Date.now(),
      ...(typeof data !== 'string' && { data }),
  }

  if (requestId) {
    response.requestId = requestId;
  }

  const responseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (requestId) {
    responseHeaders['X-Request-ID'] = requestId;
  }

  if (duration !== undefined) {
    responseHeaders['X-Process-Time'] = `${duration}ms`;
  }

  return new Response(JSON.stringify(response), {
    status,
    headers: responseHeaders,
  });
}

/**
 * Creates a standardized error response
 * @template T - The type of the error details
 * @param {string} error - Error message
 * @param {number} [status=500] - HTTP status code
 * @param {T} [details] - Additional error details
 * @param {Omit<ApiResponseOptions, 'status'>} [options] - Additional response options
 * @returns {Response} A Response object with the error details
 */
export function createErrorResponse<T = any>(
  error: string,
  status: number = 500,
  details?: T,
  options: Omit<ApiResponseOptions, 'status'> = {}
) {
  const response: ApiResponse<T> = {
    success: false,
    error,
    timestamp: Date.now(),
  };

  if (details) {
    response.data = details;
  }
  
  if (options.requestId) {
    response.requestId = options.requestId;
  }

  return createApiResponse(response, { ...options, status });
}

/**
 * Generates a unique request ID
 * @returns {string} A unique request identifier
 */
export function generateRequestId() {
  return Math.random().toString(36).substring(2, 9);
}
