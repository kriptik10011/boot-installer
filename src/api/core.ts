/**
 * API Core — IPC bridge, HTTP fallback, base fetch, error handling.
 *
 * All domain API files import `request` and `getAuthHeaders` from here.
 */

import { config } from '@/config';
import { useAuthStore } from '@/stores/authStore';

export const API_BASE_URL = config.api.baseUrl;

// Auth token retrieved from Tauri at startup (null in dev mode)
let authToken: string | null = null;

/**
 * Initialize the auth token from Tauri.
 * Must be called once at app startup before any API requests.
 * In dev mode (no Tauri), this gracefully falls back to no auth.
 */
export async function initAuthToken(): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    authToken = await invoke<string>('get_auth_token');
  } catch {
    // Dev mode — no Tauri runtime, no token needed
    authToken = null;
  }
}

/**
 * Get auth headers for direct fetch calls (backup export, file uploads).
 */
export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  const sessionToken = useAuthStore.getState().token;
  if (sessionToken) {
    headers['X-Session-Token'] = sessionToken;
  }
  return headers;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

let logoutInProgress = false;
let viewTransitioning = false;

/** Suppress 401 auto-logout during view transitions (React.lazy unmount race) */
export function setViewTransitioning(value: boolean) {
  viewTransitioning = value;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public detail?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {} } = options;

  const requestConfig: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...headers,
    },
  };

  if (body) {
    requestConfig.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, requestConfig);

  if (!response.ok) {
    const errorData = await response.json().catch(() => {
      return {};
    });

    // Auto-logout on 401 — prevents "authenticated but can't fetch" limbo.
    // Deduplication guard: multiple in-flight requests may all get 401
    // simultaneously when session expires. Only fire logout once.
    if (response.status === 401 && !viewTransitioning) {
      if (!logoutInProgress) {
        logoutInProgress = true;
        const currentToken = useAuthStore.getState().token;
        if (currentToken) {
          void import('@/stores/authStore').then(m =>
            m.logoutApi(currentToken).catch(() => {})
          );
        }
        useAuthStore.getState().logout();
        setTimeout(() => { logoutInProgress = false; }, 100);
      }
    }

    throw new ApiError(
      `API Error: ${response.statusText}`,
      response.status,
      errorData.detail
    );
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  try {
    return await response.json();
  } catch {
    throw new Error('Failed to parse API response');
  }
}
