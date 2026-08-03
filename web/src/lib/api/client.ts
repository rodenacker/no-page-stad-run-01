/**
 * Base API Client Template
 *
 * A reusable fetch wrapper providing:
 * - Error handling for common HTTP status codes
 * - Automatic JSON parsing
 * - Request/response logging for development
 * - Type-safe API responses
 *
 * USAGE:
 * 1. Address endpoints by their same-origin path (see the API path constants in
 *    constants.ts); `next.config.ts` forwards each path to the service that owns
 *    it. Server-side callers, which cannot fetch a relative path, pass an explicit
 *    `baseUrl`.
 * 2. Define your API endpoints as functions that call apiClient
 * 3. Customize error handling and logging as needed
 *
 * AUTHENTICATION: this project is cookie-session only. The browser attaches the
 * HttpOnly `session` cookie to same-origin calls by itself, and the frontend holds
 * no token or static credential of any kind — so this client sends no auth header
 * (project.md §Authentication, epic brief BR2). A server-side caller forwards the
 * incoming session explicitly via a `Cookie` header.
 */

import { CLIENT_FALLBACK_MESSAGES } from '@/lib/api/errors';
import { API_BASE_PATH } from '@/lib/utils/constants';
import type {
  APIError,
  APIRequestConfig,
  DefaultResponse,
  ErrorResponse,
  HTTPStatusCode,
  QueryParams,
} from '@/types/api';

/**
 * Main API client function that wraps fetch with error handling and logging
 *
 * @param endpoint - API endpoint path (e.g., '/v1/resource')
 * @param config - Request configuration including method, body, headers, etc.
 * @returns Promise with parsed JSON response
 * @throws APIError on HTTP errors or network failures
 */
export async function apiClient<T = unknown>(
  endpoint: string,
  config: APIRequestConfig = {},
): Promise<T> {
  const { params, lastChangedUser, isBinaryResponse, baseUrl, ...fetchConfig } =
    config;

  // Build full URL with query parameters
  const url = buildUrl(endpoint, params, baseUrl);

  // Build headers
  const headers = buildHeaders(
    fetchConfig.method,
    lastChangedUser,
    fetchConfig.headers,
    fetchConfig.body ?? undefined,
  );

  // Log request in development
  logRequest(url, fetchConfig.method || 'GET', fetchConfig.body ?? undefined);

  try {
    const response = await fetch(url, {
      ...fetchConfig,
      headers,
      body: fetchConfig.body ?? undefined,
    });

    // Log response in development
    logResponse(response);

    // Handle specific error status codes
    if (!response.ok) {
      await handleErrorResponse(response, url);
    }

    // Handle successful responses
    return await handleSuccessResponse<T>(response, isBinaryResponse);
  } catch (error) {
    // Handle network errors or other unexpected errors
    if (error instanceof Error && error.name === 'TypeError') {
      throw createAPIError(
        CLIENT_FALLBACK_MESSAGES.network,
        0,
        ['Please check your internet connection and try again.'],
        url,
      );
    }

    // Re-throw API errors
    throw error;
  }
}

/**
 * Builds the full URL with query parameters.
 *
 * `baseUrl` defaults to the same-origin `API_BASE_PATH`, which is what browser
 * calls use. A server-side caller passes the target service's address explicitly,
 * because a relative path cannot be fetched from the Next.js server process.
 *
 * Array values serialize as repeated params (`['a','b']` → `?k=a&k=b`); for
 * `explode: false` APIs, join at the endpoint-function layer. Empty arrays and
 * `undefined` values drop the key entirely (the "clear all filters" path). An
 * explicit empty string IS sent for scalars (`?k=`) — caller chose that. Array
 * items that are empty strings are dropped, since an array of empty strings is
 * never a meaningful filter selection.
 */
function buildUrl(
  endpoint: string,
  params?: QueryParams,
  baseUrl?: string,
): string {
  const requestUrl = `${baseUrl ?? API_BASE_PATH}${endpoint}`;

  if (!params) {
    return requestUrl;
  }

  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== '') {
          queryParams.append(key, String(item));
        }
      });
      return;
    }
    queryParams.append(key, String(value));
  });

  const queryString = queryParams.toString();
  return queryString ? `${requestUrl}?${queryString}` : requestUrl;
}

