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
export interface ApiResponse<T = unknown> {
  /** Whether the request was successful */
  success: boolean;
  
  /** Response data (present when success is true) */
  data?: T;
  
  /** Error message (present when success is false) */
  error?: string;
  
  /** Timestamp of when the response was generated */
  timestamp: number;
  
  /** Optional request ID for tracing */
  requestId?: string;
}

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

/**
 * Creates a standardized API response
 * @template T - The type of the data being returned
 * @param {T} data - The response data
 * @param {ApiResponseOptions} [options] - Response configuration options
 * @returns {Response} A Response object with the formatted API response
 */
export function createApiResponse<T = any>(
  data: T,
  { status = 200, headers = {}, requestId, duration }: ApiResponseOptions = {}
) {
  const response: ApiResponse<T> = {
    success: status >= 200 && status < 300,
    data,
    timestamp: Date.now(),
  };

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
