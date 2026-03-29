/**
 * Client-side API utilities
 * 
 * This module provides helpers for making consistent API calls from the client side,
 * including request ID generation and standardized error handling.
 */

import { useAuth } from '../contexts/AuthContext';

/**
 * Generates a unique request ID for client-side API calls
 * @returns {string} A unique request identifier
 */
export function generateRequestId() {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Standard API response format from the server
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
 * Makes an authenticated API call with JWT token and standard headers
 * @param {string} url - The API endpoint URL
 * @param {RequestInit} options - Fetch options (method, headers, body, etc.)
 * @param {string} token - JWT token for authentication
 * @returns {Promise<Response>} The fetch response
 */
export async function makeApiCall(
  url: string, 
  options: RequestInit = {}, 
  token?: string
): Promise<Response> {
  const requestId = generateRequestId();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-ID': requestId,
    ...((options.headers as Record<string, string>) || {})
  };

  // Add JWT Authorization header if token is provided
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const fetchOptions: RequestInit = {
    ...options,
    headers
  };

  console.log(`[${requestId}] Making ${options.method || 'GET'} request to ${url}`);
  
  const response = await fetch(url, fetchOptions);
  
  if (!response.ok) {
    console.error(`[${requestId}] API error: ${response.status} ${response.statusText}`);
  } else {
    console.log(`[${requestId}] API success: ${response.status}`);
  }
  
  return response;
}

/**
 * Makes an authenticated API call with automatic JWT token retrieval
 * @param {string} url - The API endpoint URL
 * @param {RequestInit} options - Fetch options (method, headers, body, etc.)
 * @returns {Promise<Response>} The fetch response
 */
export async function makeAuthenticatedApiCall(
  url: string, 
  options: RequestInit = {}
): Promise<Response> {
  // Get the auth token - this will work in client components
  const auth = useAuth();
  const token = auth.getToken();
  
  if (!token) {
    throw new Error('No authentication token available');
  }
  
  return makeApiCall(url, options, token);
}

/**
 * Parses a standardized API response and handles errors
 * @param {Response} response - The fetch response
 * @param {string} requestId - The request ID for logging
 * @returns {Promise<ApiResponse<T>>} The parsed API response
 * @template T - Type of the expected data
 */
export async function parseApiResponse<T = any>(
  response: Response, 
  requestId: string
): Promise<ApiResponse<T>> {
  try {
    const result = await response.json();
    
    if (!result.success) {
      console.error(`[${requestId}] API returned error:`, result.error);
      throw new Error(result.error || 'API request failed');
    }
    
    return result;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    console.error(`[${requestId}] Failed to parse API response:`, error);
    throw new Error('Failed to parse API response');
  }
}
