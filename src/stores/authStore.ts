/**
 * AuthStore — in-memory auth state. NOT persisted.
 *
 * Token lives only in Zustand memory. App restart = re-authenticate.
 * Never add `persist` middleware to this store.
 */

import { create } from 'zustand';
import { request } from '@/api/core';

// API response types
interface UserResponse {
  id: string;
  username: string;
}

interface LoginResponse {
  token: string;
  user_id: string;
  username: string;
}

interface AuthState {
  // State
  token: string | null;
  userId: string | null;
  username: string | null;
  isAuthenticated: boolean;

  // Actions
  login: (token: string, userId: string, username: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  token: null,
  userId: null,
  username: null,
  isAuthenticated: false,

  login: (token, userId, username) =>
    set({ token, userId, username, isAuthenticated: true }),

  logout: () => {
    // Clear all cached query data — prevents stale data from previous session
    // showing briefly on re-login ("browser gets messed up")
    import('@/main').then(m => m.queryClient.clear()).catch(() => {});
    set({ token: null, userId: null, username: null, isAuthenticated: false });
  },
}));

// API functions (not in store — pure async)

export async function fetchUsers(): Promise<UserResponse[]> {
  return request<UserResponse[]>('/auth/users');
}

export async function createUser(
  username: string,
  pin: string
): Promise<UserResponse> {
  return request<UserResponse>('/auth/users', {
    method: 'POST',
    body: { username, pin },
  });
}

export async function attemptLogin(
  userId: string,
  pin: string
): Promise<{ ok: true; data: LoginResponse } | { ok: false; detail: string }> {
  try {
    const data = await request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { user_id: userId, pin },
    });
    return { ok: true, data };
  } catch (err: unknown) {
    const detail =
      err instanceof Error ? err.message : 'Login failed';
    return { ok: false, detail };
  }
}

export async function logoutApi(token: string): Promise<void> {
  await request<void>('/auth/logout', {
    method: 'POST',
    body: {},
    headers: { 'X-Session-Token': token },
  });
}