/**
 * Builds request headers
 * Only sets Content-Type when there's a request body
 * Sends no credential header: authentication travels in the browser-managed
 * `session` cookie, or — for a server-side call — in a `Cookie` header the caller
 * supplies explicitly (project.md §Authentication, epic brief BR2)
 */
function buildHeaders(
  method?: string,
  lastChangedUser?: string,
  customHeaders?: HeadersInit,
  body?: BodyInit,
): Record<string, string> {
  const baseHeaders: Record<string, string> = {};

  // Convert HeadersInit to plain object if needed
  if (customHeaders) {
    if (customHeaders instanceof Headers) {
      customHeaders.forEach((value, key) => {
        baseHeaders[key] = value;
      });
    } else if (Array.isArray(customHeaders)) {
      customHeaders.forEach(([key, value]) => {
        baseHeaders[key] = value;
      });
    } else {
      Object.assign(baseHeaders, customHeaders);
    }
  }

  // Only set Content-Type for requests with a body
  const hasBody = body !== undefined;
  const methodsWithBody = ['POST', 'PUT', 'PATCH'];
  const shouldSetContentType =
    hasBody || (method && methodsWithBody.includes(method.toUpperCase()));

  if (shouldSetContentType && !baseHeaders['Content-Type']) {
    baseHeaders['Content-Type'] = 'application/json';
  }

  // Add custom headers (e.g., LastChangedUser for audit trails)
  if (lastChangedUser) {
    baseHeaders['LastChangedUser'] = lastChangedUser;
  }

  return baseHeaders;
}

/**
 * The human-readable message a failed response carries, if any.
 *
 * Two body shapes are in play across this project's services, and BOTH have to be
 * read: the `DefaultResponse` envelope (`Messages[]`) and the `ErrorResponse`
 * shape (`{ Error, Message }`) that `documentation/auth-api.yaml` returns on a
 * rejected call. Reading only the envelope is how the service's own wording gets
 * thrown away and the user is shown a bare status line instead (epic
 * `sign-in-and-app-shell` AC-5).
 */
function readableMessagesOf(body: unknown): string[] {
  if (typeof body !== 'object' || body === null) {
    return [];
  }
  const { Messages, Message } = body as Partial<DefaultResponse> &
    Partial<ErrorResponse>;

  if (Array.isArray(Messages)) {
    const messages = Messages.filter(
      (message): message is string =>
        typeof message === 'string' && message.trim() !== '',
    );
    if (messages.length > 0) {
      return messages;
    }
  }
  if (typeof Message === 'string' && Message.trim() !== '') {
    return [Message];
  }
  return [];
}

/**
 * Handles error responses from the API
 * Customize this function based on your API's error response format
 */
async function handleErrorResponse(
  response: Response,
  url: string,
): Promise<never> {
  const statusCode = response.status as HTTPStatusCode;

  // Try to extract error details from response body
  let errorMessages: string[] = [];
  let defaultMessage = `HTTP ${statusCode}: ${response.statusText}`;

  try {
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const errorData = (await response.json()) as
        | (Partial<DefaultResponse> & Partial<ErrorResponse>)
        | null;

      errorMessages = readableMessagesOf(errorData);
      if (errorMessages.length > 0) {
        defaultMessage = errorMessages[0];
      } else if (errorData?.MessageType) {
        defaultMessage = `${errorData.MessageType}: ${defaultMessage}`;
      }
    }
  } catch {
    // If parsing fails, use default error message
  }

  // Handle specific status codes
  // Customize these messages based on your application's needs
  switch (statusCode) {
    // A rejected sign-in arrives here, and the auth service's own reason for the
    // refusal — a temporary lockout and when it can be retried, say — is the whole
    // point of the response, so it is preferred over the generic line below.
    case 401:
      throw createAPIError(
        errorMessages.length > 0
          ? errorMessages[0]
          : CLIENT_FALLBACK_MESSAGES.unauthorized,
        statusCode,
        errorMessages.length > 0
          ? errorMessages
          : ['Your session may have expired. Please log in again.'],
        url,
      );

    case 403:
      throw createAPIError(
        CLIENT_FALLBACK_MESSAGES.forbidden,
        statusCode,
        errorMessages.length > 0 ? errorMessages : ['Access denied.'],
        url,
      );

    case 404:
      throw createAPIError(
        CLIENT_FALLBACK_MESSAGES.notFound,
        statusCode,
        errorMessages.length > 0 ? errorMessages : ['Resource not found.'],
        url,
      );

    case 500:
      throw createAPIError(
        CLIENT_FALLBACK_MESSAGES.serverError,
        statusCode,
        errorMessages.length > 0
          ? errorMessages
          : [
              'Please try again later or contact support if the problem persists.',
            ],
        url,
      );

    default:
      throw createAPIError(
        defaultMessage,
        statusCode,
        errorMessages.length > 0
          ? errorMessages
          : [`Request failed with status ${statusCode}`],
        url,
      );
  }
}

