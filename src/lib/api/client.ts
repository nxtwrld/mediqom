/**
 * API Client Wrapper
 *
 * Provides a unified fetch interface that works for both web and mobile:
 * - Web: Uses relative URLs with cookie-based authentication
 * - Mobile: Uses absolute URLs with Bearer token authentication
 */

import { browser } from '$app/environment';
import { getApiBaseUrl, isNativePlatform } from '$lib/config/platform';
import { getClient } from '$lib/supabase';
import { session as CurrentSession } from '$lib/user';

export interface ApiRequestOptions extends RequestInit {
  /** Skip adding authorization header */
  skipAuth?: boolean;
  /** Custom timeout in milliseconds */
  timeout?: number;
  /** Pass SvelteKit's fetch for SSR compatibility */
  fetch?: typeof globalThis.fetch;
}

export interface ApiResponse<T = unknown> extends Response {
  data?: T;
}

/**
 * Get the current session access token.
 *
 * Fast path: read from the synchronously-updated session store.
 * On mobile, capacitor/auth.ts calls CurrentSession.set() before goto(), so
 * the store is guaranteed to hold the token when load functions run.
 * Falls back to the Supabase client for cold starts and token refresh cases.
 */
async function getAccessToken(): Promise<string | null> {
  if (!browser) return null;

  const storedSession = CurrentSession.get();
  if (storedSession?.access_token) {
    return storedSession.access_token;
  }

  try {
    const supabase = getClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  } catch (error) {
    console.error('[API Client] Failed to get access token:', error);
    return null;
  }
}

/**
 * Build the full URL for an API request
 */
function buildUrl(endpoint: string): string {
  // If already absolute URL, return as-is
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }

  const baseUrl = getApiBaseUrl();

  // Ensure endpoint starts with /
  let normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // On mobile builds, add trailing slash to avoid 308 redirect from the SvelteKit
  // server (trailingSlash = "always"). iOS WKWebView strips Authorization on redirect.
  if (baseUrl && !normalizedEndpoint.endsWith('/')) {
    const queryIdx = normalizedEndpoint.indexOf('?');
    if (queryIdx === -1) {
      normalizedEndpoint = `${normalizedEndpoint}/`;
    } else {
      normalizedEndpoint =
        `${normalizedEndpoint.slice(0, queryIdx)}/${normalizedEndpoint.slice(queryIdx)}`;
    }
  }

  return `${baseUrl}${normalizedEndpoint}`;
}

/**
 * Perform an API fetch with automatic authentication and base URL handling
 *
 * @param endpoint - API endpoint (e.g., '/v1/med/user')
 * @param options - Fetch options
 * @returns Response object
 */
export async function apiFetch(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<Response> {
  const { skipAuth = false, timeout = 30000, fetch: fetchFn = globalThis.fetch, ...fetchOptions } = options;

  const url = buildUrl(endpoint);

  // Build headers
  const headers = new Headers(fetchOptions.headers);

  // For native platform, add Authorization header
  if (isNativePlatform() && !skipAuth) {
    const token = await getAccessToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  // Ensure JSON content type for POST/PUT/PATCH if not set
  if (
    fetchOptions.body &&
    typeof fetchOptions.body === 'string' &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetchFn(url, {
      ...fetchOptions,
      headers,
      // On web, include credentials (cookies); on mobile, omit them
      credentials: isNativePlatform() ? 'omit' : 'include',
      signal: controller.signal,
    });

    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Perform a GET request
 */
export async function apiGet<T = unknown>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const response = await apiFetch(endpoint, { ...options, method: 'GET' });

  if (!response.ok) {
    throw new ApiError(response.status, `GET ${endpoint} failed`, await response.text());
  }

  return response.json();
}

/**
 * Perform a POST request
 */
export async function apiPost<T = unknown>(
  endpoint: string,
  data?: unknown,
  options: ApiRequestOptions = {}
): Promise<T> {
  const response = await apiFetch(endpoint, {
    ...options,
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });

  if (!response.ok) {
    throw new ApiError(response.status, `POST ${endpoint} failed`, await response.text());
  }

  return response.json();
}

/**
 * Perform a PUT request
 */
export async function apiPut<T = unknown>(
  endpoint: string,
  data?: unknown,
  options: ApiRequestOptions = {}
): Promise<T> {
  const response = await apiFetch(endpoint, {
    ...options,
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  });

  if (!response.ok) {
    throw new ApiError(response.status, `PUT ${endpoint} failed`, await response.text());
  }

  return response.json();
}

/**
 * Perform a DELETE request
 */
export async function apiDelete<T = unknown>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const response = await apiFetch(endpoint, { ...options, method: 'DELETE' });

  if (!response.ok) {
    throw new ApiError(response.status, `DELETE ${endpoint} failed`, await response.text());
  }

  return response.json();
}

/**
 * Custom API Error class
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }
}

/**
 * Create a fetch function that can be passed to SvelteKit load functions
 * This wraps the provided fetch with mobile-specific auth handling
 */
export function createMobileFetch(originalFetch: typeof fetch): typeof fetch {
  if (!isNativePlatform()) {
    // On web, just return the original fetch
    return originalFetch;
  }

  // On mobile, wrap with auth token injection
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // Only modify API calls (not external resources)
    if (url.startsWith('/v1/') || url.includes('/v1/')) {
      const token = await getAccessToken();
      const headers = new Headers(init?.headers);

      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      return originalFetch(buildUrl(url), {
        ...init,
        headers,
        credentials: 'omit',
      });
    }

    // For non-API calls, use original fetch
    return originalFetch(input, init);
  };
}