/**
 * Handles successful API responses
 * Parses JSON or returns void for 204 No Content responses
 * For binary responses, returns a Blob
 */
async function handleSuccessResponse<T>(
  response: Response,
  isBinaryResponse?: boolean,
): Promise<T> {
  // Handle 204 No Content responses (e.g., DELETE operations)
  if (response.status === 204) {
    return undefined as T;
  }

  // If explicitly marked as binary response, always return blob
  if (isBinaryResponse) {
    return (await response.blob()) as T;
  }

  const contentType = response.headers.get('content-type');

  // Handle JSON responses
  if (contentType && contentType.includes('application/json')) {
    return (await response.json()) as T;
  }

  // Handle binary responses (e.g., file downloads)
  if (contentType && contentType.includes('application/octet-stream')) {
    return (await response.blob()) as T;
  }

  // Fallback: try to parse as JSON
  try {
    return (await response.json()) as T;
  } catch {
    // If JSON parsing fails, return undefined
    return undefined as T;
  }
}

/**
 * Creates a standardized APIError object
 */
function createAPIError(
  message: string,
  statusCode: number,
  details: string[],
  endpoint: string,
): APIError {
  return {
    message,
    statusCode,
    details,
    endpoint,
  };
}

/**
 * Sanitizes request body for safe logging by removing sensitive fields
 * Customize the sensitiveFields array based on your application's needs
 */
function sanitizeBodyForLogging(body: BodyInit | null): unknown {
  if (!body) {
    return null;
  }

  try {
    const parsed = JSON.parse(body as string);
    const sensitiveFields = [
      'password',
      'token',
      'apiKey',
      'secret',
      'creditCard',
      'ssn',
    ];

    // Create a sanitized copy
    const sanitized = { ...parsed };

    // Remove or mask sensitive fields
    Object.keys(sanitized).forEach((key) => {
      if (sensitiveFields.some((field) => key.toLowerCase().includes(field))) {
        sanitized[key] = '***REDACTED***';
      }
    });

    return sanitized;
  } catch {
    return '[Unable to parse body]';
  }
}

/**
 * Logs API request details in development mode
 * Automatically sanitizes sensitive fields for security
 */
function logRequest(url: string, method: string, body?: BodyInit | null): void {
  if (process.env.NODE_ENV === 'development') {
    console.group(`API Request: ${method} ${url}`);
    console.log('URL:', url);
    console.log('Method:', method);

    if (body) {
      console.log('Body:', sanitizeBodyForLogging(body));
    }

    console.groupEnd();
  }
}

/**
 * Logs API response details in development mode
 */
function logResponse(response: Response): void {
  if (process.env.NODE_ENV === 'development') {
    const statusEmoji = response.ok ? '✅' : '❌';
    console.log(
      `${statusEmoji} API Response: ${response.status} ${response.statusText}`,
    );
  }
}

/**
 * Convenience method for GET requests
 */
export async function get<T>(
  endpoint: string,
  params?: QueryParams,
): Promise<T> {
  return apiClient<T>(endpoint, { method: 'GET', params });
}

/**
 * Convenience method for POST requests
 */
export async function post<T>(
  endpoint: string,
  body?: unknown,
  lastChangedUser?: string,
): Promise<T> {
  return apiClient<T>(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
    lastChangedUser,
  });
}

/**
 * Convenience method for PUT requests
 */
export async function put<T>(
  endpoint: string,
  body?: unknown,
  lastChangedUser?: string,
): Promise<T> {
  return apiClient<T>(endpoint, {
    method: 'PUT',
    body: JSON.stringify(body),
    lastChangedUser,
  });
}

/**
 * Convenience method for DELETE requests
 */
export async function del<T>(
  endpoint: string,
  lastChangedUser?: string,
): Promise<T> {
  return apiClient<T>(endpoint, { method: 'DELETE', lastChangedUser });
}
